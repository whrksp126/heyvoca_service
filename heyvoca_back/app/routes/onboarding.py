"""온보딩 (트랙 ⑤) — 게스트 맛보기 → 가입 → 데이터 이전 → 점진 해금.

- GET  /onboarding/books              (비인증) 레벨 카드 목록
- GET  /onboarding/level-book?level=N (비인증) 레벨별 단어장(단어 포함) — 맛보기 소스.
       응답 전 해당 레벨 단어 TTS를 백그라운드로 미리 생성·캐싱(게스트 무인증 재생 대비).
- POST /onboarding/migrate           (인증) 가입 직후 1회, 레벨 단어장 생성 + 맛본 답안 반영 + 보상
- GET  /onboarding/unlock-status      (인증) 온보딩 행동 기반 미션 해금 상태(6단계)
- POST /onboarding/mission/complete   (인증) 프론트 신호 미션(ai_test/search_word/focus_study/free_test) 완료 처리

온보딩 행동 기반 미션(6단계 선형 체인, ONBOARDING_MISSIONS 참고):
  ai_test → make_book → buy_book → search_word → focus_study → free_test
make_book/buy_book은 app/routes/voca_books.py의 create_voca_book/append_vocas_to_book 훅에서
백엔드가 자동 감지해 완료 처리하고, 나머지는 프론트가 /onboarding/mission/complete로 신호를 보낸다.
free_test(M6)는 unlocks=None인 종료 미션 — 더 이상 해금할 feature가 없다(체인의 마무리 신호용).

레벨(1 초등 / 2 중등 / 3 고등 / 4 대학생)별 단어는 AdminVocaBook에서 구성 —
기존 /auth/level_book_list와 동일 소스. 학습 알고리즘(FSRS)은 services/fsrs를 '호출만' 한다.
"""

import json
import logging
import threading
import datetime as dt
from uuid import UUID

from flask import Blueprint, jsonify, g, request, current_app

from app import db, cache
from app.models.models import (
    User, UserVoca, UserVocaBook, UserVocaBookMap, UserStudyLog, UserStudySession,
)
from app.utils.jwt_utils import jwt_required

onboarding_bp = Blueprint('onboarding', __name__, url_prefix='/onboarding')

# 기능 점진 해금(5단계, 승인) — 홈·마이페이지는 즉시.
#  vocabook(단어장)·store(상점)·dict(사전)은 BottomNav 탭, listen(반복듣기)·custom(커스텀)은 학습 시작 카드.
# 과거엔 "완료 세션 수" 임계값으로 해금 여부를 판정했으나, 온보딩 행동 기반 미션 체계로 교체됨
# (아래 ONBOARDING_MISSIONS). UNLOCK_THRESHOLDS는 completed_sessions와 함께 하위호환 필드로만 유지.
UNLOCK_THRESHOLDS = {'vocabook': 1, 'store': 2, 'dict': 3, 'listen': 4, 'custom': 5}
SIGNUP_REWARD_GEM = 5

# ──────────────────────────────────────────────
# 온보딩 행동 기반 미션 (5단계 선형 체인)
# ──────────────────────────────────────────────
# key         : 미션 식별자 (UserOnboardingMission.mission_key)
# order       : 화면 노출 순서 / 다음 미션(current_mission) 판정 순서
# title       : 사용자 노출 한국어 라벨
# unlocks     : 완료 시 해금되는 feature (UNLOCK_THRESHOLDS와 동일 키 체계)
# reward_gem  : 완료 보상 보석
ONBOARDING_MISSIONS = [
    {'key': 'ai_test',     'order': 1, 'title': 'AI 추천 테스트 완료',   'unlocks': 'vocabook', 'reward_gem': 5},
    {'key': 'make_book',   'order': 2, 'title': '단어장 만들고 단어 추가',  'unlocks': 'store',    'reward_gem': 5},
    {'key': 'buy_book',    'order': 3, 'title': '서점 단어장 담기 완료',   'unlocks': 'dict',     'reward_gem': 10},
    {'key': 'search_word', 'order': 4, 'title': '사전에서 단어 찾아보기 완료', 'unlocks': 'listen', 'reward_gem': 5},
    {'key': 'focus_study', 'order': 5, 'title': '집중 반복 학습 완료',    'unlocks': 'custom',   'reward_gem': 10},
    # M6: 더 이상 해금할 기능이 없는 종료 미션(unlocks=None) — 온보딩 체인의 마무리 신호용.
    {'key': 'free_test',   'order': 6, 'title': '자유 설정 테스트 완료',  'unlocks': None,       'reward_gem': 20},
]
ONBOARDING_MISSION_BY_KEY = {m['key']: m for m in ONBOARDING_MISSIONS}
ONBOARDING_MISSION_KEYS = set(ONBOARDING_MISSION_BY_KEY.keys())
# feature(해금 대상) → 이를 해금시키는 mission_key. unlocks=None(해금 대상 없는 종료 미션)은 제외.
FEATURE_UNLOCK_MISSION = {m['unlocks']: m['key'] for m in ONBOARDING_MISSIONS if m['unlocks']}
# /onboarding/mission/complete로 프론트가 직접 신호를 보내는 미션(백엔드 자동 감지 대상 제외).
# make_book/buy_book은 voca_books.py 훅에서만 완료 처리한다 — API로 임의 완료 방지.
FRONTEND_SIGNAL_MISSION_KEYS = {'ai_test', 'search_word', 'focus_study', 'free_test'}


