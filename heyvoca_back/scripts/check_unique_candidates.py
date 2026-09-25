"""유니크 제약 후보 점검 — 추가하려는 제약에 걸릴 중복 행이 있는지, 이미 있어야 할 유니크 인덱스가
실제 DB 에 있는지 본다. **읽기만 한다**(아무것도 바꾸지 않는다).

배경 (2026-09 동시성 전수 점검)
  "있는지 조회 → 없으면 INSERT" 경로는 이제 사용자 단위 잠금(`app/utils/db_lock.begin_user_tx`)으로
  직렬화했다. DB 유니크 제약은 그 위의 마지막 방어선이다. 다만 운영 DB 에 이미 중복이 있으면
  `flask db upgrade` 가 실패해 컨테이너가 뜨지 않으므로, 마이그레이션을 배포하기 전에 이 스크립트로
  dev/prod 를 먼저 확인한다.

실행 (compose 가 ./scripts 를 마운트해 컨테이너 안 스크립트가 가려지므로 stdin 방식)
  docker exec -i -w /app heyvoca_back_<env> python3 - < heyvoca_back/scripts/check_unique_candidates.py

  <env> = local | dev | prod. 종료코드 0 = 막는 문제 없음, 1 = 배포 전에 정리할 중복/누락이 있음.
  출력에는 id 앞 8자와 건수만 쓴다(이메일·이름·단어 원문 등 개인정보 출력 금지).

판정 표기
  [OK]    — 중복 없음 / 인덱스 있음
  [DUP]   — 제약을 걸면 실패할 중복이 있음 (마이그레이션 배포 전 정리 필요)
  [MISS]  — 코드가 전제하는 유니크 인덱스가 이 DB 에 없음
  [INFO]  — 제약으로 막을 수 없는 조건(부분 유니크 등)의 현황. 과거 경합 흔적 확인용
"""

import sys
from collections import Counter

from sqlalchemy import and_, cast, func, text
from sqlalchemy.types import LargeBinary

from run import app

from app import db
from app.models.models import (Bookstore, FarmEvent, FarmEventLog, FarmItemReason, GemLog,
                               InviteMap, User, UserComebackMission, UserFarmItemLog,
                               UserRecentStudy, UserVoca, UserVocaBookMap)

SAMPLE = 5
problems = []


def _short(v):
    s = str(v)
    return s[:8]


def _report(tag, title, rows, sample_key=None, blocking=True):
    """rows: [(키…, count)] — 중복 그룹 목록."""
    n = len(rows)
    extra = sum(int(r[-1]) - 1 for r in rows) if rows else 0
    if n == 0:
        print('[OK]    {}'.format(title))
        return
    print('[{}] {} — 중복 그룹 {}개(초과 행 {}개)'.format(tag, title, n, extra))
    for r in rows[:SAMPLE]:
        key = sample_key(r) if sample_key else _short(r[0])
        print('          예: {} ×{}'.format(key, r[-1]))
    if blocking:
        problems.append(title)


def _dups(query_cols, *filters):
    q = db.session.query(*query_cols, func.count().label('n'))
    for f in filters:
        q = q.filter(f)
    return q.group_by(*query_cols).having(func.count() > 1).all()


def _indexes(engine, table):
    """SHOW INDEX (스키마 확인 전용) → {index_name: (non_unique, [cols])}."""
    out = {}
    with engine.connect() as conn:
        for r in conn.execute(text('SHOW INDEX FROM `{}`'.format(table))):
            m = r._mapping
            name = m['Key_name']
            non_unique = int(m['Non_unique'])
            cols = out.setdefault(name, (non_unique, []))[1]
            cols.append((int(m['Seq_in_index']), m['Column_name']))
    return {k: (v[0], [c for _, c in sorted(v[1])]) for k, v in out.items()}


def _has_unique(engine, table, cols):
    for _name, (non_unique, icols) in _indexes(engine, table).items():
        if non_unique == 0 and icols == list(cols):
            return True
    return False


