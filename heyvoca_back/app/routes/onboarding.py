"""온보딩 (트랙 ⑤) — 게스트 맛보기 → 가입 → 데이터 이전 → 점진 해금.

- GET  /onboarding/trial-words   (비인증) 게스트 맛보기 5문제
- POST /onboarding/migrate       (인증) 가입 직후 1회, 맛본 기록을 실제 학습 데이터로 이전
- GET  /onboarding/unlock-status (인증) 세션 수 기반 기능 해금 상태

학습 알고리즘(FSRS) 계산은 services/fsrs를 '호출만' 한다 (재정의 금지).
"""

import json
import datetime as dt
from uuid import UUID

from flask import Blueprint, jsonify, g, request

from app import db
from app.models.models import (
    User, UserVoca, UserVocaBook, UserVocaBookMap, UserStudyLog, UserStudySession,
)
from app.utils.jwt_utils import jwt_required

onboarding_bp = Blueprint('onboarding', __name__, url_prefix='/onboarding')

# 순한 해금(승인) — 홈·마이페이지는 즉시. 완료 세션 수 기준 임계값.
UNLOCK_THRESHOLDS = {'vocabook': 1, 'store': 2, 'dict': 3}
SIGNUP_REWARD_GEM = 5
TRIAL_BOOK_NAME = '맛보기 단어장'
TRIAL_BOOK_COLOR = json.dumps({'background': '#FFEFFA', 'main': '#FF70D4', 'sub': '#FFD2EF'})

# 맛보기 5문제 (curated) — id는 온보딩 내부 식별용. resultIndex = options 내 정답 인덱스.
TRIAL_WORDS = [
    {
        'id': 'trial_1', 'origin': 'serendipity',
        'meanings': ['우연한 행운', '뜻밖의 발견'],
        'examples': [{'origin': 'Finding this book was pure serendipity.', 'meaning': '이 책을 찾은 건 순전히 우연한 행운이었다.'}],
        'options': ['우연한 행운', '운명, 숙명', '우연의 일치', '재산, 운'], 'resultIndex': 0,
    },
    {
        'id': 'trial_2', 'origin': 'resilient',
        'meanings': ['회복력 있는', '탄력 있는'],
        'examples': [{'origin': 'Children are often remarkably resilient.', 'meaning': '아이들은 종종 놀랍도록 회복력이 좋다.'}],
        'options': ['깨지기 쉬운', '회복력 있는', '무관심한', '엄격한'], 'resultIndex': 1,
    },
    {
        'id': 'trial_3', 'origin': 'meticulous',
        'meanings': ['꼼꼼한', '세심한'],
        'examples': [{'origin': 'She keeps meticulous records.', 'meaning': '그녀는 꼼꼼하게 기록을 관리한다.'}],
        'options': ['게으른', '대담한', '꼼꼼한', '너그러운'], 'resultIndex': 2,
    },
    {
        'id': 'trial_4', 'origin': 'candid',
        'meanings': ['솔직한', '숨김없는'],
        'examples': [{'origin': 'He gave a candid interview.', 'meaning': '그는 솔직한 인터뷰를 했다.'}],
        'options': ['비밀스러운', '무례한', '지루한', '솔직한'], 'resultIndex': 3,
    },
    {
        'id': 'trial_5', 'origin': 'eloquent',
        'meanings': ['웅변의', '설득력 있는'],
        'examples': [{'origin': 'She gave an eloquent speech.', 'meaning': '그녀는 설득력 있는 연설을 했다.'}],
        'options': ['설득력 있는', '말수가 적은', '혼란스러운', '단조로운'], 'resultIndex': 0,
    },
]
_TRIAL_BY_ID = {w['id']: w for w in TRIAL_WORDS}


@onboarding_bp.route('/trial-words', methods=['GET'])
def trial_words():
    """게스트 맛보기 5문제 (비인증). 채점은 클라이언트/로컬에서."""
    return jsonify({'code': 200, 'data': {'words': TRIAL_WORDS}}), 200