def complete_onboarding_mission(user_id, mission_key) -> dict:
    """온보딩 미션을 멱등하게 완료 처리한다.

    이미 완료된 (user_id, mission_key)면 아무 것도 하지 않고 newly_completed=False 반환.
    신규 완료면 UserOnboardingMission row insert + gem_cnt 증가 + gem 로그 기록.

    반환: {'newly_completed': bool, 'reward_gem': int, 'unlocks': str}
    """
    from sqlalchemy.exc import IntegrityError
    from app.models.models import UserOnboardingMission, GemReason
    from app.routes.common import register_gem_log

    mission = ONBOARDING_MISSION_BY_KEY.get(mission_key)
    if not mission:
        raise ValueError(f'유효하지 않은 온보딩 미션 key: {mission_key}')

    if isinstance(user_id, str):
        user_id = UUID(user_id)

    existing = (
        db.session.query(UserOnboardingMission)
        .filter(UserOnboardingMission.user_id == user_id, UserOnboardingMission.mission_key == mission_key)
        .first()
    )
    if existing:
        return {'newly_completed': False, 'reward_gem': 0, 'unlocks': mission['unlocks']}

    user = db.session.query(User).filter(User.id == user_id).with_for_update().first()
    if user is None:
        raise ValueError('사용자를 찾을 수 없습니다.')

    reward = mission['reward_gem']
    db.session.add(UserOnboardingMission(user_id=user_id, mission_key=mission_key))
    user.gem_cnt = (user.gem_cnt or 0) + reward

    try:
        db.session.commit()
    except IntegrityError:
        # 동시 요청 등으로 UniqueConstraint 위반 → 이미 다른 요청이 완료 처리한 것으로 간주(멱등).
        db.session.rollback()
        return {'newly_completed': False, 'reward_gem': 0, 'unlocks': mission['unlocks']}

    register_gem_log(
        user_id=user_id, amount=reward, reason=GemReason.ONBOARDING_MISSION,
        description=f"온보딩 미션 완료: {mission['title']}",
        source_type='onboarding_mission', source_id=None,
        balance_after=user.gem_cnt,
    )  # register_gem_log 내부 commit

    # M2(make_book) 완료 보상: 보석 외에 빈 단어장 1개를 자동 지급한다.
    # (미션이 멱등하게 1회만 신규 완료되므로 이 지급도 1회만 발생)
    if mission_key == 'make_book':
        import json as _json
        try:
            reward_book = UserVocaBook(
                user_id=user_id,
                bookstore_id=None,
                color=_json.dumps({'main': '#FF8DD4', 'sub': '#FF8DD44d', 'background': '#FFEFFA'}, ensure_ascii=False),
                name='나의 단어장',
                total_word_cnt=0,
                memorized_word_cnt=0,
                voca_list=None,
                updated_at=None,
            )
            db.session.add(reward_book)
            db.session.commit()
        except Exception:
            # 보상 단어장 생성 실패는 미션 완료 자체를 되돌리지 않는다(보석은 이미 지급됨).
            db.session.rollback()
            logging.getLogger(__name__).error('make_book 보상 빈 단어장 생성 실패', exc_info=True)

    return {'newly_completed': True, 'reward_gem': reward, 'unlocks': mission['unlocks']}


