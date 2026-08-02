#!/usr/bin/env python3
"""기존 사용자 → 당근 농장 V2 전환 (기획 15).

이 스크립트는 **되돌릴 수 없는 데이터 이행**이다. 그래서 안전장치가 기능보다 앞선다.

  - `--dry-run` 이 기본값이다. 실제 반영은 `--apply` 를 명시해야만 한다.
    기본값을 반대로 두면 "일단 돌려 보자"가 곧 프로덕션 반영이 된다.
  - 사용자 1명 = 트랜잭션 1개. 중간에 실패해도 그 사용자만 롤백되고 나머지는 계속 간다.
    전체를 한 트랜잭션으로 묶으면 수만 명 중 한 명 때문에 처음부터 다시 돌려야 한다.
  - `user_farm_migration` 행이 있으면 그 사용자는 **무조건 건너뛴다**. 재실행해도
    재화가 두 번 나가지 않는다. 이 테이블의 PK 가 user_id 인 것도 같은 이유다.
  - 사용자 목록은 keyset 페이지네이션으로 배치 단위로만 읽는다. 수만 명을 한 번에
    메모리에 올리지 않는다.

실행 (백엔드 컨테이너 안에서):
    python /app/scripts/farm_v2_migrate.py                  # 미리보기(기본)
    python /app/scripts/farm_v2_migrate.py --user <uuid>    # 한 명만 검증
    python /app/scripts/farm_v2_migrate.py --apply          # 실제 반영
"""

import argparse
import datetime as dt
import os
import sys
import traceback
from collections import Counter
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy import func

# 이 파일은 heyvoca_service/scripts/ 에 있고 컨테이너의 /app/scripts 로 마운트된다.
# (heyvoca_back/scripts/ 에 두면 그 마운트에 가려 컨테이너에서 아예 보이지 않는다.)
# 스크립트를 직접 실행하면 sys.path[0] 가 /app/scripts 라 백엔드 패키지를 못 찾으므로
# 상위 디렉토리(/app)를 넣어 준다.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db   # noqa: E402 — 위의 경로 보정 뒤에 import 해야 한다
from app.models.models import (CheckIn, FarmItem, FarmItemReason, HealthState, User,
                               UserFarmMigration, UserFarmSetting, UserStudyLog, UserVoca,
                               UserVocaGame, VisualStage)
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import events, growth, health, localday, inventory

# 전환 이벤트 이름. FarmEvent 에 상수를 새로 추가하지 않는 이유는 events.py 가 다른 트랙의
# 파일이기 때문이다. event 컬럼이 Enum 이 아니라 String(40) 인 덕에 문자열로 남길 수 있다.
EVENT_MIGRATED = 'V2_MIGRATED'

# 단어 1개 처리에 필요한 로그 집계를 IN 절로 물어볼 때의 묶음 크기.
# 너무 크면 MySQL 이 IN 리스트를 통째로 파싱하느라 느려지고, 너무 작으면 왕복이 늘어난다.
_ID_CHUNK = 500

# 전환 시점에 이미 지나온 단계의 '최초 도달 보상' 플래그를 미리 켜 둔다.
# 켜 두지 않으면 나중에 부패 → 다시 심기 → 재성장으로 같은 보상을 반복 수령할 수 있다.
_REWARD_FLAGS_BY_STAGE = {
    VisualStage.UNPLANTED_SEED: (),
    VisualStage.PLANTED_SEED:   (),
    VisualStage.SPROUT:         ('sprout_rewarded',),
    VisualStage.LEAF:           ('sprout_rewarded', 'leaf_rewarded'),
    VisualStage.CARROT:         ('sprout_rewarded', 'leaf_rewarded', 'carrot_rewarded'),
}

_DAY = dt.timedelta(days=1)


# ──────────────────────────────────────────────────────────────
# 1) 상태 변환 (기획 15.1)
# ──────────────────────────────────────────────────────────────