@onboarding_bp.route('/migrate', methods=['POST'])
@jwt_required
def migrate():
    """가입 직후 1회 — 맞춤 설정 저장 + 맛본 단어를 실제 학습 데이터로 이전.

    body: {
      source_channel, learning_goal, username,
      answers: [{word_id, correct}]  # 게스트 로컬 저장분
    }

    멱등: 이미 온보딩 완료(onboarding_ver='1')면 409.
    """
    from app.services.fsrs.state import migrate_v1_to_v2, set_fsrs_state, get_fsrs_state, serialize_user_voca_data
    from app.services.fsrs.scheduler import review as fsrs_review
    from app.services.fsrs.core import GOOD, AGAIN
    from app.routes.study import _classify_memory_state
    from app.routes.common import register_gem_log
    from app.models.models import GemReason

    user_id = UUID(g.user_id)
    body = request.get_json(silent=True) or {}

    user = db.session.query(User).filter(User.id == user_id).with_for_update().first()
    if user is None:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404
    if user.onboarding_ver == '1':
        return jsonify({'code': 409, 'message': '이미 온보딩을 완료했습니다.'}), 409

    answers = body.get('answers') or []
    source_channel = (body.get('source_channel') or None)
    learning_goal = (body.get('learning_goal') or None)
    username = (body.get('username') or '').strip() or None

    now = dt.datetime.utcnow()

    # 맞춤 설정 반영
    user.source_channel = source_channel
    user.learning_goal = learning_goal
    user.onboarding_ver = '1'
    if username and not user.username:
        user.username = username

    # 맛본 단어를 담을 단어장
    book = UserVocaBook(
        user_id=user_id, bookstore_id=None, color=TRIAL_BOOK_COLOR,
        name=TRIAL_BOOK_NAME, total_word_cnt=0, memorized_word_cnt=0,
        voca_list=None, updated_at=now,
    )
    db.session.add(book)
    db.session.flush()

    session = UserStudySession(user_id=user_id, test_type='today',
                               book_ids=json.dumps([str(book.id)]),
                               question_count=0, correct_count=0)
    session.started_at = now
    session.finished_at = now
    db.session.add(session)
    db.session.flush()

    created = 0
    correct_total = 0
    for ans in answers:
        w = _TRIAL_BY_ID.get(ans.get('word_id'))
        if not w:
            continue
        was_correct = bool(ans.get('correct'))
        correct_total += 1 if was_correct else 0

        # UserVoca 생성 (단어 자체를 담아 자립 — voca_id 없음)
        uv = UserVoca(
            user_id=user_id, voca_id=None, word=w['origin'],
            voca_meanings=json.dumps(w['meanings'], ensure_ascii=False),
            voca_examples=json.dumps(w['examples'], ensure_ascii=False),
            data=None,
        )
        db.session.add(uv)
        db.session.flush()

        # FSRS 상태 재생 — 신규 상태에서 정/오답 1회 반영 (services 호출만)
        payload = migrate_v1_to_v2({})
        fsrs_before = get_fsrs_state(payload) or {}
        rating = GOOD if was_correct else AGAIN
        fsrs_after = fsrs_review(fsrs_before, rating, now)
        payload = set_fsrs_state(payload, fsrs_after)
        uv.data = serialize_user_voca_data(payload)

        # 단어장 매핑
        db.session.add(UserVocaBookMap(
            user_voca_book_id=book.id, user_voca_id=uv.id, level=None,
            voca_meanings=json.dumps(w['meanings'], ensure_ascii=False),
            voca_examples=json.dumps(w['examples'], ensure_ascii=False),
            memory_status=None,
        ))

        # 학습 로그
        log = UserStudyLog(
            user_id=user_id, user_voca_id=uv.id, voca_id=None,
            user_voca_book_id=book.id, session_id=session.id,
            test_type='today', question_type='multipleChoice',
            was_correct=was_correct, q_score=5 if was_correct else 0,
            rating=rating, time_taken_ms=3000, word_length=len(w['origin']),
            state_before=json.dumps({'state': 'new', 'stability': 0}, ensure_ascii=False),
            state_after=json.dumps(fsrs_after, ensure_ascii=False),
        )
        log.created_at = now
        db.session.add(log)
        created += 1

    book.total_word_cnt = created
    session.question_count = created
    session.correct_count = correct_total

    db.session.flush()

    # 첫 가입 보상 보석
    reward = 0
    if created > 0:
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
            'migrated_words': created,
            'correct': correct_total,
            'reward_gem': reward,
            'gem_cnt': user.gem_cnt,
            'book_id': str(book.id),
        },
    }), 200


@onboarding_bp.route('/unlock-status', methods=['GET'])
@jwt_required
def unlock_status():
    """세션 수 기반 기능 해금 상태.

    legacy(onboarding_ver NULL)=기존 사용자 → 전부 해금.
    신규(=1) → 완료 세션 수로 단어장/상점/사전 점진 해금.
    """
    user_id = UUID(g.user_id)
    user = db.session.query(User).filter(User.id == user_id).first()
    if user is None:
        return jsonify({'code': 404, 'message': '사용자를 찾을 수 없습니다.'}), 404

    legacy = user.onboarding_ver != '1'

    completed = (
        db.session.query(db.func.count(UserStudySession.id))
        .filter(UserStudySession.user_id == user_id, UserStudySession.finished_at.isnot(None))
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