def _build_unlock_status(user) -> dict:
    """GET /onboarding/unlock-status 및 POST /onboarding/mission/complete가 공유하는 페이로드.

    legacy(onboarding_ver != '1') 유저는 전부 해금(True)·전부 완료로 간주.
    신규 유저는 UserOnboardingMission 완료 기록 기준으로 missions/unlocked/current_mission을 계산한다.
    """
    from app.models.models import UserOnboardingMission

    legacy = user.onboarding_ver != '1'

    rows = (
        db.session.query(UserOnboardingMission)
        .filter(UserOnboardingMission.user_id == user.id)
        .all()
    )
    completed_at_by_key = {r.mission_key: r.completed_at for r in rows}
    completed_keys = set(completed_at_by_key.keys())

    missions = []
    current_mission = None
    for m in ONBOARDING_MISSIONS:
        done = legacy or (m['key'] in completed_keys)
        completed_at = completed_at_by_key.get(m['key'])
        missions.append({
            'key': m['key'],
            'order': m['order'],
            'title': m['title'],
            'done': done,
            'completed_at': (completed_at.isoformat() + 'Z') if completed_at else None,
            'unlocks': m['unlocks'],
            'reward_gem': m['reward_gem'],
            # 완료 시 보석 외 추가로 지급되는 아이템(빈 단어장) 여부 — make_book만 True.
            # 실제 지급 로직은 complete_onboarding_mission()에 있고, 이 필드는 프론트 "보상 받기" UI 노출용.
            'reward_book': m['key'] == 'make_book',
        })
        if not done and current_mission is None:
            current_mission = m['key']

    if legacy:
        unlocked = {k: True for k in UNLOCK_THRESHOLDS}
    else:
        unlocked = {
            feature: (mission_key in completed_keys)
            for feature, mission_key in FEATURE_UNLOCK_MISSION.items()
        }

    return {
        'legacy': legacy,
        # 하위호환용 — 과거 "완료 세션 수" 대신 "완료한 미션 수"로 채운다(프론트 레거시 폴백 대비).
        'completed_sessions': len(completed_keys) if not legacy else len(ONBOARDING_MISSIONS),
        'thresholds': UNLOCK_THRESHOLDS,
        'unlocked': unlocked,
        'missions': missions,
        'current_mission': current_mission,
        'gem_cnt': user.gem_cnt,
    }

# 레벨 → AdminVocaBook id (auth.level_book_list와 동일 매핑)
LEVEL_ADMIN_BOOK = {'1': 10, '2': 11, '3': 12, '4': 13}
DEFAULT_DAILY_LIMIT = 10

# 레벨별 카드 표시 메타 (카테고리 라벨 + 서점 카드 색상 family 토큰)
LEVEL_META = {
    '1': {'category': '초등', 'color': {'main': 'var(--secondary-mint-500)', 'sub': 'var(--secondary-mint-200)', 'background': 'var(--secondary-mint-100)'}},
    '2': {'category': '중등', 'color': {'main': 'var(--secondary-blue-500)', 'sub': 'var(--secondary-blue-200)', 'background': 'var(--secondary-blue-100)'}},
    '3': {'category': '고등', 'color': {'main': 'var(--secondary-purple-500)', 'sub': 'var(--secondary-purple-200)', 'background': 'var(--secondary-purple-100)'}},
    '4': {'category': '대학생 이상', 'color': {'main': 'var(--secondary-yellow-500)', 'sub': 'var(--secondary-yellow-200)', 'background': 'var(--secondary-yellow-100)'}},
}