def load_success_stats(user_id: UUID, voca_ids: List[int], tz_name: str) -> Dict[int, dict]:
    """단어별 '성공 학습' 집계 — {user_voca_id: {cnt, first_at, last_at, multi_day}}.

    서로 다른 현지 학습일 2회 이상인지를 판정할 때 날짜를 전부 세지 않고
    **정답 로그의 최소·최대 시각만** 가져온다. 두 시각의 현지 날짜가 다르면 서로 다른 날이
    최소 2일이고, 같으면 정답이 하루에만 몰려 있다는 뜻이라 정확히 같은 답이 나온다.
    단어 1개당 로그 수십 건을 다 끌어오는 것과 결과는 같고 비용은 행 1개다.

    독립 정답 여부(같은 세션에서 먼저 틀렸는가)는 보지 않는다. 기획 15.1 이
    "정보가 부족하면 사용자에게 불리하게 추정하지 않는다"고 못 박았고, 과거 로그로
    세션 내 순서를 되짚는 비용도 이행 한 번에 치를 값이 아니다.
    """
    stats = {}
    for i in range(0, len(voca_ids), _ID_CHUNK):
        chunk = voca_ids[i:i + _ID_CHUNK]
        rows = (
            db.session.query(
                UserStudyLog.user_voca_id,
                func.count(UserStudyLog.id),
                func.min(UserStudyLog.created_at),
                func.max(UserStudyLog.created_at),
            )
            .filter(
                UserStudyLog.user_id == user_id,
                UserStudyLog.was_correct == True,   # noqa: E712 — SQLAlchemy 표현식
                UserStudyLog.user_voca_id.in_(chunk),
            )
            .group_by(UserStudyLog.user_voca_id)
            .all()
        )
        for voca_id, cnt, first_at, last_at in rows:
            stats[voca_id] = {
                'cnt': int(cnt or 0),
                'first_at': first_at,
                'last_at': last_at,
                'multi_day': bool(
                    first_at and last_at
                    and localday.local_day(first_at, tz_name) != localday.local_day(last_at, tz_name)
                ),
            }
    return stats


def _fsrs_success_count(fsrs_state: dict) -> int:
    """학습 로그가 없는 옛 단어의 성공 횟수 추정 = reps - lapses.

    학습 로그(user_study_log)는 FSRS 도입 시점부터 쌓였다. 그 전에 외운 단어는 로그가
    한 줄도 없는데, 그렇다고 "성공 0회"로 보면 몇 년 쓴 사용자의 단어가 통째로
    보유 씨앗으로 내려앉는다. 기획 15.1 의 "불리하게 추정하지 않는다"에 정면으로 어긋난다.

    FSRS state 의 reps 는 복습 횟수, lapses 는 실패 횟수이므로 그 차이가 성공 횟수의
    가장 가까운 근사값이다. 날짜 정보는 없지만 reps 가 2 이상이면 FSRS 가 간격을 두고
    두 번 이상 복습을 잡았다는 뜻이라 '서로 다른 날'로 보아도 무리가 없다.
    """
    st = fsrs_state or {}
    try:
        reps = int(st.get('reps') or 0)
        lapses = int(st.get('lapses') or 0)
    except (TypeError, ValueError):
        return 0
    return max(0, reps - lapses)


def decide_stage(memory_state: str, stat: Optional[dict], fsrs_state: dict) -> str:
    """FSRS 분류 + 성공 학습 이력 → V2 성장 단계 (기획 15.1).

    중기/장기는 안정성만으로 결정된다(잎/당근). 갈리는 건 단기 구간뿐이라
    거기서만 로그를 본다 — 잎·당근에까지 로그 조회를 붙이면 이행 시간이 몇 배가 된다.
    """
    if memory_state == 'medium':
        return VisualStage.LEAF
    if memory_state == 'long':
        return VisualStage.CARROT
    if memory_state == 'unlearned':
        return VisualStage.UNPLANTED_SEED

    # ── 단기 구간 ──
    if stat is not None and stat['cnt'] > 0:
        return VisualStage.SPROUT if (stat['multi_day'] or stat['cnt'] >= 2) else VisualStage.PLANTED_SEED

    # 로그가 없는 옛 단어 — FSRS reps 로 추정한다
    guessed = _fsrs_success_count(fsrs_state)
    if guessed >= 2:
        return VisualStage.SPROUT
    if guessed == 1:
        return VisualStage.PLANTED_SEED
    return VisualStage.UNPLANTED_SEED


# ──────────────────────────────────────────────────────────────
# 2) 출시 당일 보호 (기획 15.2)
# ──────────────────────────────────────────────────────────────

