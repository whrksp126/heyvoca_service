"""온보딩 (트랙 ⑤) — 게스트 맛보기 → 가입 → 데이터 이전 → 점진 해금.

- GET  /onboarding/books              (비인증) 레벨 카드 목록 (v1)
- GET  /onboarding/level-book?level=N (비인증) 레벨별 단어장(단어 포함) — v1 맛보기 소스.
       응답 전 해당 레벨 단어 TTS를 백그라운드로 미리 생성·캐싱(게스트 무인증 재생 대비).
- GET  /onboarding/placement-pool     (비인증) v2 수준 측정 재료(등급별 단어+쉬운 예문) — 이슈 #25
- GET  /onboarding/recommend-books?theta=N (비인증) v2 측정 수준에 맞는 서점 단어장 3권 — 이슈 #25
       (2차 QA 이후 온보딩 화면은 쓰지 않는다 — 구 번들 호환용으로 남김)
- POST /onboarding/migrate           (인증) 가입 직후 1회. flow='v2' 면 θ 초기화 + 측정 세션 기록 +
       보상(bookstore_id 가 오면 그 서점 단어장 무료 담기 — 구 v2 번들 호환),
       아니면 v1(레벨 단어장 생성 + 맛본 답안 반영 + 보상)
- GET  /onboarding/unlock-status      (인증) 온보딩 퀘스트(7개) 상태. 기능 잠금은 없다(unlocked 전부 true)
- POST /onboarding/mission/complete   (인증) 프론트 신호 미션(search_word/free_test/focus_study) 완료 처리

온보딩 퀘스트 v3(이슈 #25 2차, ONBOARDING_MISSIONS 참고, 순서 무관):
  buy_book · plant_seed · care_farm · search_word · make_book · free_test · focus_study
화면은 order 순으로 '다음 퀘스트'를 안내하지만 완료는 어떤 순서로든 인정한다.
plant_seed/care_farm 은 study.finish_session, make_book/buy_book 은 voca_books.py 훅에서
백엔드가 자동 감지하고, 나머지는 프론트가 /onboarding/mission/complete로 신호를 보낸다.
퀘스트 대상은 v2 온보딩 가입자(test_type='placement' 온보딩 세션 보유)뿐 — 나머지는 legacy.

레벨(1 초등 / 2 중등 / 3 고등 / 4 대학생)별 단어는 AdminVocaBook에서 구성 —
기존 /auth/level_book_list와 동일 소스. 학습 알고리즘(FSRS)은 services/fsrs를 '호출만' 한다.
"""

import json
import logging
import threading
import datetime as dt
from functools import wraps
from uuid import UUID

from flask import Blueprint, jsonify, g, request, current_app

from app import db, cache, limiter
from app.models.models import (
    User, UserVoca, UserVocaBook, UserVocaBookMap, UserStudyLog, UserStudySession,
    Bookstore,
)
from app.utils.jwt_utils import jwt_required
from app.constants.user import apply_signup_username
from app.utils.db_lock import retry_on_deadlock
from app.utils.dict_lang import use_dict_lang, get_dict_lang

onboarding_bp = Blueprint('onboarding', __name__, url_prefix='/onboarding')

# 온보딩(가입 전 맛보기·레벨 단어장)은 영어 고정이다(INTEGRATION_SPEC 4절).
# 게스트 ?lang=ja 나 학습 언어가 ja 인 사용자가 불러도 영어 사전(heyvoca_dict)만 읽고,
# 만드는 단어장/단어/학습 로그도 전부 'en' 으로 기록한다.
ONBOARDING_LANG = 'en'


