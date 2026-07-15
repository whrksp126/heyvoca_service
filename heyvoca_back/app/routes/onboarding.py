"""온보딩 (트랙 ⑤) — 게스트 맛보기 → 가입 → 데이터 이전 → 점진 해금.

- GET  /onboarding/books              (비인증) 레벨 카드 목록
- GET  /onboarding/level-book?level=N (비인증) 레벨별 단어장(단어 포함) — 맛보기 소스.
       응답 전 해당 레벨 단어 TTS를 백그라운드로 미리 생성·캐싱(게스트 무인증 재생 대비).
- POST /onboarding/migrate           (인증) 가입 직후 1회, 레벨 단어장 생성 + 맛본 답안 반영 + 보상
- GET  /onboarding/unlock-status     (인증) 세션 수 기반 기능 해금 상태(5단계)

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

# 기능 점진 해금(5단계, 승인) — 홈·마이페이지는 즉시. 완료 세션 수 기준 임계값.
#  vocabook(단어장)·store(상점)·dict(사전)은 BottomNav 탭, listen(반복듣기)·custom(커스텀)은 학습 시작 카드.
UNLOCK_THRESHOLDS = {'vocabook': 1, 'store': 2, 'dict': 3, 'listen': 4, 'custom': 5}
SIGNUP_REWARD_GEM = 5

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

    vbook.total_word_cnt = len(book['vocaList'])
    session.question_count = studied
    session.correct_count = correct_total
    db.session.flush()

    reward = 0
    if studied > 0:
        user.gem_cnt = (user.gem_cnt or 0) + SIGNUP_REWARD_GEM
        reward = SIGNUP_REWARD_GEM

    db.session.commit()

    if reward > 0:
        register_gem_log(
            user_id=user_id, amount=reward, reason=GemReason.ACHIEVEMENT,
            description='온보딩 가입 보상',
            source_type='onboarding', source_id=None,
            balance_after=user.gem_cnt,
        )  # register_gem_log 내부 commit

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
    """세션 수 기반 기능 해금 상태(5단계).

    legacy(onboarding_ver NULL)=기존 사용자 → 전부 해금.
    신규(=1) → 완료 세션 수로 단어장/상점/사전/반복듣기/커스텀 점진 해금.
    """
    user_id = UUID(g.user_id)
    user = db.session.query(User).filter(User.id == user_id).first()
    if user is None:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404

    legacy = user.onboarding_ver != '1'
    # 온보딩 가입 세션(is_onboarding=True)은 정규 학습이 아니므로 완료 세션 카운트에서 제외.
    completed = (
        db.session.query(db.func.count(UserStudySession.id))
        .filter(
            UserStudySession.user_id == user_id,
            UserStudySession.finished_at.isnot(None),
            UserStudySession.is_onboarding.is_(False),
        )
        .scalar()
    ) or 0

    if legacy:
        unlocked = {k: True for k in UNLOCK_THRESHOLDS}
    else:
        unlocked = {k: completed >= thr for k, thr in UNLOCK_THRESHOLDS.items()}

    return jsonify({
        'code': 200,
        'data': {
            'legacy': legacy,
            'completed_sessions': int(completed),
            'thresholds': UNLOCK_THRESHOLDS,
            'unlocked': unlocked,
        },
    }), 200