def _needed_protection_days(base_rot_at: dt.datetime, target_at: dt.datetime) -> int:
    """base_rot_at(원래 부패 예정) 을 target_at 이후로 밀기 위해 필요한 보호 일수.

    부패 시각을 직접 덮어쓰지 않고 protection_days 로 표현하는 이유는, 조회 시 계산이
    원칙(6.3)이라 rot_due_at 만 고쳐 놓으면 다음 계산 때 원래 값으로 되돌아가기 때문이다.
    보호 일수는 health.thresholds 가 읽는 정식 입력값이다.
    """
    return health.ceil_days(target_at - base_rot_at)


def _stagger_days(index: int, daily_limit: int) -> int:
    """자동 회복 단어의 부패 마감을 며칠 뒤로 흩을지 (기획 15.2 '한날에 몰리지 않게').

    FSRS 의 next_review 는 건드리지 않는다 — 학습 알고리즘의 일정을 게임 레이어가
    고쳐 쓰면 그 순간부터 추천도 통계도 믿을 수 없게 된다. 대신 농장이 소유한
    부패 마감(protection_days)을 권장 복습량 단위로 끊어 하루씩 밀어 준다.
    오늘 학습 우선순위가 rot_due_at 순이므로, 마감이 흩어지면 실제로 사용자가 보는
    '오늘 돌볼 작물'도 같이 흩어진다.
    """
    if daily_limit <= 0:
        return 0
    return index // daily_limit


# ──────────────────────────────────────────────────────────────
# 3) 사용자 1명 전환
# ──────────────────────────────────────────────────────────────

def _daily_limit(user_id: UUID) -> int:
    """권장 복습량. 설정 행이 없으면 기본값 — 여기서 행을 만들지 않는다(읽기만)."""
    row = (
        db.session.query(UserFarmSetting.daily_review_limit)
        .filter(UserFarmSetting.user_id == user_id)
        .first()
    )
    return int((row[0] if row else None) or C.DEFAULT_DAILY_REVIEW_LIMIT)


def _legacy_streak_days(user_id: UUID, today: dt.date) -> int:
    """streak_v2 를 못 쓸 때의 대체 계산 — 기존 출석 기록의 연속일 수.

    보호권 1개 지급 여부(15.3 '기존 연속 학습 기록 보유')만 판단하면 되므로
    정확한 연속일 규칙(11.1 의 정답 5개)까지 재현하지 않는다. T3 의 로직을 여기에
    베껴 두면 두 곳이 서로 다르게 변해 간다.
    """
    rows = (
        db.session.query(CheckIn.attendence_date)
        .filter(CheckIn.user_id == user_id, CheckIn.today_study_complete == True)  # noqa: E712
        .order_by(CheckIn.attendence_date.desc())
        .limit(400)
        .all()
    )
    days = [r[0] for r in rows]
    if not days:
        return 0
    # 오늘 또는 어제부터 이어져야 '보유 중인 기록'이다
    if (today - days[0]).days > 1:
        return 0
    streak, cursor = 0, days[0]
    for d in days:
        if d == cursor:
            streak += 1
            cursor = cursor - dt.timedelta(days=1)
        elif d < cursor:
            break
    return streak


def _migrate_streak(user_id: UUID, now: dt.datetime, today: dt.date,
                    apply: bool, warnings: List[str]) -> int:
    """연속 학습일 승계. T3 의 streak_v2.migrate_from_checkin 에 위임한다.

    아직 그 모듈이 없을 수 있어 try/except 로 감싸되 **조용히 삼키지 않는다** —
    연속 기록이 통째로 사라진 채 전환이 '성공'으로 보고되는 것이 가장 나쁜 실패다.
    미리보기(dry-run)에서는 부르지 않는다. 그 함수가 데이터를 바꾸기 때문이다.

    `commit=False` 로 부르는 이유는 이 사용자의 전환이 **하나의 트랜잭션**이어야 해서다.
    여기서 커밋해 버리면 뒤이은 재화 지급이나 UserFarmMigration insert 가 실패했을 때
    단계 변환만 남고 이행 기록이 없는 상태가 되고, 재실행 시 전환 보상이 두 번 지급된다.
    """
    if apply:
        try:
            from app.services.game.farm_v2 import streak_v2
            result = streak_v2.migrate_from_checkin(user_id, commit=False)
            return _extract_streak(result)
        except ImportError:
            warnings.append('streak_v2 모듈이 아직 없어 연속 학습일 승계를 건너뛰었습니다.')
        except TypeError as exc:
            warnings.append('streak_v2.migrate_from_checkin 시그니처가 예상과 다릅니다: %s' % exc)
        except Exception as exc:   # noqa: BLE001 — 원인을 보고에 남기고 전환은 계속한다
            warnings.append('streak_v2.migrate_from_checkin 실패: %s' % exc)
    return _legacy_streak_days(user_id, today)