def _level_book(level) -> dict:
    """레벨별 단어장 조회 (AdminVocaBook). 반환: {id,title,color,vocaList:[{origin,meanings,examples,voca_id}]} 또는 None."""
    from app.models.models import AdminVocaBook, AdminVocaBookMap, Voca

    book_id = LEVEL_ADMIN_BOOK.get(str(level))
    if not book_id:
        return None
    admin_book = AdminVocaBook.query.get(book_id)
    if not admin_book:
        return None

    rows = (
        db.session.query(AdminVocaBookMap, Voca)
        .join(Voca, AdminVocaBookMap.voca_id == Voca.id)
        .filter(AdminVocaBookMap.book_id == book_id)
        .order_by(AdminVocaBookMap.id.asc())
        .all()
    )
    voca_list = [{
        'origin': voca.word,
        'meanings': json.loads(amap.voca_meanings) if amap.voca_meanings else [],
        'examples': json.loads(amap.voca_examples) if amap.voca_examples else [],
        'voca_id': voca.id,
    } for amap, voca in rows]

    color = (LEVEL_META.get(str(level)) or {}).get('color') or {
        'main': 'var(--primary-main-500)', 'sub': 'var(--primary-main-200)', 'background': 'var(--primary-main-100)',
    }
    return {
        'id': admin_book.id,
        'title': admin_book.book_nm,
        'color': color,
        'vocaList': voca_list,
    }


@onboarding_bp.route('/books', methods=['GET'])
def books():
    """온보딩에서 선택 가능한 단어장 목록(카드용) — 비인증.

    레벨 4종(초/중/고/대) 각각 {level,id,name,category,word_count,color,sample_words}.
    맛보기/미리보기의 실제 단어는 /onboarding/level-book?level=N 으로 별도 조회.
    """
    from app.models.models import AdminVocaBook, AdminVocaBookMap, Voca

    cards = []
    for level in sorted(LEVEL_ADMIN_BOOK.keys()):
        book_id = LEVEL_ADMIN_BOOK[level]
        admin_book = AdminVocaBook.query.get(book_id)
        if not admin_book:
            continue
        word_count = (
            db.session.query(db.func.count(AdminVocaBookMap.id))
            .filter(AdminVocaBookMap.book_id == book_id)
            .scalar()
        ) or 0
        samples = (
            db.session.query(Voca.word)
            .join(AdminVocaBookMap, AdminVocaBookMap.voca_id == Voca.id)
            .filter(AdminVocaBookMap.book_id == book_id)
            .order_by(AdminVocaBookMap.id.asc())
            .limit(6)
            .all()
        )
        meta = LEVEL_META.get(level, {})
        cards.append({
            'level': int(level),
            'id': admin_book.id,
            'name': admin_book.book_nm,
            'category': meta.get('category'),
            'word_count': int(word_count),
            'color': meta.get('color'),
            'sample_words': [w[0] for w in samples],
        })

    return jsonify({'code': 200, 'data': cards}), 200


# 레벨당 prewarm 백그라운드 스레드 재트리거 최소 간격(초). 레벨 단어(최대 4종) 구성이 고정이라
# 짧은 시간 내 반복 호출로 스레드가 계속 생기는 것만 막으면 충분 — 실제 생성 여부는
# objectstore 존재 확인으로 결정되므로 중복 트리거돼도 재생성/재과금 되지 않는다.
_LEVEL_TTS_PREWARM_TRIGGER_TTL = 6 * 3600


def _trigger_level_tts_prewarm(level, book):
    """레벨 단어장의 영어 단어(origin) 음성을 백그라운드로 미리 생성·캐싱한다.

    게스트(비로그인) 온보딩 맛보기는 듣기형 문제에서 단어(origin) 음성을 재생하는데,
    /tts/resolve는 캐시 미스 시 로그인을 요구한다. 레벨 단어장은 관리자가 구성한
    고정 세트(AdminVocaBook, 텍스트가 사용자 입력이 아님)라 무인증으로 미리 생성해도
    남용 위험이 낮다 — 이 함수가 그 사전 생성을 담당한다(요청-응답 흐름은 막지 않음).

    /tts/resolve 쪽에도 동일 화이트리스트 기준 게스트 허용 안전망이 있어(레이스 대비),
    이 prewarm이 실패하거나 늦어도 맛보기 흐름 자체는 깨지지 않는다.
    """
    trigger_key = f'onboarding:tts_prewarm:{level}'
    try:
        if cache.get(trigger_key):
            return
        cache.set(trigger_key, '1', timeout=_LEVEL_TTS_PREWARM_TRIGGER_TTL)
    except Exception:
        pass  # Redis 장애 시에도 prewarm 자체는 계속 시도(중복 트리거만 못 막을 뿐)

    words = [w['origin'] for w in (book.get('vocaList') or []) if w.get('origin')]
    if not words:
        return

    app = current_app._get_current_object()

    def _worker():
        with app.app_context():
            from app.services.tts import service
            from app.services.tts.registry import get_provider_for_language
            from app.services.tts.base import TTSError
            try:
                provider = get_provider_for_language('en')
            except TTSError:
                logging.getLogger(__name__).warning('온보딩 TTS prewarm: provider 조회 실패', exc_info=True)
                return
            for word in words:
                try:
                    service.ensure_cached(word, 'en', provider=provider)
                except Exception:
                    logging.getLogger(__name__).warning(
                        '온보딩 TTS prewarm 실패: level=%s word=%s', level, word, exc_info=True,
                    )

    threading.Thread(target=_worker, name=f'onboarding-tts-prewarm-{level}', daemon=True).start()