def english_dict(f):
    """요청 처리 동안 사전 언어를 'en' 으로 고정. jwt_required 아래(안쪽)에 둘 것 — 인증이
    user.learning_lang 으로 확정한 값을 이 블록이 덮어쓰고, 끝나면 원래 값으로 되돌린다."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        with use_dict_lang(ONBOARDING_LANG):
            return f(*args, **kwargs)
    return wrapper

# 기능 잠금은 없앴다(이슈 #25 2차) — 모든 탭·기능을 처음부터 쓸 수 있다. UNLOCK_THRESHOLDS 는
# unlock-status 응답의 하위호환 필드(thresholds/unlocked 키 목록)로만 남긴다. unlocked 는 항상 전부 true.
UNLOCK_THRESHOLDS = {'vocabook': 1, 'store': 2, 'dict': 3, 'listen': 4, 'custom': 5}
# 온보딩 체험(가입) 보상 — 이슈 #25 4차: 정답 수·학습 여부와 무관하게 20개 고정.
# 서점 단어장(최저가)을 가입 직후 바로 살 수 있게 하려는 값이다. v1(구 게스트 호환) 경로도 같은 상수를 쓴다.
SIGNUP_REWARD_GEM = 20

# ──────────────────────────────────────────────
# 온보딩 퀘스트 v3 (7개, 순서 무관 — 이슈 #25 2차)
# ──────────────────────────────────────────────
# key         : 미션 식별자 (UserOnboardingMission.mission_key) — v2 체인과 같은 키는 기존 완료 기록을 그대로 인정
# order       : 화면 노출 순서 / current_mission(미완료 중 order 최소) 판정. 완료 인정에는 쓰지 않는다
# title       : 사용자 노출 한국어 라벨
# unlocks     : 항상 None(기능 잠금 없음). 응답 형태 유지용
# reward_gem  : 완료 보상 보석
#
# 완료 감지 경로:
#   buy_book    — voca_books.create_voca_book 훅: 서점 단어장 담기(무료·유료 모두)
#   plant_seed  — study.finish_session: 새 씨앗 심기(test_type='plant') 세션 완료
#   care_farm   — study.finish_session: 농장 돌보기(복습, test_type='quick') 세션 완료
#   search_word — 프론트 신호(/onboarding/mission/complete)
#   make_book   — voca_books/voca_indexs 훅: 직접 만든 단어장에 단어 추가
#   free_test   — 프론트 신호
#   focus_study — 프론트 신호
ONBOARDING_MISSIONS = [
    {'key': 'buy_book',    'order': 1, 'title': '서점에서 단어장 구매',     'unlocks': None, 'reward_gem': 5},
    {'key': 'plant_seed',  'order': 2, 'title': '새 씨앗 심기',            'unlocks': None, 'reward_gem': 5},
    {'key': 'care_farm',   'order': 3, 'title': '농장 돌보기',             'unlocks': None, 'reward_gem': 5},
    {'key': 'search_word', 'order': 4, 'title': '사전에서 단어 검색',       'unlocks': None, 'reward_gem': 5},
    {'key': 'make_book',   'order': 5, 'title': '단어장 만들고 단어 추가',   'unlocks': None, 'reward_gem': 5},
    {'key': 'free_test',   'order': 6, 'title': '자유 설정 테스트',         'unlocks': None, 'reward_gem': 10},
    {'key': 'focus_study', 'order': 7, 'title': '집중 반복 듣기',           'unlocks': None, 'reward_gem': 10},
]
ONBOARDING_MISSION_BY_KEY = {m['key']: m for m in ONBOARDING_MISSIONS}
ONBOARDING_MISSION_KEYS = set(ONBOARDING_MISSION_BY_KEY.keys())
# /onboarding/mission/complete로 프론트가 직접 신호를 보내는 미션(백엔드 자동 감지 대상 제외).
# buy_book/plant_seed/care_farm/make_book 은 백엔드 훅에서만 완료 처리한다 — API로 임의 완료 방지.
FRONTEND_SIGNAL_MISSION_KEYS = {'search_word', 'free_test', 'focus_study'}
# 구 체인 키. 구 프론트 번들이 보내도 400 대신 200 무시로 응답한다.
LEGACY_MISSION_KEYS = {'ai_test'}

# v2 온보딩(수준 측정형)으로 가입한 사용자 표식 — migrate v2 가 남기는 온보딩 세션의 test_type.
# 이 세션이 있는 사용자만 퀘스트 대상이고, 나머지(이슈 #25 배포 전 가입자·v1 온보딩 가입자)는 legacy.
# onboarding_ver 는 프론트 라우팅이 '1' 로 완료를 판정하므로 그대로 '1' 을 쓰고, 구분은 이 세션으로 한다.
PLACEMENT_SESSION_TYPE = 'placement'


def is_v2_onboarding_user(user_id) -> bool:
    if isinstance(user_id, str):
        user_id = UUID(user_id)
    return db.session.query(UserStudySession.id).filter(
        UserStudySession.user_id == user_id,
        UserStudySession.is_onboarding.is_(True),
        UserStudySession.test_type == PLACEMENT_SESSION_TYPE,
    ).first() is not None


@retry_on_deadlock
def complete_onboarding_mission(user_id, mission_key) -> dict:
    """온보딩 미션을 멱등하게 완료 처리한다.

    이미 완료된 (user_id, mission_key)면 아무 것도 하지 않고 newly_completed=False 반환.
    신규 완료면 UserOnboardingMission row insert + gem_cnt 증가 + gem 로그 기록.

    반환: {'newly_completed': bool, 'reward_gem': int, 'unlocks': str}

    트랜잭션: 호출부는 모두 자기 작업을 커밋한 **뒤에** 부른다. 미션 행 + 보석 + 원장은 커밋 한 번으로
    묶이고(교착 시 통째로 재시도해도 안전 — 완료 여부를 잠금 안에서 다시 보므로 이중 지급 없음),
    make_book 보상 단어장도 같은 커밋에 들어간다(2026-09: 별도 커밋이던 것을 합쳤다).
    """
    from sqlalchemy.exc import IntegrityError
    from app.models.models import UserOnboardingMission, GemReason
    from app.utils.db_lock import begin_user_tx
    from app.utils.gem import change_gem, lock_user_row

    mission = ONBOARDING_MISSION_BY_KEY.get(mission_key)
    if not mission:
        raise ValueError(f'유효하지 않은 온보딩 미션 key: {mission_key}')

    if isinstance(user_id, str):
        user_id = UUID(user_id)

    # User 를 먼저 잠근다(전역 잠금 순서 첫 번째) — 완료 여부 확인·미션 행 INSERT·보석 지급이
    # 같은 사용자 안에서 직렬화된다. 완료 확인은 잠금 **뒤**의 잠금 읽기로 한다(스냅샷이 아닌 최신값).
    begin_user_tx(user_id)   # 첫 문장 = User 잠금(호출부는 모두 자기 커밋 뒤에 부른다)
    user = lock_user_row(user_id)
    if user is None:
        db.session.rollback()
        raise ValueError('사용자를 찾을 수 없습니다.')

    existing = (
        db.session.query(UserOnboardingMission.id)
        .filter(UserOnboardingMission.user_id == user_id, UserOnboardingMission.mission_key == mission_key)
        .with_for_update()
        .first()
    )
    if existing:
        db.session.commit()   # 바꾼 것은 없다 — User 잠금만 푼다(호출부는 모두 자기 커밋 뒤에 부른다)
        return {'newly_completed': False, 'reward_gem': 0, 'unlocks': mission['unlocks']}

    # legacy(v2 온보딩 가입자가 아님) — 미션이 숨겨진 사용자에게 보석·행을 만들지 않는다.
    if not is_v2_onboarding_user(user_id):
        db.session.commit()
        return {'newly_completed': False, 'reward_gem': 0, 'unlocks': mission['unlocks'], 'skipped': 'legacy'}

    # 순서 강제 없음(이슈 #25 2차) — 어떤 퀘스트든 해낸 순간 인정한다.

    reward = mission['reward_gem']
    db.session.add(UserOnboardingMission(user_id=user_id, mission_key=mission_key))
    # 보석 + 원장을 미션 행과 한 트랜잭션으로 커밋한다(예전에는 원장이 별도 커밋이었다).
    change_gem(user_id, reward, GemReason.ONBOARDING_MISSION,
               f"온보딩 미션 완료: {mission['title']}",
               source_type='onboarding_mission', user=user)

    # M2(make_book) 완료 보상: 보석 외에 빈 단어장 1개를 자동 지급한다 — **같은 커밋**으로.
    # 예전에는 미션·보석을 커밋한 뒤 단어장을 따로 커밋해, 그 사이 실패하면 미션은 완료됐는데
    # 보상 단어장만 영영 빠졌다(미션이 이미 완료라 다시 지급할 길이 없다). 이제는 셋이 함께
    # 들어가거나 함께 빠진다 — 빠지면 미션도 미완료로 남아 다음 단어장 생성 때 다시 지급된다.
    if mission_key == 'make_book':
        import json as _json
        db.session.add(UserVocaBook(
            user_id=user_id,
            bookstore_id=None,
            color=_json.dumps({'main': '#FF8DD4', 'sub': '#FF8DD44d', 'background': '#FFEFFA'}, ensure_ascii=False),
            name='나의 단어장',
            total_word_cnt=0,
            memorized_word_cnt=0,
            voca_list=None,
            updated_at=None,
            # 미션을 달성한 요청의 학습 언어 단어장으로 — ja 사용자에게 en 빈 단어장이 숨어 생기지 않게
            language=get_dict_lang(),
        ))

    try:
        db.session.commit()
    except IntegrityError:
        # 동시 요청 등으로 UniqueConstraint 위반 → 이미 다른 요청이 완료 처리한 것으로 간주(멱등).
        db.session.rollback()
        return {'newly_completed': False, 'reward_gem': 0, 'unlocks': mission['unlocks']}

    return {'newly_completed': True, 'reward_gem': reward, 'unlocks': mission['unlocks']}


def _build_unlock_status(user) -> dict:
    """GET /onboarding/unlock-status 및 POST /onboarding/mission/complete가 공유하는 페이로드.

    legacy = v2 온보딩(수준 측정형, migrate flow='v2')으로 가입하지 않은 사용자 — 이슈 #25 배포 전
    가입자와 v1 온보딩 가입자(구 미션 기록 보유 포함). 전부 완료로 간주(퀘스트 숨김).
    v2 가입자는 UserOnboardingMission 완료 기록 기준으로 missions/current_mission을 계산한다.
    unlocked 는 누구에게나 전부 true(기능 잠금 없음).
    """
    from app.models.models import UserOnboardingMission

    legacy = not is_v2_onboarding_user(user.id)

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

    # 기능 잠금 없음 — 구 번들이 잠금 UI 를 띄우지 않도록 전부 true.
    unlocked = {k: True for k in UNLOCK_THRESHOLDS}
    done_count = len(completed_keys & ONBOARDING_MISSION_KEYS)

    return {
        'legacy': legacy,
        # 하위호환용 — 과거 "완료 세션 수" 대신 "완료한 미션 수"로 채운다(프론트 레거시 폴백 대비).
        'completed_sessions': done_count if not legacy else len(ONBOARDING_MISSIONS),
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
    """레벨별 단어장 조회 (AdminVocaBook). 반환: {id,title,color,vocaList:[{origin,meanings,examples,voca_id}]} 또는 None.

    항상 english_dict 데코레이터 아래(g.dict_lang='en')에서 호출된다 — heyvoca_dict 전용
    load_admin_book_texts 를 바로 써도 안전하다.
    """
    from app.models.models import AdminVocaBook, AdminVocaBookMap, Voca
    from app.services.admin_book_refs import load_admin_book_texts

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
    texts_by_map = load_admin_book_texts([amap.id for amap, _ in rows])
    voca_list = [{
        'origin': voca.word,
        'meanings': texts_by_map.get(amap.id, {}).get('meanings', []),
        'examples': texts_by_map.get(amap.id, {}).get('examples', []),
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
@english_dict
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
@english_dict
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


# ──────────────────────────────────────────────
# 온보딩 v2 — 수준 측정형 (이슈 #25)
# ──────────────────────────────────────────────

_PLACEMENT_TTS_PREWARM_KEY = 'onboarding:tts_prewarm:placement'
_PLACEMENT_TTS_PREWARM_TTL = 6 * 3600   # 후보 캐시(onboarding_placement._CACHE_TTL)와 같은 주기


def _trigger_placement_tts_prewarm():
    """수준 측정 후보 전체(단어·예문 en, 뜻·예문 해석 ko)의 음성을 백그라운드로 미리 생성·캐싱.

    게스트·가입 직후 사용자가 캐시 없는 문장을 처음 재생할 때 생성 대기(또는 게스트 404)로
    소리가 안 나던 문제 대응. 후보 집합은 6시간 고정이라 TTL 키로 프로세스·워커 간 중복 트리거를
    막고, 생성 여부는 objectstore 존재 확인으로 정해져 재트리거돼도 재생성되지 않는다.
    """
    try:
        if cache.get(_PLACEMENT_TTS_PREWARM_KEY):
            return
        cache.set(_PLACEMENT_TTS_PREWARM_KEY, '1', timeout=_PLACEMENT_TTS_PREWARM_TTL)
    except Exception:
        return  # Redis 장애 시엔 요청마다 수천 건 스레드가 뜰 수 있어 건너뛴다

    app = current_app._get_current_object()

    def _worker():
        log = logging.getLogger(__name__)
        with app.app_context():
            from app.services.onboarding_placement import placement_tts_items
            from app.services.tts import service
            from app.services.tts.registry import get_provider_for_language
            from app.services.tts.base import TTSError
            from app.utils.dict_lang import use_dict_lang
            try:
                with use_dict_lang(ONBOARDING_LANG):
                    items = placement_tts_items()
            except Exception:
                log.warning('온보딩 측정 TTS prewarm: 후보 조회 실패', exc_info=True)
                return
            providers, created, failed = {}, 0, 0
            for text, lang in items:
                try:
                    if lang not in providers:
                        providers[lang] = get_provider_for_language(lang)
                    key, made, _ = service.ensure_cached(text, lang, provider=providers[lang])
                    if made:
                        created += 1
                    try:
                        cache.set(f'tts:obj:{key}', '1', timeout=7 * 24 * 3600)
                    except Exception:
                        pass
                except TTSError:
                    failed += 1
                    if failed <= 3:
                        log.warning('온보딩 측정 TTS prewarm 실패: %s %r', lang, text[:60], exc_info=True)
                except Exception:
                    failed += 1
                    log.warning('온보딩 측정 TTS prewarm 오류: %s %r', lang, text[:60], exc_info=True)
            log.info('온보딩 측정 TTS prewarm 완료: 대상 %d, 생성 %d, 실패 %d', len(items), created, failed)

    threading.Thread(target=_worker, name='onboarding-tts-prewarm-placement', daemon=True).start()


@onboarding_bp.route('/placement-pool', methods=['GET'])
@limiter.limit('20 per minute')
@english_dict
def placement_pool():
    """적응형 수준 측정 문제 재료 — 비인증. 등급(A1=1 … C1=5)마다 12개 내외, 호출마다 섞인다."""
    from app.services.onboarding_placement import build_placement_pool
    try:
        bands = build_placement_pool()
    except Exception:
        logging.getLogger(__name__).error('placement-pool 생성 실패', exc_info=True)
        return jsonify({'code': 500, 'message': '수준 측정 문제를 준비하지 못했습니다.'}), 500
    _trigger_placement_tts_prewarm()
    return jsonify({'code': 200, 'data': {'bands': bands}}), 200


def _parse_theta(raw):
    """0~100 클램프. 숫자가 아니면 None."""
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if v != v or v in (float('inf'), float('-inf')):   # NaN/inf
        return None
    return max(0.0, min(100.0, v))


@onboarding_bp.route('/recommend-books', methods=['GET'])
@limiter.limit('30 per minute')
@english_dict
def recommend_books():
    """측정된 수준(theta 0~100)에 맞는 서점 단어장 3권 — 비인증."""
    from app.services.onboarding_placement import recommend_books as _recommend
    theta = _parse_theta(request.args.get('theta'))
    if theta is None:
        return jsonify({'code': 400, 'message': 'theta(0~100 숫자)가 필요합니다.'}), 400
    return jsonify({'code': 200, 'data': _recommend(theta)}), 200


@onboarding_bp.route('/migrate', methods=['POST'])
@jwt_required
@english_dict
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
    from app.utils.gem import change_gem, start_user_tx
    from app.models.models import GemReason
    from app.services.game.hooks import on_study_answer

    user_id = UUID(g.user_id)
    body = request.get_json(silent=True) or {}

    # v2(수준 측정형) — flow='v2'. 없고 level 이 있으면 아래 v1 동작 그대로(구 게스트 데이터 호환).
    if body.get('flow') == 'v2':
        return _migrate_v2(user_id, body)

    # 새 트랜잭션의 첫 문장으로 User 를 잠근다(전역 순서 첫 번째 + 최신 잔액).
    user = start_user_tx(user_id)
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
    apply_signup_username(user, body.get('username'))

    # 레벨 단어장 생성 — 헤이보카 검증본 마크(bookstore_id)를 위해 레벨 대응 서점 행을 조회.
    # 못 찾아도(서점 미등록 등) 온보딩 자체는 실패하면 안 되므로 None으로 폴백한다.
    admin_book_id = LEVEL_ADMIN_BOOK.get(level)
    bookstore = (
        Bookstore.query.filter_by(admin_voca_book_id=admin_book_id).first()
        if admin_book_id else None
    )
    vbook = UserVocaBook(
        user_id=user_id, bookstore_id=(bookstore.id if bookstore else None),
        color=json.dumps(book['color'], ensure_ascii=False),
        name=book['title'][:36], total_word_cnt=0, memorized_word_cnt=0,
        voca_list=None, updated_at=now, language=ONBOARDING_LANG,
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
            data=None, dict_lang=ONBOARDING_LANG,
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
                dict_lang=ONBOARDING_LANG,
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
        # 보석과 원장을 온보딩 저장과 한 트랜잭션으로(예전에는 원장이 게임 훅 뒤 별도 커밋이라
        # balance_after 에 훅이 준 보석까지 섞여 들어갔다).
        change_gem(user_id, SIGNUP_REWARD_GEM, GemReason.ACHIEVEMENT, '온보딩 가입 보상',
                   source_type='onboarding', user=user)
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


MIGRATE_MAX_ANSWERS = 100


def _apply_common_settings(user, body):
    """맞춤 설정(유입 경로·목표·하루 새 단어·이름) — v1/v2 공통."""
    daily_limit = body.get('daily_new_limit')
    try:
        daily_limit = int(daily_limit)
    except (TypeError, ValueError):
        daily_limit = DEFAULT_DAILY_LIMIT
    src = body.get('source_channel')
    goal = body.get('learning_goal')
    user.source_channel = (str(src)[:50] if src else None)
    user.learning_goal = (str(goal)[:50] if goal else None)
    user.daily_new_limit = daily_limit if 0 < daily_limit <= 200 else DEFAULT_DAILY_LIMIT
    user.onboarding_ver = '1'
    apply_signup_username(user, body.get('username'))


def _migrate_v2(user_id, body):
    """v2 가입 직후 1회 — 수준 측정 결과 저장 + 보상(+ bookstore_id 가 오면 그 단어장 무료 담기).

    이슈 #25 2차: 온보딩에서 단어장 추천·선택 단계를 없앴다 — bookstore_id 는 선택이다.
    없으면 단어장을 만들지 않는다(독서왕 동기화도 없음). 첫 단어장은 퀘스트 1(buy_book)에서 보석으로 산다.
    bookstore_id 를 보내는 구 v2 번들은 예전처럼 무료로 담긴다.

    body: { flow:'v2', bookstore_id?, theta, answers:[{voca_id, question_type, correct}],
            source_channel, learning_goal, daily_new_limit, username }
    - 온보딩 단어는 심지 않는다(UserVoca/UserVocaBookMap 은 담은 단어장 복사분만).
    - UserStudySession(is_onboarding, test_type='placement') — v2 가입자 표식 겸 측정 기록.
    - 가입 당일을 연속 학습 1일로 인정(streak_v2.qualify_today_for_onboarding).
    멱등: 이미 온보딩 완료(onboarding_ver='1')면 409.
    """
    from app.utils.gem import change_gem, start_user_tx
    from app.models.models import GemReason, UserSkillProfile
    from app.routes.voca_books import create_bookstore_book_for_user
    from app.services import skill_level as SL
    from app.services.onboarding_placement import theta_to_level_id

    # ── 입력 검증(잠금 전에) ──
    raw_bookstore_id = body.get('bookstore_id')
    bookstore_id = None
    if raw_bookstore_id not in (None, ''):
        try:
            bookstore_id = int(raw_bookstore_id)
        except (TypeError, ValueError):
            return jsonify({'code': 400, 'message': 'bookstore_id 가 올바르지 않습니다.'}), 400
    theta = _parse_theta(body.get('theta'))
    if theta is None:
        theta = SL.DEFAULT_THETA
    raw_answers = body.get('answers') or []
    if not isinstance(raw_answers, list):
        return jsonify({'code': 400, 'message': 'answers 는 배열이어야 합니다.'}), 400
    answers = []
    for a in raw_answers[:MIGRATE_MAX_ANSWERS]:
        if not isinstance(a, dict):
            continue
        qtype = a.get('question_type')
        answers.append({
            'question_type': qtype if isinstance(qtype, str) and len(qtype) <= 40 else 'multipleChoice',
            'correct': bool(a.get('correct')),
        })
    studied = len(answers)
    correct_total = sum(1 for a in answers if a['correct'])

    # 사전 DB 읽기 — 사용자 잠금 전에 끝낸다(voca_books.create_voca_book 과 같은 순서)
    bookstore = None
    if bookstore_id is not None:
        bookstore = db.session.query(Bookstore).filter(Bookstore.id == bookstore_id).first()
        if bookstore is None or bookstore.hide == 'Y' or not bookstore.admin_voca_book_id:
            return jsonify({'code': 400, 'message': '담을 수 있는 서점 단어장이 아닙니다.'}), 400

    user = start_user_tx(user_id)
    if user is None:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404
    if user.onboarding_ver == '1':
        db.session.rollback()
        return jsonify({'code': 409, 'message': '이미 온보딩을 완료했습니다.'}), 409

    now = dt.datetime.utcnow()
    try:
        _apply_common_settings(user, body)
        user.level_id = theta_to_level_id(theta)

        # (구 v2 번들) 서점 단어장 무료 담기 — POST /voca_books 서점 담기와 같은 생성 경로
        # (보석 차감 없음, 독서왕 포함). 새 번들은 bookstore_id 를 보내지 않아 단어장이 생기지 않는다.
        vbook, completed_goals = None, []
        if bookstore is not None:
            vbook, completed_goals = create_bookstore_book_for_user(user_id, bookstore, ONBOARDING_LANG)

        session = UserStudySession(user_id=user_id, test_type=PLACEMENT_SESSION_TYPE,
                                   book_ids=json.dumps([str(vbook.id)] if vbook else []),
                                   question_count=studied, correct_count=correct_total,
                                   is_onboarding=True)
        session.started_at = now
        session.finished_at = now
        db.session.add(session)

        # 사용자 수준 θ 초기화 — 측정값으로 덮고, 답변 수·유형 집계를 반영한다.
        profile = SL.load_profile_row(user_id, ONBOARDING_LANG, lock=True, create=True)
        stats = {'theta': theta, 'answers': 0,
                 'type_stats': profile.type_stats or {}, 'error_stats': profile.error_stats or {}}
        for a in answers:
            if SL.counts_for_skill(a['question_type']):
                stats = SL.apply_answer(stats, question_type=a['question_type'],
                                        was_correct=a['correct'], item_score=None)
        profile.theta = round(theta, 3)
        profile.answers = int(profile.answers or 0) + studied
        profile.type_stats = stats['type_stats']
        profile.error_stats = stats['error_stats']

        # 가입 보상 — 정답 수·답변 수와 무관하게 항상 지급(0문항 포함). 이중 지급은 위의
        # onboarding_ver 409 가드(User 행 잠금 뒤 판정)가 막는다 — 같은 트랜잭션에서 '1' 로 바뀐다.
        change_gem(user_id, SIGNUP_REWARD_GEM, GemReason.ACHIEVEMENT, '온보딩 가입 보상',
                   source_type='onboarding', user=user)
        reward = SIGNUP_REWARD_GEM
        db.session.flush()
        if vbook is not None:
            vbook_id, vbook_title, vbook_total = str(vbook.id), vbook.name, vbook.total_word_cnt
        else:
            vbook_id, vbook_title, vbook_total = None, None, 0
        db.session.commit()
    except Exception:
        db.session.rollback()
        logging.getLogger(__name__).error('온보딩 v2 migrate 실패', exc_info=True)
        return jsonify({'code': 500, 'message': '온보딩 저장 중 오류가 발생했습니다.'}), 500

    # 가입 당일 = 학습한 날(연속 학습 1일). 실패해도 온보딩 자체는 성공으로 응답한다.
    streak = None
    try:
        from app.services.game.farm_v2.streak_v2 import qualify_today_for_onboarding
        streak = qualify_today_for_onboarding(user_id, correct_total).get('streak')
    except Exception:
        db.session.rollback()
        logging.getLogger(__name__).warning('온보딩 연속 학습 반영 실패(무해)', exc_info=True)

    try:
        from app.services.recommend.pool import invalidate_pool_cache
        invalidate_pool_cache(user_id)
    except Exception:
        logging.getLogger(__name__).warning('온보딩 migrate 후 추천 풀 캐시 무효화 실패(무해)', exc_info=True)

    gem_cnt = db.session.query(User.gem_cnt).filter(User.id == user_id).scalar()
    from app.services.reading_goal import goals_payload
    return jsonify({
        'code': 200,
        'data': {
            'studied': studied,
            'correct': correct_total,
            'reward': reward,
            'user_voca_book_id': vbook_id,
            # v1 응답과 같은 이름의 보조 필드
            'book_id': vbook_id,
            'book_title': vbook_title,
            'total_words': vbook_total,
            'reward_gem': reward,
            'gem_cnt': gem_cnt,
            'theta': round(theta, 2),
            'level_id': theta_to_level_id(theta),
            'streak': streak,
            'goals': goals_payload(completed_goals),
        },
    }), 200


@onboarding_bp.route('/unlock-status', methods=['GET'])
@jwt_required
def unlock_status():
    """온보딩 퀘스트 상태(7개, 순서 무관). 기능 잠금은 없다 — unlocked 는 전부 true.

    legacy(v2 온보딩 가입자가 아님) → 전부 완료로 간주, 퀘스트 숨김.
    v2 가입자 → 완료 기록 기준 missions/current_mission(미완료 중 order 최소).
    """
    user_id = UUID(g.user_id)
    user = db.session.query(User).filter(User.id == user_id).first()
    if user is None:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404

    return jsonify({'code': 200, 'data': _build_unlock_status(user)}), 200


@onboarding_bp.route('/mission/complete', methods=['POST'])
@jwt_required
def mission_complete():
    """프론트 신호 기반 온보딩 미션 완료 처리 — search_word / free_test / focus_study 전용.

    (buy_book / plant_seed / care_farm / make_book 은 백엔드 훅에서만 완료 처리한다.)

    body: { "key": "search_word" | "free_test" | "focus_study" }

    구 체인 키(ai_test 등)나 백엔드 자동 감지 키가 오면(구 프론트 번들) 400 대신
    200 + newly_completed=False·ignored=True 로 응답한다 — 구 번들이 오류 처리로 깨지지 않게.

    응답: unlock-status와 동일한 missions/unlocked/current_mission 전체를 함께 반환해
    프론트가 재조회 없이 바로 연출·갱신할 수 있도록 한다.
    """
    body = request.get_json(silent=True) or {}
    key = body.get('key')

    if not isinstance(key, str) or not key or len(key) > 32:
        return jsonify({'code': 400, 'message': '유효하지 않은 미션 key입니다.'}), 400

    user_id = UUID(g.user_id)

    if key not in FRONTEND_SIGNAL_MISSION_KEYS:
        user = db.session.query(User).filter(User.id == user_id).first()
        if user is None:
            return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404
        return jsonify({'code': 200, 'data': {
            'newly_completed': False, 'reward_gem': 0, 'unlocks': None, 'ignored': True,
            **_build_unlock_status(user),
        }}), 200

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