def _extract_streak(result) -> int:
    """streak_v2 의 반환형이 무엇이든 연속일 숫자만 꺼낸다(정수/딕셔너리/모델 행)."""
    if result is None:
        return 0
    if isinstance(result, int):
        return result
    if isinstance(result, dict):
        return int(result.get('current_streak') or result.get('current') or 0)
    return int(getattr(result, 'current_streak', 0) or 0)


def migrate_user(user_id: UUID, now: dt.datetime, apply: bool, report: 'Report') -> Optional[dict]:
    """사용자 1명을 V2 로 전환한다. 이미 전환됐으면 None.

    호출부가 트랜잭션을 열고 닫는다 — 여기서 커밋하지 않는 이유는, 단어 상태·아이템·
    보석·전환 기록이 **전부 함께** 반영되거나 전부 무효여야 하기 때문이다.
    """
    if db.session.query(UserFarmMigration.user_id).filter(
            UserFarmMigration.user_id == user_id).first() is not None:
        report.skipped['ALREADY_MIGRATED'] += 1
        return None

    # --user 로 오타난 UUID 를 받았을 때 FK 위반으로 터지는 대신 건너뛴다.
    if db.session.query(User.id).filter(User.id == user_id).first() is None:
        report.skipped['NO_USER'] += 1
        return None

    tz_name = localday.get_timezone(user_id)
    today = localday.local_day(now, tz_name)
    protect_until = now + C.MIGRATION_PROTECT_DAYS * _DAY
    daily_limit = _daily_limit(user_id)

    vocas = (
        db.session.query(UserVoca.id, UserVoca.data, UserVoca.created_at)
        .filter(UserVoca.user_id == user_id)
        .all()
    )
    games = {
        g.user_voca_id: g
        for g in db.session.query(UserVocaGame).filter(UserVocaGame.user_id == user_id).all()
    }

    # ── 1차 통과: 단계 분류 ──
    from app.routes.study import _classify_memory_state

    parsed = []          # (voca_id, stage, fsrs_state, due_at, stability, was_dead)
    short_ids = []
    for voca_id, data, created_at in vocas:
        fsrs_state = _load_state(data)
        memory_state = _classify_memory_state(fsrs_state)
        if memory_state == 'short':
            short_ids.append(voca_id)
        parsed.append([voca_id, memory_state, fsrs_state, created_at])

    stats = load_success_stats(user_id, short_ids, tz_name) if short_ids else {}

    counts_stage = Counter()
    counts_state = Counter()
    planted = []         # 자동 회복 대상 판정용 (voca_id, due_at, stability, stage)
    auto_recover_ids = []

    for entry in parsed:
        voca_id, memory_state, fsrs_state, created_at = entry
        stage = decide_stage(memory_state, stats.get(voca_id), fsrs_state)
        counts_stage[stage] += 1
        counts_state[memory_state] += 1
        due_at = growth.parse_fsrs_due(fsrs_state)
        stability = growth._stability(fsrs_state)
        game = games.get(voca_id)
        was_dead = bool(game is not None and (game.life or 'ALIVE') == 'DEAD')
        entry.extend([stage, due_at, stability, was_dead])
        if stage != VisualStage.UNPLANTED_SEED and due_at is not None:
            planted.append((voca_id, due_at))
            # 15.2 — 이미 지연(예정일 초과)이거나 V1 에서 죽은 단어가 자동 회복 대상이다
            if was_dead or due_at < now:
                auto_recover_ids.append((voca_id, due_at))

    # ── 자동 회복 대상의 부패 마감 분산 순서 ──
    # 예정일이 오래 지난 것부터 앞 묶음에 넣는다. 가장 오래 방치된 작물이 가장 먼저
    # 돌볼 대상으로 올라와야 사용자가 복귀했을 때 순서가 자연스럽다.
    auto_recover_ids.sort(key=lambda x: x[1])
    stagger = {voca_id: _stagger_days(i, daily_limit)
               for i, (voca_id, _) in enumerate(auto_recover_ids)}

    # ── 2차 통과: 행 기록 ──
    counts_health = Counter()
    for voca_id, memory_state, fsrs_state, created_at, stage, due_at, stability, was_dead in parsed:
        game = games.get(voca_id)
        if game is None:
            game = UserVocaGame(user_voca_id=voca_id, user_id=user_id)
            db.session.add(game)
            games[voca_id] = game

        _write_stage(game, stage, stats.get(voca_id), created_at, due_at, tz_name)

        if stage == VisualStage.UNPLANTED_SEED or due_at is None:
            # 보유 씨앗은 생장 주기가 시작되지 않았다 — 썩지 않는다(6.4)
            game.protection_days = 0
            game.rot_due_at = None
            game.health_state = HealthState.FRESH
        else:
            extra = stagger.get(voca_id, 0)
            base = health.thresholds(due_at, stability, stage, 0)
            protection = _needed_protection_days(base['rotten_at'], protect_until + extra * _DAY)
            game.protection_days = protection
            t = health.thresholds(due_at, stability, stage, protection)
            game.rot_due_at = t['rotten_at']
            computed = health.compute_health(due_at, stability, now, stage, protection)
            game.health_state = computed['state']

        if voca_id in stagger:
            # 자동 회복 — V1 의 죽음 표식을 지운다. life 는 V1 조회 경로가 아직 읽는다.
            game.life = 'ALIVE'
            game.died_at = None
            game.rotten_at = None
        game.health_changed_at = now
        game.updated_at = now
        counts_health[game.health_state] += 1

    # ── 3) 기존 재화 전환 (기획 15.3) ──
    grants = _grant_migration_rewards(
        user_id, counts_state, now, today, apply, report)

    row = UserFarmMigration(user_id=user_id, words_total=len(vocas),
                            protect_until=protect_until)
    row.migrated_at = now
    row.auto_recovered = len(auto_recover_ids)
    row.shovel_granted = grants['SHOVEL']
    row.nutrient_granted = grants['NUTRIENT']
    row.shield_granted = grants['SHIELD']
    row.gem_granted = grants['GEM']
    db.session.add(row)

    # 이벤트는 사용자당 1건만 남긴다. 단어마다 남기면 이행 한 번에 수백만 행이 생기고,
    # 그 로그로 이후의 실제 상태 전이를 읽어 내기 어려워진다.
    events.log(user_id, EVENT_MIGRATED, detail={
        'words': len(vocas),
        'auto': len(auto_recover_ids),
        'shovel': grants['SHOVEL'], 'nutrient': grants['NUTRIENT'],
        'shield': grants['SHIELD'], 'gem': grants['GEM'],
        'revive': grants['REVIVE_CONVERTED'],
    })

    report.absorb(counts_stage, counts_health, grants, len(vocas), len(auto_recover_ids))
    return {
        'words': len(vocas),
        'auto_recovered': len(auto_recover_ids),
        'stages': counts_stage,
        'grants': grants,
    }