@onboarding_bp.route('/level-book', methods=['GET'])
def level_book():
    """레벨별 단어장(단어 포함) — 비인증. 게스트 맛보기 소스."""
    level = request.args.get('level')
    if not level:
        return jsonify({'code': 400, 'message': 'level이 필요합니다.'}), 400
    book = _level_book(level)
    if not book:
        return jsonify({'code': 404, 'message': '해당 레벨의 단어장을 찾을 수 없습니다.'}), 404
    _trigger_level_tts_prewarm(level, book)
    return jsonify({'code': 200, 'data': book}), 200


@onboarding_bp.route('/migrate', methods=['POST'])
@jwt_required
def migrate():
    """가입 직후 1회 — 맞춤 설정 저장 + 레벨 단어장 생성 + 맛본 답안 반영 + 보상.

    body: {
      level, source_channel, learning_goal, daily_new_limit, username,
      answers: [{voca_id, correct}]   # 맛본 단어(레벨 단어장 내)의 정/오답
    }
    멱등: 이미 온보딩 완료(onboarding_ver='1')면 409.
    """
    from app.services.fsrs.state import migrate_v1_to_v2, set_fsrs_state, get_fsrs_state, serialize_user_voca_data
    from app.services.fsrs.scheduler import review as fsrs_review
    from app.services.fsrs.core import GOOD, AGAIN
    from app.routes.common import register_gem_log
    from app.models.models import GemReason
    from app.services.game.hooks import on_study_answer

    user_id = UUID(g.user_id)
    body = request.get_json(silent=True) or {}

    user = db.session.query(User).filter(User.id == user_id).with_for_update().first()
    if user is None:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404
    if user.onboarding_ver == '1':
        return jsonify({'code': 409, 'message': '이미 온보딩을 완료했습니다.'}), 409

    level = str(body.get('level') or '')
    book = _level_book(level)
    if not book:
        return jsonify({'code': 400, 'message': '유효한 레벨이 필요합니다.'}), 400

    answers = {int(a['voca_id']): bool(a.get('correct')) for a in (body.get('answers') or []) if a.get('voca_id') is not None}
    daily_limit = body.get('daily_new_limit')
    try:
        daily_limit = int(daily_limit)
    except (TypeError, ValueError):
        daily_limit = DEFAULT_DAILY_LIMIT

    now = dt.datetime.utcnow()

    # 맞춤 설정
    user.source_channel = body.get('source_channel') or None
    user.learning_goal = body.get('learning_goal') or None
    user.daily_new_limit = daily_limit if daily_limit > 0 else DEFAULT_DAILY_LIMIT
    user.onboarding_ver = '1'
    try:
        user.level_id = int(level)
    except (TypeError, ValueError):
        pass
    username = (body.get('username') or '').strip()
    if username and not user.username:
        user.username = username[:36]

    # 레벨 단어장 생성
    vbook = UserVocaBook(
        user_id=user_id, bookstore_id=None,
        color=json.dumps(book['color'], ensure_ascii=False),
        name=book['title'][:36], total_word_cnt=0, memorized_word_cnt=0,
        voca_list=None, updated_at=now,
    )
    db.session.add(vbook)
    db.session.flush()

    # is_onboarding=True — unlock_status의 완료 세션(정규 학습 횟수) 카운트에서 제외되는 마커.
    # 맛보기 문항 수와 무관하게(0개 포함) 가입 시 항상 finished_at이 채워지므로, 카운트에 포함되면
    # 가입 직후 바로 단어장 등이 해금돼버린다 — 정규 학습 1회를 거쳐야 해금되도록 별도 표식으로 제외.
    session = UserStudySession(user_id=user_id, test_type='today',
                               book_ids=json.dumps([str(vbook.id)]),
                               question_count=0, correct_count=0,
                               is_onboarding=True)
    session.started_at = now
    session.finished_at = now
    db.session.add(session)
    db.session.flush()

    studied = 0
    correct_total = 0
    # 커밋 뒤에 게임 레이어로 넘길 답안. 훅이 학습 로그를 다시 읽어(독립 정답 판정)
    # 상태를 정하므로, 이 트랜잭션이 닫히기 전에는 부를 수 없다.
    graded = []
    for w in book['vocaList']:
        vid = w.get('voca_id')
        uv = UserVoca(
            user_id=user_id, voca_id=vid, word=w['origin'],
            voca_meanings=json.dumps(w['meanings'], ensure_ascii=False),
            voca_examples=json.dumps(w['examples'], ensure_ascii=False),
            data=None,
        )
        db.session.add(uv)
        db.session.flush()

        db.session.add(UserVocaBookMap(
            user_voca_book_id=vbook.id, user_voca_id=uv.id, level=None,
            voca_meanings=json.dumps(w['meanings'], ensure_ascii=False),
            voca_examples=json.dumps(w['examples'], ensure_ascii=False),
            memory_status=None,
        ))

        # 맛본 단어면 FSRS 재생 + 학습 로그
        if vid in answers:
            was_correct = answers[vid]
            correct_total += 1 if was_correct else 0
            studied += 1
            payload = migrate_v1_to_v2({})
            fsrs_before = get_fsrs_state(payload) or {}
            rating = GOOD if was_correct else AGAIN
            fsrs_after = fsrs_review(fsrs_before, rating, now)
            uv.data = serialize_user_voca_data(set_fsrs_state(payload, fsrs_after))

            log = UserStudyLog(
                user_id=user_id, user_voca_id=uv.id, voca_id=vid,
                user_voca_book_id=vbook.id, session_id=session.id,
                test_type='today', question_type='multipleChoice',
                was_correct=was_correct, q_score=5 if was_correct else 0,
                rating=rating, time_taken_ms=3000, word_length=len(w['origin'] or ''),
                state_before=json.dumps({'state': 'new', 'stability': 0}, ensure_ascii=False),
                state_after=json.dumps(fsrs_after, ensure_ascii=False),
            )
            log.created_at = now
            db.session.add(log)
            graded.append((uv.id, was_correct))

    vbook.total_word_cnt = len(book['vocaList'])
    session.question_count = studied
    session.correct_count = correct_total
    db.session.flush()

    reward = 0
    if studied > 0:
        user.gem_cnt = (user.gem_cnt or 0) + SIGNUP_REWARD_GEM
        reward = SIGNUP_REWARD_GEM

    db.session.commit()

    # ── 게임 레이어 반영 (농장 심기 + 연속 학습일) ──────────────────────────
    # 정규 학습은 study/log 가 답안마다 이 훅을 부른다. 온보딩은 답안을 여기서 직접
    # 재생하므로 훅도 여기서 불러야 한다. 빠뜨리면 UserVocaGame 행이 하나도 안 생겨
    # 온보딩을 마친 사용자의 밭이 통째로 비어 보이고(전부 '보유 씨앗'으로 집계된다),
    # 연속 학습일도 0 일에서 시작한다 — 첫 학습을 이미 한 사람에게 가장 나쁜 첫 화면이다.
    #
    # 학습 저장은 위에서 이미 커밋됐다. 여기서 실패해도 온보딩 자체는 성공으로 응답한다.
    # 세션 id 는 루프 전에 꺼내 둔다 — 훅이 실패해 rollback 이 돌면 `session` 은 만료된
    # 상태가 되어 다음 회차에서 속성을 읽는 것만으로 다시 터진다.
    onboarding_session_id = session.id
    for uv_id, was_correct in graded:
        try:
            on_study_answer(user_id, 'today', was_correct,
                            user_voca_id=uv_id, session_id=onboarding_session_id)
        except Exception:
            db.session.rollback()
            logging.getLogger(__name__).warning(
                '온보딩 게임 반영 실패 (user_voca=%s, 학습 저장은 정상)', uv_id, exc_info=True)

    if reward > 0:
        register_gem_log(
            user_id=user_id, amount=reward, reason=GemReason.ACHIEVEMENT,
            description='온보딩 가입 보상',
            source_type='onboarding', source_id=None,
            balance_after=user.gem_cnt,
        )  # register_gem_log 내부 commit

    # 방금 생성한 온보딩 단어가 AI 추천 후보 풀(recommend:pool:{user_id}, Redis TTL 30초)에 즉시
    # 반영되도록 stale 캐시를 무효화한다. 온보딩 중 단어 생성 전에 빈 풀이 캐시돼 있으면, 무효화하지
    # 않으면 30초 동안 AI 추천 테스트가 "출제 가능한 문제가 없어요"로 실패한다(온보딩 직후 첫 세션 버그).
    try:
        from app.services.recommend.pool import invalidate_pool_cache
        invalidate_pool_cache(user_id)
    except Exception:
        logging.getLogger(__name__).warning('온보딩 migrate 후 추천 풀 캐시 무효화 실패(무해)', exc_info=True)

    return jsonify({
        'code': 200,
        'data': {
            'book_id': str(vbook.id),
            'book_title': book['title'],
            'total_words': len(book['vocaList']),
            'studied': studied,
            'correct': correct_total,
            'reward_gem': reward,
            'gem_cnt': user.gem_cnt,
        },
    }), 200