def main():
    user_engine = db.get_engine(app)
    dict_engine = db.get_engine(app, bind='dict')

    print('=== 1. 코드가 전제하는 유니크 인덱스(없으면 체크-후-삽입 경합의 마지막 방어선이 없다) ===')
    expected = [
        (user_engine, 'user', ['email'], '로그인 동시 첫 가입 → 같은 이메일 계정 2개'),
        (user_engine, 'user', ['google_id'], '구글 로그인 동시 첫 가입'),
        (user_engine, 'user_voca_book_map', ['user_voca_book_id', 'user_voca_id'], '같은 단어장에 같은 단어 매핑 2개'),
        (user_engine, 'user_recent_study', ['user_id', 'type'], '최근 학습 upsert'),
        (user_engine, 'purchase', ['transaction_id', 'platform'], '영수증 이중 지급'),
        (user_engine, 'user_onboarding_mission', ['user_id', 'mission_key'], '온보딩 미션 이중 보상'),
        (user_engine, 'user_question_type_stat', ['user_id', 'question_type'], '문제 유형 통계 행 중복'),
        (user_engine, 'check_in', ['user_id', 'attendence_date'], '하루 출석 행 중복(PK)'),
        (user_engine, 'user_goals', ['user_id', 'goal_id'], '목표 행 중복(PK)'),
        (user_engine, 'user_farm_item', ['user_id', 'item_type'], '아이템 행 중복(PK)'),
        (user_engine, 'user_streak', ['user_id'], '연속 기록 행 중복(PK)'),
        (user_engine, 'user_combo', ['user_id'], '콤보 행 중복(PK)'),
        (user_engine, 'user_voca_game', ['user_voca_id'], '게임 행 중복(PK)'),
        (user_engine, 'user_farm_setting', ['user_id'], '농장 설정 행 중복(PK)'),
        (user_engine, 'user_farm_migration', ['user_id'], '전환 기록 중복(PK)'),
        (user_engine, 'user_has_token', ['user_id', 'token'], 'FCM 토큰 중복(PK)'),
        (user_engine, 'invite_map', ['inviter_id', 'invitee_id'], '초대 관계 중복(PK)'),
    ]
    for engine, table, cols, why in expected:
        ok = _has_unique(engine, table, cols)
        title = '{}({}) — {}'.format(table, ','.join(cols), why)
        if ok:
            print('[OK]    ' + title)
        else:
            print('[MISS]  ' + title)
            problems.append(title)

    print()
    print('=== 2. 새 유니크 제약 후보 — 중복이 있으면 해당 마이그레이션을 배포하지 말 것 ===')
    has_apple_uq = _has_unique(user_engine, 'user', ['apple_id'])
    _report('DUP', 'user.apple_id (마이그레이션 c4d1e7a9b203 이 추가){}'.format(
                ' — 이미 적용됨' if has_apple_uq else ''),
            _dups([User.apple_id], User.apple_id.isnot(None)))
    has_invitee_uq = _has_unique(user_engine, 'invite_map', ['invitee_id'])
    _report('DUP', 'invite_map.invitee_id (마이그레이션 c4d1e7a9b203 이 추가){}'.format(
                ' — 이미 적용됨' if has_invitee_uq else ''),
            _dups([InviteMap.invitee_id]))

    # 아래는 이번에 마이그레이션을 만들지 않은 후보 — 결과를 보고 판단한다.
    _report('DUP', 'user.invite_code (후보: 초대 코드 조회가 1행을 전제)',
            _dups([User.invite_code], User.invite_code.isnot(None)))
    # (user_id, dict_lang, word) — DB 기본 콜레이션은 대소문자를 구분하지 않는다. 'Apple'·'apple' 이
    # 따로 있는 사용자가 있으면 콜레이션 기준 유니크는 걸 수 없다(두 번째 줄이 그 수).
    _report('DUP', 'user_voca(user_id, dict_lang, word) — 정확히 같은 표기(BINARY)',
            _dups([UserVoca.user_id, UserVoca.dict_lang, cast(UserVoca.word, LargeBinary)],
                  UserVoca.word.isnot(None)),
            sample_key=lambda r: '{}/{}'.format(_short(r[0]), r[1]))
    _report('DUP', 'user_voca(user_id, dict_lang, word) — 콜레이션 기준(대소문자 무시)',
            _dups([UserVoca.user_id, UserVoca.dict_lang, UserVoca.word], UserVoca.word.isnot(None)),
            sample_key=lambda r: '{}/{}'.format(_short(r[0]), r[1]))
    _report('DUP', 'bookstore.admin_voca_book_id (사전 DB 후보: 서점 등록 토글)',
            _dups([Bookstore.admin_voca_book_id], Bookstore.admin_voca_book_id.isnot(None)),
            sample_key=lambda r: 'admin_voca_book #{}'.format(r[0]))
    # 1절에서 MISS 면 중복부터 본다
    if not _has_unique(user_engine, 'user_voca_book_map', ['user_voca_book_id', 'user_voca_id']):
        _report('DUP', 'user_voca_book_map(user_voca_book_id, user_voca_id)',
                _dups([UserVocaBookMap.user_voca_book_id, UserVocaBookMap.user_voca_id]))
    for col in ('email', 'google_id'):
        if not _has_unique(user_engine, 'user', [col]):
            c = getattr(User, col)
            _report('DUP', 'user.{}'.format(col), _dups([c], c.isnot(None)))
    if not _has_unique(user_engine, 'user_recent_study', ['user_id', 'type']):
        _report('DUP', 'user_recent_study(user_id, type)',
                _dups([UserRecentStudy.user_id, UserRecentStudy.type]))

    print()
    print('=== 3. [INFO] 제약으로 못 거는 조건 — 과거 경합 흔적(이번 수정 이전 데이터) ===')
    _report('INFO', 'user_comeback_mission — 사용자당 ACTIVE 2개 이상',
            _dups([UserComebackMission.user_id], UserComebackMission.status == 'ACTIVE'),
            blocking=False)
    # KST 날짜 기준(서버 저장은 UTC) — 하루 1회 보상이 두 번 이상 나간 흔적
    kst_day = func.date(func.date_add(GemLog.created_at, text('INTERVAL 9 HOUR')))
    for src in ('attendance', 'daily_mission'):
        _report('INFO', 'gem_log {} — 같은 사용자·같은 날 2회 이상'.format(src),
                _dups([GemLog.user_id, kst_day], GemLog.source_type == src),
                sample_key=lambda r: '{}/{}'.format(_short(r[0]), r[1]), blocking=False)
    _report('INFO', 'user_farm_item_log 주간 보호권 — 같은 주 2회 이상',
            _dups([UserFarmItemLog.user_id, UserFarmItemLog.description],
                  UserFarmItemLog.reason == FarmItemReason.WEEKLY_GRANT),
            blocking=False)
    fel_day = func.date(FarmEventLog.created_at)
    _report('INFO', 'farm_event_log 무료 긴급 급수 — 같은 단어·같은 날 2회 이상',
            _dups([FarmEventLog.user_id, FarmEventLog.user_voca_id, fel_day],
                  FarmEventLog.event == FarmEvent.PROTECTION_APPLIED),
            sample_key=lambda r: '{}/#{}'.format(_short(r[0]), r[1]), blocking=False)

    print()
    if problems:
        print('결과: 배포 전에 확인할 항목 {}개'.format(len(problems)))
        for p in problems:
            print('  - ' + p)
        return 1
    print('결과: 막는 문제 없음')
    return 0


if __name__ == '__main__':
    with app.app_context():
        code = main()
    sys.exit(code)