def _load_state(data) -> dict:
    """UserVoca.data → FSRS state. growth.load_fsrs_state 는 모델 객체를 받으므로
    컬럼만 뽑아 온 이 경로에서는 파서를 직접 부른다(행 전체를 다시 읽지 않기 위해서)."""
    from app.services.fsrs.state import get_fsrs_state, parse_user_voca_data
    try:
        return get_fsrs_state(parse_user_voca_data(data)) or {}
    except Exception:   # noqa: BLE001 — 깨진 JSON 하나가 이행 전체를 멈추면 안 된다
        return {}


def _write_stage(game: UserVocaGame, stage: str, stat: Optional[dict],
                 created_at, due_at, tz_name: str) -> None:
    """성장 단계와 그 부속 필드를 적는다.

    planted_study_day / first_due_at 을 반드시 채우는 이유는 growth.next_stage 가
    발아 판정에 이 둘을 쓰기 때문이다. 비워 두면 심은 씨앗으로 전환된 단어가
    영원히 새싹이 되지 못한다.
    """
    game.visual_stage = stage
    if VisualStage.rank(stage) > VisualStage.rank(game.highest_stage or ''):
        game.highest_stage = stage

    for flag in _REWARD_FLAGS_BY_STAGE.get(stage, ()):
        setattr(game, flag, True)

    if stage == VisualStage.UNPLANTED_SEED:
        return

    planted_at = (stat or {}).get('first_at') or created_at
    if planted_at is not None:
        game.first_planted_at = game.first_planted_at or planted_at
        if game.planted_study_day is None:
            game.planted_study_day = localday.local_day(planted_at, tz_name)
    # 첫 예정 복습 시각을 현재 일정으로 잡는다. 과거 값을 복원할 방법이 없고,
    # 현재 일정으로 두면 "다음 예정 복습을 맞히면 새싹"이 되어 사용자에게 불리하지 않다.
    if game.first_due_at is None:
        game.first_due_at = due_at
    if stage != VisualStage.PLANTED_SEED and game.first_sprouted_at is None:
        game.first_sprouted_at = (stat or {}).get('last_at') or planted_at