@onboarding_bp.route('/unlock-status', methods=['GET'])
@jwt_required
def unlock_status():
    """온보딩 행동 기반 미션 해금 상태(6단계).

    legacy(onboarding_ver NULL)=기존 사용자 → 전부 해금.
    신규(=1) → 미션(ai_test/make_book/buy_book/search_word/focus_study/free_test) 완료 기록 기준으로
    단어장/상점/사전/반복듣기/커스텀을 점진 해금한다(과거 "완료 세션 수" 방식 대체).
    free_test(M6)는 unlocks=None이라 unlocked 맵에는 영향을 주지 않는다(종료 미션).
    """
    user_id = UUID(g.user_id)
    user = db.session.query(User).filter(User.id == user_id).first()
    if user is None:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404

    return jsonify({'code': 200, 'data': _build_unlock_status(user)}), 200


@onboarding_bp.route('/mission/complete', methods=['POST'])
@jwt_required
def mission_complete():
    """프론트 신호 기반 온보딩 미션 완료 처리 — ai_test / search_word / focus_study / free_test 전용.

    (make_book / buy_book은 voca_books.py의 create_voca_book / append_vocas_to_book 훅에서만
     완료 처리한다 — 이 엔드포인트로는 완료시킬 수 없다.)

    body: { "key": "ai_test" | "search_word" | "focus_study" | "free_test" }

    응답: unlock-status와 동일한 missions/unlocked/current_mission 전체를 함께 반환해
    프론트가 재조회 없이 바로 연출·갱신할 수 있도록 한다.
    """
    body = request.get_json(silent=True) or {}
    key = body.get('key')

    if key not in FRONTEND_SIGNAL_MISSION_KEYS:
        return jsonify({'code': 400, 'message': '유효하지 않은 미션 key입니다.'}), 400

    user_id = UUID(g.user_id)

    try:
        result = complete_onboarding_mission(user_id, key)
    except ValueError as e:
        db.session.rollback()
        return jsonify({'code': 404, 'message': str(e)}), 404
    except Exception:
        db.session.rollback()
        logging.getLogger(__name__).error('온보딩 미션 완료 처리 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '미션 완료 처리 중 오류가 발생했습니다.'}), 500

    user = db.session.query(User).filter(User.id == user_id).first()
    if user is None:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404

    status = _build_unlock_status(user)

    return jsonify({
        'code': 200,
        'data': {
            'newly_completed': result['newly_completed'],
            'reward_gem': result['reward_gem'],
            'unlocks': result['unlocks'],
            **status,
        },
    }), 200