def _grant_migration_rewards(user_id: UUID, counts_state: Counter, now: dt.datetime,
                             today: dt.date, apply: bool, report: 'Report') -> dict:
    """기존 재화 전환 + 학습 상태 보상 (기획 15.3). 최초 1회만 — 호출부가 보장한다."""
    medium = counts_state.get('medium', 0)
    long_ = counts_state.get('long', 0)
    learned = medium + long_ + counts_state.get('short', 0)

    user = db.session.query(User).filter(User.id == user_id).with_for_update().first()
    revive = int((user.revive_item_cnt if user else 0) or 0)

    shovel = min(medium // C.MIGRATION_SHOVEL_PER_MEDIUM, C.MIGRATION_SHOVEL_MAX)
    nutrient = revive + min(long_ // C.MIGRATION_NUTRIENT_PER_LONG, C.MIGRATION_NUTRIENT_MAX)

    # 보석은 누적이 아니라 등급이다. 500개 사용자에게 3+10 을 주면 "100개 이상" 조건이
    # 사실상 500개 사용자에게 두 번 적용되는 셈이라 표의 의도(구간 보상)와 어긋난다.
    if learned >= 500:
        gem = C.MIGRATION_GEM_AT_500_WORDS
    elif learned >= 100:
        gem = C.MIGRATION_GEM_AT_100_WORDS
    else:
        gem = 0

    streak_days = _migrate_streak(user_id, now, today, apply, report.warnings)
    shield = 1 if streak_days > 0 else 0

    if shovel:
        inventory.grant(user_id, FarmItem.SHOVEL, shovel, FarmItemReason.MIGRATION,
                        description='농장 개편 전환 보상 (중기 단어 %d개)' % medium)
    if nutrient:
        desc = '농장 개편 전환 보상 (부활 아이템 %d개 전환 + 장기 단어 %d개)' % (revive, long_)
        inventory.grant(user_id, FarmItem.NUTRIENT, nutrient, FarmItemReason.MIGRATION,
                        description=desc)
    if shield:
        inventory.grant(user_id, FarmItem.SHIELD, shield, FarmItemReason.MIGRATION,
                        description='농장 개편 전환 보상 (연속 학습 %d일 승계)' % streak_days)
    if gem:
        inventory.grant_gem(user_id, gem, description='농장 개편 전환 보상 (학습 단어 %d개)' % learned)

    # 부활 아이템은 회복제로 '옮긴' 것이므로 원본을 비운다. 남겨 두면 V1 부활 경로와
    # V2 회복제로 같은 재화를 두 번 쓸 수 있다. 전환량은 이 함수의 반환값과
    # 아이템 원장(UserFarmItemLog.description)에 남아 있어 되짚을 수 있다.
    if revive and user is not None and not report.keep_revive:
        user.revive_item_cnt = 0

    return {'SHOVEL': shovel, 'NUTRIENT': nutrient, 'SHIELD': shield, 'GEM': gem,
            'REVIVE_CONVERTED': revive, 'STREAK': streak_days}


# ──────────────────────────────────────────────────────────────
# 4) 리포트
# ──────────────────────────────────────────────────────────────

class Report:
    """이행 결과 집계. 사람이 이 숫자만 보고 '제대로 됐는가'를 판단할 수 있어야 한다."""

    def __init__(self, keep_revive: bool = False):
        self.users_seen = 0
        self.users_done = 0
        self.users_failed = 0
        self.words_total = 0
        self.auto_recovered = 0
        self.stages = Counter()
        self.healths = Counter()
        self.grants = Counter()
        self.skipped = Counter()
        self.warnings = []
        self.failures = []
        self.keep_revive = keep_revive

    def absorb(self, stages: Counter, healths: Counter, grants: dict,
               words: int, auto: int) -> None:
        self.stages.update(stages)
        self.healths.update(healths)
        for key in ('SHOVEL', 'NUTRIENT', 'SHIELD', 'GEM', 'REVIVE_CONVERTED'):
            self.grants[key] += grants.get(key, 0)
        self.words_total += words
        self.auto_recovered += auto

    def render(self, apply: bool) -> str:
        mode = '실제 반영' if apply else '미리보기(dry-run) — 아무것도 저장하지 않았습니다'
        lines = [
            '',
            '=' * 60,
            '당근 농장 V2 전환 리포트  [%s]' % mode,
            '=' * 60,
            '대상 사용자 조회      : %d명' % self.users_seen,
            '전환 %-14s : %d명' % ('완료' if apply else '예정', self.users_done),
            '건너뜀                : %d명' % sum(self.skipped.values()),
        ]
        for reason, cnt in sorted(self.skipped.items()):
            lines.append('    - %-16s %d명' % (_SKIP_LABEL.get(reason, reason), cnt))
        lines.append('실패                  : %d명' % self.users_failed)
        lines.append('')
        lines.append('단어 총계             : %d개' % self.words_total)
        lines.append('성장 단계 분포')
        for stage in VisualStage.ORDER:
            if self.stages.get(stage):
                lines.append('    %-16s %d개 (%s)' % (
                    stage, self.stages[stage], growth.STAGE_LABEL.get(stage, stage)))
        lines.append('건강 상태 분포')
        for state in (HealthState.FRESH, HealthState.THIRSTY, HealthState.WILTED,
                      HealthState.CRITICAL, HealthState.ROTTEN, HealthState.GOLDEN):
            if self.healths.get(state):
                lines.append('    %-16s %d개 (%s)' % (
                    state, self.healths[state], health.HEALTH_LABEL.get(state, state)))
        lines.append('자동 회복 적용        : %d개 (전환 후 %d일 부패 보호)'
                     % (self.auto_recovered, C.MIGRATION_PROTECT_DAYS))
        lines.append('')
        lines.append('지급 재화 총계')
        lines.append('    새심기 삽         : %d개' % self.grants['SHOVEL'])
        lines.append('    영양 회복제       : %d개 (부활 아이템 전환분 %d개 포함)'
                     % (self.grants['NUTRIENT'], self.grants['REVIVE_CONVERTED']))
        lines.append('    연속 학습 보호권  : %d개' % self.grants['SHIELD'])
        lines.append('    보석              : %d개' % self.grants['GEM'])
        if self.warnings:
            lines.append('')
            lines.append('경고 (%d건, 중복 제거)' % len(self.warnings))
            for msg in sorted(set(self.warnings)):
                lines.append('    - %s' % msg)
        if self.failures:
            lines.append('')
            lines.append('실패 사용자 (최대 20건)')
            for uid, msg in self.failures[:20]:
                lines.append('    - %s : %s' % (uid, msg))
        if not apply:
            lines.append('')
            lines.append('실제 반영하려면 --apply 를 붙여 다시 실행하세요.')
        lines.append('=' * 60)
        return '\n'.join(lines)


_SKIP_LABEL = {'ALREADY_MIGRATED': '이미 전환됨', 'NO_USER': '사용자 없음'}


# ──────────────────────────────────────────────────────────────
# 5) 실행
# ──────────────────────────────────────────────────────────────

def iter_user_ids(batch_size: int, only_user: Optional[UUID], limit: Optional[int]):
    """사용자 ID 를 배치로 흘려 보낸다 (keyset 페이지네이션).

    OFFSET 을 쓰지 않는 이유는 두 가지다. OFFSET 은 뒤로 갈수록 앞 행을 전부 세느라
    느려지고, 이행 중 사용자가 새로 가입하면 페이지가 밀려 누군가를 건너뛴다.
    id 커서는 둘 다 겪지 않는다.
    """
    if only_user is not None:
        yield [only_user]
        return
    last_id = None
    sent = 0
    while True:
        q = db.session.query(User.id).order_by(User.id)
        if last_id is not None:
            q = q.filter(User.id > last_id)
        rows = q.limit(batch_size).all()
        if not rows:
            return
        ids = [r[0] for r in rows]
        last_id = ids[-1]
        if limit is not None:
            remain = limit - sent
            if remain <= 0:
                return
            ids = ids[:remain]
        sent += len(ids)
        yield ids


def main() -> int:
    parser = argparse.ArgumentParser(
        description='기존 사용자를 당근 농장 V2 로 전환한다 (기본은 미리보기).')
    parser.add_argument('--apply', action='store_true',
                        help='실제로 DB 에 반영한다. 없으면 미리보기만 한다.')
    parser.add_argument('--user', type=str, default=None,
                        help='이 사용자 1명만 처리한다 (UUID). 검증용.')
    parser.add_argument('--batch-size', type=int, default=200,
                        help='한 번에 읽을 사용자 수 (기본 200)')
    parser.add_argument('--limit', type=int, default=None,
                        help='최대 처리 사용자 수. 단계적 반영에 쓴다.')
    parser.add_argument('--keep-revive-item', action='store_true',
                        help='User.revive_item_cnt 를 비우지 않는다. V1 부활 경로를 '
                             '아직 살려 둬야 할 때만 쓴다(재화가 두 배가 되므로 주의).')
    parser.add_argument('--verbose', action='store_true',
                        help='사용자별 처리 내역을 출력한다.')
    args = parser.parse_args()

    only_user = None
    if args.user:
        try:
            only_user = UUID(args.user)
        except (ValueError, AttributeError):
            print('오류: --user 값이 UUID 형식이 아닙니다: %s' % args.user)
            return 2

    app = create_app()
    with app.app_context():
        report = Report(keep_revive=args.keep_revive_item)
        now = dt.datetime.utcnow()
        started = now

        print('당근 농장 V2 전환 시작 — %s, 기준 시각 %s'
              % ('실제 반영' if args.apply else '미리보기', now.isoformat()))

        for ids in iter_user_ids(args.batch_size, only_user, args.limit):
            for user_id in ids:
                report.users_seen += 1
                try:
                    result = migrate_user(user_id, now, args.apply, report)
                    if result is None:
                        db.session.rollback()
                        continue
                    if args.apply:
                        db.session.commit()
                    else:
                        # 미리보기도 실제와 같은 INSERT/UPDATE 를 흘려 보내 제약 위반을
                        # 미리 잡아낸다. 다만 커밋하지 않고 되돌린다.
                        db.session.rollback()
                    report.users_done += 1
                    if args.verbose:
                        print('  %s  단어 %d개 / 자동회복 %d개 / 삽 %d 회복제 %d 보호권 %d 보석 %d'
                              % (user_id, result['words'], result['auto_recovered'],
                                 result['grants']['SHOVEL'], result['grants']['NUTRIENT'],
                                 result['grants']['SHIELD'], result['grants']['GEM']))
                except Exception as exc:   # noqa: BLE001 — 한 명의 실패로 전체를 멈추지 않는다
                    db.session.rollback()
                    report.users_failed += 1
                    report.failures.append((str(user_id), str(exc)))
                    print('  [실패] %s : %s' % (user_id, exc))
                    traceback.print_exc()

            # 배치가 끝날 때마다 세션을 비운다. 안 그러면 identity map 에 이번 이행에서
            # 만진 모든 행이 남아 사용자 수에 비례해 메모리가 늘어난다.
            db.session.remove()
            print('  ... 진행 %d명 (전환 %d, 건너뜀 %d, 실패 %d) 경과 %ds'
                  % (report.users_seen, report.users_done, sum(report.skipped.values()),
                     report.users_failed, int((dt.datetime.utcnow() - started).total_seconds())))

        print(report.render(args.apply))
        return 1 if report.users_failed else 0


if __name__ == '__main__':
    sys.exit(main())
