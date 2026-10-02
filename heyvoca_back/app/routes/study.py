import json
import logging
import random
import re
import datetime as dt
from uuid import UUID, uuid4

from flask import Blueprint, jsonify, request, g
from sqlalchemy import text

from app import db
from app.models.models import UserStudySession, UserStudyLog, UserVoca, UserQuestionTypeStat, User
from app.utils.jwt_utils import jwt_required
from app.utils.db_lock import begin_user_tx
from app.constants.question_types import (
    ALLOWED_QUESTION_TYPES, CROP_STAGE_MAX_TIER, RECOMMENDABLE_QUESTION_TYPES,
)
from app.utils.dict_lang import get_dict_lang
from app.services.ja_fields import (
    load_ja_word_info, load_ja_example_tokens, word_fields, examples_with_tokens,
)

study_bp = Blueprint('study', __name__, url_prefix='/study')

_MAX_LIMIT = 500

# /study/log example_hash 검증 — app.services.sentence_puzzle.sentence_hash()가 만드는
# sha256 hex digest 모양(64자리 소문자 hex)과 일치해야 한다.
_EXAMPLE_HASH_RE = re.compile(r'^[0-9a-f]{64}$')

# 채팅 학습(네이티브 ChatStudyScreen)이 question.language 로 일본어를 다룰 수 있는 최소 앱 버전.
# 미달(또는 버전 판별 불가)이면 ja 모드에서 세션을 주지 않고 업데이트를 안내한다.
CHAT_JA_MIN_APP_VERSION = '1.1.1'

# memory_state 임계점 — 값은 fsrs/thresholds.py 가 단일 소스다.
# 여기에 숫자를 다시 적으면 농장 단계·추천 풀과 조용히 어긋난다(그 파일 주석 참고).
# 기존 이름을 그대로 재노출한다 — study_insights 등이 이 이름으로 가져다 쓴다.
from app.services.fsrs.thresholds import (  # noqa: E402
    STABILITY_SHORT as _STABILITY_SHORT,
    STABILITY_MEDIUM as _STABILITY_MEDIUM,
)


def _build_sentence_question_payload(item, qtype: str, ctx=None) -> dict:
    """fillInTheBlank/fillInTheBlankTyping/sentenceArrangePartial/sentenceArrange/
    listenArrange 전용 payload. 해당 유형이 아니거나 예문이 없으면 {}.

    계약: heyvoca_service/docs/FRESH_SENTENCE_CONTRACT.md (선택 로직) +
    heyvoca_service/docs/SENTENCE_QUESTIONS_CONTRACT.md (조립/타이핑 payload 모양).

    범위: 영어(item.dict_lang == 'en')만 "매번 새 문장"(example_select.choose_example)을
    탄다. 일본어는 기존 동작 그대로(ctx 무시) — fillInTheBlankTyping만 옛 방식(item.examples
    첫 태그 있는 예문)으로 만들고, 조립 3종/새 fillInTheBlank payload는 애초에 ja가
    voca_example_puzzle을 안 써서(example_puzzles 항상 []) 해당 없음.
    """
    if item.dict_lang != 'en':
        if qtype == 'fillInTheBlankTyping':
            from app.services.fill_blank_typing import build_typing_payload
            payload = build_typing_payload(item.word, item.examples)
            return {'typing': payload} if payload else {}
        return {}

    if qtype not in ('fillInTheBlank', 'fillInTheBlankTyping',
                      'sentenceArrangePartial', 'sentenceArrange', 'listenArrange'):
        return {}
    if ctx is None:
        return {}

    from app.services.example_select import choose_example

    if qtype == 'fillInTheBlank':
        ex = choose_example(item, qtype, ctx)
        if not ex:
            return {}
        return {
            'example':      {'origin': ex['origin'], 'meaning': ex['meaning']},
            'example_hash': ex['hash'],
        }

    if qtype == 'fillInTheBlankTyping':
        from app.services.fill_blank_typing import build_typing_payload_for_example
        ex = choose_example(item, qtype, ctx)
        if not ex:
            return {}
        payload = build_typing_payload_for_example(item.word, ex)
        return {'typing': payload, 'example_hash': ex['hash']} if payload else {}

    from app.services.sentence_puzzle import build_arrange_payload

    mode = {'sentenceArrangePartial': 'partial', 'sentenceArrange': 'full', 'listenArrange': 'listen'}[qtype]
    ex = choose_example(item, qtype, ctx)
    if not ex:
        return {}
    payload = build_arrange_payload(
        ex['puzzle'], mode=mode, example_origin=ex['origin'], example_meaning=ex['meaning'],
        easy=bool(getattr(ctx, 'easy', False)),
    )
    return {'arrange': payload, 'example_hash': ex['hash']} if payload else {}


_ARRANGE_TYPES = ('sentenceArrangePartial', 'sentenceArrange', 'listenArrange')


def _demote_arrange_to_general(enriched_items: list) -> list:
    """일반 모드: 조립형 suggested 를 비조립형 일반 유형으로 바꾼다(제자리 수정).

    모든 단어가 먼저 일반 콘텐츠를 풀고, 문장 만들기는 별도 필드(sentence_arrange)로 추가된다.
    반환: 원래 조립형이던 enriched 목록(sentence_arrange 우선 선정 대상, 원래 유형을 '_was_arrange' 에 기록).
    대체: listenArrange→multipleChoiceListening, 그 외(티어 3/4 조립형)→
    fillInTheBlankTyping(티어4 이상) / fillInTheBlank → 모두 못 쓰면 multipleChoice.
    """
    import random
    from app.services.recommend.composer import _item_can_use_question_type as can
    former = []
    for e in enriched_items:
        t = e.get('suggested_question_type')
        if t not in _ARRANGE_TYPES:
            continue
        item = e['_item']
        if t == 'listenArrange':
            prefs = ('multipleChoiceListening', 'fillInTheBlank')
        elif (e.get('tier_shown') or 0) >= 4:
            prefs = ('fillInTheBlankTyping', 'fillInTheBlank')
        else:
            # 티어3 조립형 → 빈칸 채우기/빈칸 입력 반반(입력형이 고난도 tier 에만 나와 거의 안 보이던 문제 보완)
            prefs = (('fillInTheBlank', 'fillInTheBlankTyping') if random.random() < 0.5
                     else ('fillInTheBlankTyping', 'fillInTheBlank'))
        e['suggested_question_type'] = next((q for q in prefs if can(item, q)), 'multipleChoice')
        e['_was_arrange'] = t
        former.append(e)
    return former


def _select_sentence_arrange(enriched_items: list, former: list, ctx, minimum: int = 3, maximum: int = 4) -> dict:
    """문장 만들기를 붙일 단어 선정 + payload 생성. 반환: {user_voca_id: {question_type, question_payload}}.

    예전에 조립형으로 배정되던 단어(former) 우선, 부족하면 조각이 usable 한 단어를 무작위로 채워
    최소 minimum 개를 보장(payload 가 실제로 만들어진 것만 센다). 최대 maximum 개.
    """
    import random
    from app.services.recommend.composer import _item_can_use_question_type as can
    if ctx is None:
        return {}
    former_ids = {id(e) for e in former}
    first = [e for e in former if can(e['_item'], 'sentenceArrange')]
    random.shuffle(first)
    rest = [e for e in enriched_items if id(e) not in former_ids and can(e['_item'], 'sentenceArrange')]
    random.shuffle(rest)
    target = min(maximum, max(minimum, len(first)))
    out = {}
    for e in first + rest:
        if len(out) >= target:
            break
        was = e.get('_was_arrange')
        order = ('listenArrange',) if was == 'listenArrange' else ()
        for t in order + ('sentenceArrangePartial', 'sentenceArrange'):
            pl = _build_sentence_question_payload(e['_item'], t, ctx)
            if pl:
                out[e['_item'].user_voca_id] = {'question_type': t, 'question_payload': pl}
                break
    return out


def _prefer_partial_arrange(enriched_items: list) -> None:
    """문장 만들기는 전체 조립(sentenceArrange)보다 부분 빈칸(sentenceArrangePartial)을 우선한다(제자리 수정).
    두 유형은 같은 puzzle 자격을 쓰므로 안전하게 치환 가능."""
    for e in enriched_items:
        if e.get('suggested_question_type') == 'sentenceArrange':
            e['suggested_question_type'] = 'sentenceArrangePartial'


def _build_selection_ctx(user_id, items, lang: str, easy: bool = False):
    """items(en) 대상 "매번 새 문장" SelectionContext 빌드. ja면 None(ctx 자체를 안 씀).

    호출부(recommend/requeue-easier)가 실제로 응답에 실을 item들만 넘겨야 한다 —
    전체 풀이 아니라 이번 응답 분량(<=50개)이라 쿼리 비용이 작다.
    """
    if lang != 'en' or not items:
        return None
    from app.services.example_select import build_selection_context
    user_level_id = db.session.query(User.level_id).filter(User.id == user_id).scalar()
    voca_ids = [it.user_voca_id for it in items]
    return build_selection_context(user_id, voca_ids, user_level_id=user_level_id, lang='en', easy=easy)


def _serialize_recommend_item(item, *, suggested_question_type, tier_target, tier_shown,
                               reason, priority_bucket, lang, ja_info, ja_tokens, ctx=None) -> dict:
    """/study/recommend 문항 하나 + /study/requeue-easier 응답을 만드는 공용 직렬화.

    두 엔드포인트가 같은 모양(계약: SENTENCE_QUESTIONS_CONTRACT.md)을 내야 어긋나지 않는다.
    """
    fsrs = item.fsrs_state or {}
    return {
        'user_voca_id':            item.user_voca_id,
        'user_voca_book_id':       str(item.user_voca_book_id) if item.user_voca_book_id else None,
        'voca_id':                 item.voca_id,
        'word':                    item.word,
        **word_fields(lang, item.voca_id, ja_info),
        'meanings':                item.meanings,
        'concept_ids':             item.concept_ids,
        'meaning_concepts':        item.meaning_concepts,
        'examples':                examples_with_tokens(lang, item.voca_id, item.examples, ja_tokens),
        'fsrs': {
            'state':          fsrs.get('state', 'new'),
            'stability':      fsrs.get('stability', 0.0),
            'difficulty':     fsrs.get('difficulty', 0.0),
            'retrievability': fsrs.get('retrievability', 0.0),
            'next_review':    fsrs.get('next_review'),
            'last_review':    fsrs.get('last_review'),
            'reps':           fsrs.get('reps', 0),
            'lapses':         fsrs.get('lapses', 0),
        },
        'priority_bucket':         priority_bucket,
        'suggested_question_type': suggested_question_type,
        'reason':                  reason,
        'tier_target':             tier_target,
        'tier_shown':              tier_shown,
        'question_payload':        _build_sentence_question_payload(item, suggested_question_type, ctx),
    }


def _clamp_limit(raw, default=20):
    """limit 파라미터를 1~_MAX_LIMIT 범위로 클램프."""
    try:
        val = int(raw)
    except (TypeError, ValueError):
        val = default
    return max(1, min(val, _MAX_LIMIT))


def _classify_memory_state(fsrs_state: dict) -> str:
    """FSRS state → 기억 단계 분류."""
    if not fsrs_state or fsrs_state.get("state") in ("new", None):
        return "unlearned"
    s = float(fsrs_state.get("stability") or 0.0)
    if s < _STABILITY_SHORT:
        return "short"
    elif s < _STABILITY_MEDIUM:
        return "medium"
    return "long"


# ──────────────────────────────────────────────
# 디버그용 엔드포인트 (Phase 1.1에서 신설, 유지)
# ──────────────────────────────────────────────

@study_bp.route('/sessions/recent', methods=['GET'])
@jwt_required
def get_recent_sessions():
    """디버그용: 본인 세션 최신순 반환."""
    user_id = UUID(g.user_id)
    limit = _clamp_limit(request.args.get('limit', 20))

    sessions = (
        UserStudySession.query
        .filter_by(user_id=user_id)
        .order_by(UserStudySession.started_at.desc())
        .limit(limit)
        .all()
    )

    data = [
        {
            'id':             str(s.id),
            'test_type':      s.test_type,
            'book_ids':       s.book_ids,
            'question_count': s.question_count,
            'correct_count':  s.correct_count,
            'started_at':     s.started_at.isoformat() if s.started_at else None,
            'finished_at':    s.finished_at.isoformat() if s.finished_at else None,
        }
        for s in sessions
    ]

    return jsonify({'code': 200, 'data': data}), 200


@study_bp.route('/logs', methods=['GET'])
@jwt_required
def get_logs():
    """디버그용: 본인 학습 로그 최신순 반환."""
    user_id = UUID(g.user_id)
    limit = _clamp_limit(request.args.get('limit', 200))

    logs = (
        UserStudyLog.query
        .filter_by(user_id=user_id, dict_lang=get_dict_lang())
        .order_by(UserStudyLog.created_at.desc())
        .limit(limit)
        .all()
    )

    data = [
        {
            'id':               l.id,
            'user_voca_id':     l.user_voca_id,
            'voca_id':          l.voca_id,
            'user_voca_book_id': str(l.user_voca_book_id) if l.user_voca_book_id else None,
            'session_id':       str(l.session_id) if l.session_id else None,
            'test_type':        l.test_type,
            'question_type':    l.question_type,
            'was_correct':      l.was_correct,
            'q_score':          l.q_score,
            'rating':           l.rating,
            'time_taken_ms':    l.time_taken_ms,
            'word_length':      l.word_length,
            'dict_lang':        l.dict_lang,
            'created_at':       l.created_at.isoformat() if l.created_at else None,
        }
        for l in logs
    ]

    return jsonify({'code': 200, 'data': data}), 200


# ──────────────────────────────────────────────
# Phase 1.2 신규 엔드포인트
# ──────────────────────────────────────────────

@study_bp.route('/sessions', methods=['POST'])
@jwt_required
def create_session():
    """
    학습 세션 시작.

    요청:
      { "test_type": "test|exam|today|quick", "book_ids": ["uuid", ...] }

    응답:
      { "code": 201, "data": { "session_id": "<uuid>" } }
    """
    user_id = UUID(g.user_id)
    req = request.get_json(silent=True) or {}

    test_type = req.get('test_type', 'test')
    if test_type not in ('test', 'exam', 'today', 'quick'):
        test_type = 'test'

    book_ids = req.get('book_ids')
    book_ids_json = json.dumps(book_ids, ensure_ascii=False) if book_ids else None

    session = UserStudySession(
        user_id=user_id,
        test_type=test_type,
        book_ids=book_ids_json,
    )
    try:
        db.session.add(session)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('세션 생성 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '세션 생성에 실패했습니다.'}), 500

    return jsonify({'code': 201, 'data': {'session_id': str(session.id)}}), 201


@study_bp.route('/log', methods=['POST'])
@jwt_required
def post_study_log():
    """
    단어 1회 학습 결과 기록 + FSRS 상태 갱신.

    요청:
      {
        "session_id":       "<uuid>",
        "user_voca_id":     12345,
        "user_voca_book_id": "<uuid>",   // optional
        "question_type":    "multipleChoice",
        "was_correct":      true,
        "time_taken_ms":    7800,
        "client_now":       "2026-05-07T11:23:01Z"  // optional
      }

    응답:
      {
        "code": 200,
        "data": {
          "rating": 3,
          "fsrs": { ... },
          "memory_state_change": { "from": "short", "to": "medium" }
        }
      }
    """
    from app.services.fsrs.state import (
        parse_user_voca_data, serialize_user_voca_data,
        get_fsrs_state, set_fsrs_state,
        migrate_v1_to_v2, is_v1,
        set_mastery,
    )
    from app.services.fsrs.scheduler import review as fsrs_review
    from app.services.fsrs.ratings import derive_rating, rating_to_q_score

    user_id = UUID(g.user_id)
    req = request.get_json(silent=True) or {}

    # ── 필수 파라미터 검증 ──
    session_id_str  = req.get('session_id')
    user_voca_id    = req.get('user_voca_id')
    question_type   = req.get('question_type', 'multipleChoice')
    was_correct     = req.get('was_correct')
    time_taken_ms   = req.get('time_taken_ms', 0)
    # 2026-09 "출제형 문제 1단계" — 난이도 tier 기록(계약: SENTENCE_QUESTIONS_CONTRACT.md).
    # 둘 다 optional(구버전 프론트/기존 유형은 안 보낼 수 있음) — 1~5 밖 값은 무시.
    tier_target_raw = req.get('tier_target')
    tier_shown_raw  = req.get('tier_shown')
    tier_target = tier_target_raw if isinstance(tier_target_raw, int) and 1 <= tier_target_raw <= 5 else None
    tier_shown  = tier_shown_raw if isinstance(tier_shown_raw, int) and 1 <= tier_shown_raw <= 5 else None
    # fillInTheBlankTyping 오타 허용 정답 — FSRS 자동 평가를 Hard(2)로 고정한다.
    typo = bool(req.get('typo', False))
    # "매번 새 문장"(2026-09-30) — 이 문제에 쓰인 예문의 sentence_hash. optional(구버전
    # 앱/문장 없는 유형은 안 보냄), 64자리 hex가 아니면 조용히 무시(NULL 저장).
    example_hash_raw = req.get('example_hash')
    example_hash = (
        example_hash_raw if isinstance(example_hash_raw, str) and _EXAMPLE_HASH_RE.match(example_hash_raw)
        else None
    )

    if not session_id_str or user_voca_id is None or was_correct is None:
        return jsonify({'code': 400, 'message': 'session_id, user_voca_id, was_correct는 필수입니다.'}), 400

    if question_type not in ALLOWED_QUESTION_TYPES:
        return jsonify({'code': 400, 'message': f'지원하지 않는 question_type입니다: {question_type}'}), 400

    try:
        session_uuid = UUID(session_id_str)
    except (ValueError, AttributeError):
        return jsonify({'code': 400, 'message': '유효하지 않은 session_id 형식입니다.'}), 400

    # optional
    user_voca_book_id_str = req.get('user_voca_book_id')
    user_voca_book_uuid: UUID = None
    if user_voca_book_id_str:
        try:
            user_voca_book_uuid = UUID(user_voca_book_id_str)
        except (ValueError, AttributeError):
            pass

    # client_now 파싱 (없으면 서버 utcnow)
    client_now_str = req.get('client_now')
    if client_now_str:
        try:
            now = dt.datetime.fromisoformat(str(client_now_str).replace("Z", "+00:00"))
            now = now.replace(tzinfo=None)
        except (ValueError, AttributeError):
            now = dt.datetime.utcnow()
    else:
        now = dt.datetime.utcnow()

    # ── 전역 잠금 순서: User 먼저 (`app/utils/db_lock.py`) ──
    # 이 트랜잭션은 UserVoca 를 FOR UPDATE 로 잡은 뒤 학습 로그·유형 통계 행을 INSERT 한다.
    # 그 INSERT 의 FK 검사가 User 행에 공유 잠금을 거는데, 진단 확정(complete_diagnosis)은
    # User → UserVoca 순이라, 같은 진단 단어를 두 기기에서 동시에 풀면 서로 엇갈릴 수 있었다.
    # User PK 한 행 잠금이라 비용은 작고, 막히는 건 같은 사용자의 동시 쓰기 트랜잭션뿐이다
    # (어차피 로그 INSERT 에서 같은 User 를 기다렸다). 먼저 롤백하는 이유는 요청 진입부에서
    # 잡힌 스냅샷을 버려, 아래 멱등 가드(같은 세션·단어 로그 존재 확인)가 잠금 뒤 최신 데이터를
    # 보게 하려는 것이다(`app.utils.gem.start_user_tx` 주석). 이 시점엔 바꾼 것이 없다.
    begin_user_tx(user_id)

    # ── 권한 검증 ──
    session_obj = UserStudySession.query.filter_by(
        id=session_uuid, user_id=user_id
    ).first()
    if not session_obj:
        return jsonify({'code': 403, 'message': '세션 접근 권한이 없습니다.'}), 403

    # ── UserVoca SELECT FOR UPDATE (row 락) ──
    user_voca = (
        db.session.query(UserVoca)
        .filter(UserVoca.id == user_voca_id, UserVoca.user_id == user_id)
        .with_for_update()
        .first()
    )
    if not user_voca:
        return jsonify({'code': 403, 'message': '단어 접근 권한이 없습니다.'}), 403

    # ── 멱등 가드: 같은 세션에서 같은 단어의 로그가 이미 있으면 재적용하지 않는다 ──
    # 프론트는 세션당 단어 1회(첫 시도)만 이 엔드포인트를 부르도록 설계돼 있다(재출제는
    # 프론트에서 스킵). 하지만 클라이언트가 재전송하는 경로(예: 백그라운드 복귀 직후 로컬
    # 중복 방지 상태가 유실된 채 같은 답을 다시 채점하는 경우)가 완전히 막혀 있다는 보장이
    # 없어서, 서버에서도 같은 (session_id, user_voca_id) 조합의 두 번째 요청은 FSRS review를
    # 다시 적용하지 않고 직전 저장된 결과를 그대로 돌려준다 — review()를 두 번 적용하면
    # 실제 학습량보다 stability/pct가 과다 상승하는 데이터 오염으로 이어진다.
    # (UserVoca 행 락을 먼저 잡아 동시 중복 요청도 여기서 직렬화된다.)
    existing_log = (
        UserStudyLog.query
        .filter_by(session_id=session_uuid, user_voca_id=user_voca_id)
        .order_by(UserStudyLog.created_at.desc())
        .first()
    )
    if existing_log is not None:
        try:
            dup_fsrs_after = json.loads(existing_log.state_after) if existing_log.state_after else {}
        except (TypeError, ValueError):
            dup_fsrs_after = {}
        try:
            dup_fsrs_before = json.loads(existing_log.state_before) if existing_log.state_before else {}
        except (TypeError, ValueError):
            dup_fsrs_before = {}
        logging.getLogger(__name__).warning(
            '[study/log] 중복 요청 무시 — session_id=%s user_voca_id=%s',
            session_id_str, user_voca_id,
        )
        return jsonify({
            'code': 200,
            'data': {
                'rating': existing_log.rating,
                'fsrs': dup_fsrs_after,
                'memory_state_change': {
                    'from': _classify_memory_state(dup_fsrs_before),
                    'to':   _classify_memory_state(dup_fsrs_after),
                },
                'combo': None,
                'farm': None,
                'streak': None,
                'duplicate': True,
            },
        }), 200

    # ── FSRS state 로드 ──
    payload = parse_user_voca_data(user_voca.data)

    # v1이면 즉석에서 v2로 마이그레이션 (FSRS state 초기화)
    if is_v1(payload):
        payload = migrate_v1_to_v2(payload)

    fsrs_state_before = get_fsrs_state(payload) or {}

    memory_state_before = _classify_memory_state(fsrs_state_before)

    # ── lapse_history / prior_correct_rate 조회 (Phase 2.3, 1쿼리로 묶음) ──
    # ja 는 띄어쓰기가 없으므로 글자 수 그대로(한자·가나 1자 = 1)를 쓴다.
    word_length      = len(user_voca.word) if user_voca.word else None
    fsrs_difficulty  = fsrs_state_before.get('difficulty') if fsrs_state_before else None

    lapse_history: list = []
    prior_correct_rate = None
    try:
        recent_logs_raw = (
            UserStudyLog.query
            .filter_by(user_voca_id=user_voca_id, user_id=user_id)
            .order_by(UserStudyLog.created_at.desc())
            .limit(5)
            .all()
        )
        if recent_logs_raw:
            # 직전 로그의 lapse 여부 (lapse_history[0] = 직전 rating==1 여부)
            lapse_history = [bool(log.rating == 1) for log in recent_logs_raw]
            # 최근 5개 정답률
            correct_cnt = sum(1 for log in recent_logs_raw if log.was_correct)
            prior_correct_rate = correct_cnt / len(recent_logs_raw)
    except Exception:
        pass  # 조회 실패 시 폴백 (소프트 lapse 미적용)

    # ── FSRS 계산 ──
    rating = derive_rating(
        bool(was_correct),
        int(time_taken_ms),
        word_length=word_length,
        fsrs_difficulty=float(fsrs_difficulty) if fsrs_difficulty is not None else None,
        question_type=question_type,
        typo=typo,
    )
    fsrs_state_after = fsrs_review(
        fsrs_state_before,
        rating,
        now,
        lapse_history=lapse_history,
        prior_correct_rate=prior_correct_rate,
        # 새 씨앗 심기 세션(test_type='plant')에서 처음 푼 새 단어는 오답이어도 '심은 씨앗'으로
        # 확정한다 — 안 그러면 new 로 남아 다음 plant 후보에 같은 단어가 또 나온다(2026-10 QA).
        plant_first=(session_obj.test_type == 'plant'),
    )

    memory_state_after = _classify_memory_state(fsrs_state_after)

    # ── payload 업데이트 ──
    payload = set_fsrs_state(payload, fsrs_state_after)
    # mastery 비정규화(2026-09) — 추천 알고리즘의 "약함 점수"용. 이미 잠그고 쓰는 이 행에
    # 필드만 더 얹는 것이라 추가 쿼리·추가 락 없음(중복 요청은 위 멱등 가드에서 이미 리턴됨).
    payload = set_mastery(payload, bool(was_correct), now.isoformat() + "Z")

    user_voca.data       = serialize_user_voca_data(payload)
    user_voca.updated_at = dt.datetime.utcnow()

    # ── tier 진행 상태 정본 갱신(2026-09 2차 보완) ──
    # tier_target/tier_shown이 둘 다 있는 요청(자동 추천 경로)만 갱신한다. 설정 시트로
    # 유형을 직접 고른 테스트나 requeue-easier 응답(tier_target=null)처럼 tier 진행에
    # 포함되지 않는 답변은 마지막 tier 상태를 건드리지 않는다 — 이미 잠그고 쓰는 이
    # 행에 필드만 더 얹는 것이라 추가 쿼리·추가 락 없음(mastery와 동일 패턴).
    if tier_target is not None and tier_shown is not None:
        user_voca.tier_target  = tier_target
        user_voca.tier_shown   = tier_shown
        user_voca.tier_correct = bool(was_correct)

    # ── UserStudyLog INSERT ──
    q_score = rating_to_q_score(rating)

    log = UserStudyLog(
        user_id=user_id,
        user_voca_id=user_voca_id,
        session_id=session_uuid,
        test_type=session_obj.test_type,
        question_type=question_type,
        was_correct=bool(was_correct),
        q_score=q_score,
        time_taken_ms=int(time_taken_ms),
        voca_id=user_voca.voca_id,
        user_voca_book_id=user_voca_book_uuid,
        rating=rating,
        word_length=word_length,
        state_before=json.dumps(fsrs_state_before, ensure_ascii=False) if fsrs_state_before else None,
        state_after=json.dumps(fsrs_state_after, ensure_ascii=False),
        # 통계 필터용 사전 언어. 요청 언어(get_dict_lang())가 아니라 단어 자체의 언어를 쓴다 —
        # 세션 도중 학습 언어를 바꾼 뒤 이전 언어 단어 로그가 늦게 도착해도 올바르게 분류된다.
        dict_lang=user_voca.dict_lang or get_dict_lang(),
        tier_target=tier_target,
        tier_shown=tier_shown,
        example_hash=example_hash,
    )
    db.session.add(log)

    # ── 세션 카운터 업데이트 ──
    session_obj.question_count = (session_obj.question_count or 0) + 1
    if bool(was_correct):
        session_obj.correct_count = (session_obj.correct_count or 0) + 1

    # ── UserQuestionTypeStat UPSERT (Phase 2.1) ──
    stat = (
        db.session.query(UserQuestionTypeStat)
        .filter_by(user_id=user_id, question_type=question_type)
        .with_for_update()
        .first()
    )
    if stat is None:
        stat = UserQuestionTypeStat(
            user_id=user_id,
            question_type=question_type,
            total_count=1,
            correct_count=1 if bool(was_correct) else 0,
            avg_time_taken_ms=int(time_taken_ms),
            last_30d_correct_rate=None,
        )
        db.session.add(stat)
    else:
        stat.total_count += 1
        if bool(was_correct):
            stat.correct_count += 1
        stat.avg_time_taken_ms = round(0.9 * stat.avg_time_taken_ms + 0.1 * int(time_taken_ms))
        stat.updated_at = dt.datetime.utcnow()

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('학습 로그 저장 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '학습 로그 저장에 실패했습니다.'}), 500

    # 학습 완료 후 recommend pool 캐시 무효화 (stale 방지)
    try:
        from app.services.recommend.pool import invalidate_pool_cache
        invalidate_pool_cache(user_id)
    except Exception:
        pass  # 캐시 무효화 실패는 비치명적

    # ── 게임 레이어 hook (콤보/농장/연속 학습일) — 학습 커밋 이후 별도 트랜잭션 ──
    # 여기서의 실패는 학습 저장에 영향 없음. 게임 로직은 services/game/에만 둔다.
    # session_id 는 농장 V2 가 요구한다(씨앗 구간 독립 정답 판정 + 세션 종료 요약).
    game_payload = {'combo': None, 'farm': None, 'streak': None}
    try:
        from app.services.game.hooks import on_study_answer
        game_payload = on_study_answer(
            user_id, session_obj.test_type, bool(was_correct),
            user_voca_id=user_voca_id, memory_state_after=memory_state_after,
            session_id=session_uuid,
            # 진행 막대의 '학습 전' 값 — 여기서 안 넘기면 농장은 이미 커밋된 새 상태밖에 못 본다
            fsrs_before=fsrs_state_before,
        )
    except Exception:
        db.session.rollback()
        logging.getLogger(__name__).warning('game hook 실패 (학습 저장은 정상)', exc_info=True)

    return jsonify({
        'code': 200,
        'data': {
            'rating': rating,
            'fsrs': fsrs_state_after,
            'memory_state_change': {
                'from': memory_state_before,
                'to':   memory_state_after,
            },
            'combo':  (game_payload or {}).get('combo'),
            'farm':   (game_payload or {}).get('farm'),
            'streak': (game_payload or {}).get('streak'),
        },
    }), 200


@study_bp.route('/example-seen', methods=['POST'])
@jwt_required
def post_example_seen():
    """POST /study/example-seen — '본 예문' 가벼운 노출 기록(배치).

    FSRS·XP·콤보·스트릭·일일 신규 카운트에 아무 영향이 없다(user_example_seen 한 테이블에만 INSERT).
    문장 만들기 오답처럼 /study/log 를 안 보내는 경로에서도 최근 본 문장 회피가 동작하게 한다.

    요청: {"items": [{"user_voca_id": 123, "example_hash": "<64hex>"}, ...]}  (최대 100개)
    응답: {"code":200, "data": {"recorded": n}}  — 내 단어가 아니거나 hash 형식이 틀린 항목은 조용히 무시.
    """
    user_id = UUID(g.user_id)
    req = request.get_json(silent=True) or {}
    raw = req.get('items')
    if not isinstance(raw, list):
        return jsonify({'code': 400, 'message': 'items 배열이 필요합니다.'}), 400
    pairs = []
    seen_pairs = set()
    for it in raw[:100]:
        if not isinstance(it, dict):
            continue
        uvid, h = it.get('user_voca_id'), it.get('example_hash')
        if isinstance(uvid, bool) or not isinstance(uvid, int):
            continue
        if not isinstance(h, str) or not _EXAMPLE_HASH_RE.match(h):
            continue
        if (uvid, h) in seen_pairs:
            continue
        seen_pairs.add((uvid, h))
        pairs.append((uvid, h))
    if not pairs:
        return jsonify({'code': 200, 'data': {'recorded': 0}}), 200

    from app.models.models import UserExampleSeen
    try:
        owned = {r[0] for r in db.session.query(UserVoca.id).filter(
            UserVoca.user_id == user_id, UserVoca.id.in_({p[0] for p in pairs})).all()}
        now = dt.datetime.utcnow()
        rows = [UserExampleSeen(user_id=user_id, user_voca_id=u, example_hash=h, seen_at=now)
                for u, h in pairs if u in owned]
        if rows:
            db.session.add_all(rows)
            # 테이블이 무한히 자라지 않게 윈도우(30일)보다 충분히 오래된 이 사용자 행은 정리한다.
            db.session.query(UserExampleSeen).filter(
                UserExampleSeen.user_id == user_id,
                UserExampleSeen.seen_at < now - dt.timedelta(days=60),
            ).delete(synchronize_session=False)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logging.getLogger(__name__).error('example-seen 저장 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '저장에 실패했습니다.'}), 500
    return jsonify({'code': 200, 'data': {'recorded': len(rows)}}), 200


@study_bp.route('/today-summary', methods=['GET'])
@jwt_required
def today_summary():
    """오늘(KST) 처음 학습한 새 단어 수(누적).

    state_before가 new/없음인 로그의 distinct user_voca_id 수 → 한 단어를
    여러 세션에서 학습해도 1회만 계산. 메인 동기부여 멘트("새 단어 N개")용.
    """
    user_id = UUID(g.user_id)
    # 하루 경계 = APP_TZ + 새벽 컷오프 (logical_day_start_utc 단일 소스)
    from app.services.study_day import logical_day_start_utc
    day_start_utc = logical_day_start_utc()

    rows = (
        db.session.query(UserStudyLog.user_voca_id, UserStudyLog.state_before)
        .filter(
            UserStudyLog.user_id == user_id,
            UserStudyLog.dict_lang == get_dict_lang(),
            UserStudyLog.created_at >= day_start_utc,
        )
        .all()
    )

    new_ids = set()
    studied_ids = set()
    for vid, state_before in rows:
        studied_ids.add(vid)
        is_new = False
        if not state_before:
            is_new = True
        else:
            try:
                st = json.loads(state_before)
                if not st or st.get('state') in ('new', None):
                    is_new = True
            except Exception:
                is_new = False
        if is_new:
            new_ids.add(vid)

    # 오늘 복습 완료 수 = 오늘 학습한 단어 중 신규 도입이 아닌 단어(distinct)
    reviews_done = len(studied_ids - new_ids)

    return jsonify({
        'code': 200,
        'data': {'new_words': len(new_ids), 'reviews_done': reviews_done},
    }), 200


@study_bp.route('/review-schedule', methods=['GET'])
@jwt_required
def review_schedule():
    """마이페이지 '복습 일정/분포' — 암기상태 분포 + due 카운트 + 날짜별 복습 예정 단어.

    응답:
      {
        "distribution": {"new":n,"short":n,"medium":n,"long":n},  # 암기상태 분포(칩 개수)
        "due":          {"overdue":n,"today":n},
        "total":        n,
        "today":        "YYYY-MM-DD",   # logical today(KST+컷오프)
        "days":         [{"date":"YYYY-MM-DD","count":n,
                          "words":[{"user_voca_id","word","meaning"}]}, ...]  # 캘린더용
      }
    """
    from app.services.recommend.pool import build_candidate_pool
    from app.services.study_day import logical_today, logical_date

    user_id = UUID(g.user_id)

    try:
        pool = build_candidate_pool(user_id, None)
    except Exception:
        logging.getLogger(__name__).error('review-schedule pool 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500

    today = logical_today()
    distribution = {'new': 0, 'short': 0, 'medium': 0, 'long': 0}
    due = {'overdue': 0, 'today': 0}
    days_map: dict = {}   # date_str -> [word dict]  (오늘 + 향후 복습 예정)

    # 풀은 이미 현재 학습 언어로 한정돼 있다. ja 면 단어 요약에 reading 을 붙인다.
    lang = get_dict_lang()
    ja_info = load_ja_word_info(it.voca_id for it in pool) if lang == 'ja' else {}

    def _word_entry(it):
        entry = {
            'user_voca_id': it.user_voca_id,
            'word':         it.word,
            'meaning':      it.meanings[0] if it.meanings else '',
            'language':     lang,
        }
        if lang == 'ja':
            entry['reading'] = (ja_info.get(it.voca_id) or {}).get('reading')
        return entry

    for it in pool:
        b = it.bucket
        if b == 'new':
            distribution['new'] += 1
        elif b == 'overdue':
            due['overdue'] += 1
        elif b == 'today':
            due['today'] += 1
            days_map.setdefault(today.isoformat(), []).append(_word_entry(it))
        elif b in ('short', 'medium', 'long'):
            distribution[b] += 1
            nr = (it.fsrs_state or {}).get('next_review')
            if nr:
                try:
                    nr_dt = dt.datetime.fromisoformat(
                        str(nr).replace('Z', '+00:00')
                    ).replace(tzinfo=None)
                    nr_date = logical_date(nr_dt)
                except (ValueError, AttributeError):
                    nr_date = None
                if nr_date and nr_date >= today:
                    days_map.setdefault(nr_date.isoformat(), []).append(_word_entry(it))

    days = []
    for date_str in sorted(days_map.keys()):
        words = sorted(days_map[date_str], key=lambda w: (w['word'] or '').lower())
        days.append({'date': date_str, 'count': len(words), 'words': words})

    total = sum(distribution.values()) + due['overdue'] + due['today']

    return jsonify({
        'code': 200,
        'data': {
            'distribution': distribution,
            'due':          due,
            'total':        total,
            'today':        today.isoformat(),
            'days':         days,   # 오늘+향후 날짜별 복습 예정 단어 리스트 (캘린더용)
            'language':     lang,
        },
    }), 200


@study_bp.route('/predict-reviews', methods=['POST'])
@jwt_required
def predict_reviews():
    """정답/오답 각각의 복습 예정일을 미리 계산(미저장).

    학습/테스트 시작 시 호출 → 채점 순간 즉시·고정 표시로 깜빡임 제거.
    실제 /study/log 채점은 속도 기반 rating(GOOD/EASY 등)이라 값이 미세하게
    다를 수 있으나, 표시값은 안정적 추정(정답=GOOD, 오답=AGAIN)으로 고정한다.

    요청: { "items": [ {"user_voca_id": 123}, ... ] }
    응답: { "code":200, "data": {
             "<user_voca_id>": {
               "correct": {"next_review","stability","state"},
               "wrong":   {"next_review","stability","state"}
             }, ... } }
    """
    from app.services.fsrs.state import (
        parse_user_voca_data, get_fsrs_state, migrate_v1_to_v2, is_v1,
    )
    from app.services.fsrs.scheduler import review as fsrs_review
    from app.services.fsrs.core import GOOD, AGAIN

    user_id = UUID(g.user_id)
    req = request.get_json(silent=True) or {}
    items = req.get('items')
    if not isinstance(items, list) or not items:
        return jsonify({'code': 400, 'message': 'items는 필수입니다.'}), 400

    ids = []
    for it in items:
        if not isinstance(it, dict):
            continue
        vid = it.get('user_voca_id')
        if vid is None:
            continue
        try:
            ids.append(int(vid))
        except (TypeError, ValueError):
            continue
    ids = list(set(ids))
    if not ids:
        return jsonify({'code': 200, 'data': {}}), 200

    now = dt.datetime.utcnow()

    rows = (
        db.session.query(UserVoca)
        .filter(UserVoca.user_id == user_id, UserVoca.id.in_(ids))
        .all()
    )

    def _slim(state: dict) -> dict:
        return {
            'next_review': state.get('next_review'),
            'stability':   state.get('stability'),
            'state':       state.get('state'),
        }

    data = {}
    for uv in rows:
        try:
            payload = parse_user_voca_data(uv.data)
            if is_v1(payload):
                payload = migrate_v1_to_v2(payload)
            fsrs_before = get_fsrs_state(payload) or {}
            correct = fsrs_review(fsrs_before, GOOD, now)
            wrong   = fsrs_review(fsrs_before, AGAIN, now)
            data[str(uv.id)] = {'correct': _slim(correct), 'wrong': _slim(wrong)}
        except Exception:
            continue  # 단어 단위 실패는 건너뜀 → 클라이언트가 낙관적 추정으로 폴백

    return jsonify({'code': 200, 'data': data}), 200


def _fetch_user_stats(user_id: UUID) -> dict:
    """
    추천 알고리즘에 필요한 사용자 통계를 1쿼리로 묶어 조회.

    Returns:
        {
          "recent_7d_correct_rate": float | None,
          "recent_7d_total":        int,
          "weakness_types":         [...],
          "today_seen":             {user_voca_id(int): [question_type, ...]},
          "recent_lapse_voca_ids":  set(int),  # 최근 48시간 내 한 번이라도 틀린 단어
        }
    """
    utc_now = dt.datetime.utcnow()
    # 하루 경계 = APP_TZ + 새벽 컷오프 (due 판정과 동일 소스)
    from app.services.study_day import logical_day_start_utc
    day_start_utc = logical_day_start_utc(utc_now)

    seven_days_ago    = utc_now - dt.timedelta(days=7)
    lapse_window_from = utc_now - dt.timedelta(hours=48)

    # 7일 로그 (오늘 로그 + lapse 윈도우 모두 포함)
    recent_logs = (
        db.session.query(
            UserStudyLog.user_voca_id,
            UserStudyLog.question_type,
            UserStudyLog.was_correct,
            UserStudyLog.created_at,
            UserStudyLog.state_before,
        )
        .filter(
            UserStudyLog.user_id == user_id,
            # 오늘 본 단어·lapse·신규 cap·7일 정답률 모두 현재 학습 언어 기준
            UserStudyLog.dict_lang == get_dict_lang(),
            UserStudyLog.created_at >= seven_days_ago,
        )
        .all()
    )

    # 7일 정답률
    total_7d = len(recent_logs)
    correct_7d = sum(1 for r in recent_logs if r.was_correct)
    recent_7d_correct_rate = (correct_7d / total_7d) if total_7d > 0 else None

    # 오늘 본 단어/유형 + 단어별 가장 최근 로그 추적 (lapse 판정용)
    today_seen: dict = {}
    latest_log_by_voca: dict = {}  # {user_voca_id: log} — 단어별 최신 로그
    new_today_ids: set = set()     # 오늘 처음 학습(state_before=new)한 단어 (신규 cap용)
    for r in recent_logs:
        if r.created_at >= day_start_utc:
            vid = r.user_voca_id
            if vid not in today_seen:
                today_seen[vid] = []
            if r.question_type and r.question_type not in today_seen[vid]:
                today_seen[vid].append(r.question_type)

            # 오늘 신규로 소개된 단어인지 (today_summary와 동일 판정)
            sb = r.state_before
            is_new = False
            if not sb:
                is_new = True
            else:
                try:
                    st = json.loads(sb)
                    if not st or st.get('state') in ('new', None):
                        is_new = True
                except Exception:
                    is_new = False
            if is_new:
                new_today_ids.add(vid)

        # 단어별 가장 최근 로그 추적
        prev = latest_log_by_voca.get(r.user_voca_id)
        if prev is None or r.created_at > prev.created_at:
            latest_log_by_voca[r.user_voca_id] = r

    # lapse_ids: "단어별 가장 최근 로그가 was_correct=False" 인 단어만
    # — 한 번 틀려도 그 후 정답이면 lapse 에서 빠진다 (반복 picking 방지)
    recent_lapse_voca_ids: set = {
        vid for vid, r in latest_log_by_voca.items()
        if r.created_at >= lapse_window_from and not r.was_correct
    }

    # 같은 세션 재출제 정답(`POST /farm/retry-correct`)은 `/study/log`로 남지 않아
    # 위 계산이 못 본다 — Redis 플래그(`study:retry_ok:{user_id}:{user_voca_id}`)가
    # 그 단어의 가장 최근 로그보다 나중이면 재추천 lapse 버킷에서 뺀다.
    # (그 뒤 다른 세션에서 다시 틀리면 새 로그가 더 최신이라 다시 lapse 로 돌아온다.)
    if recent_lapse_voca_ids:
        try:
            from app import cache

            candidate_ids = list(recent_lapse_voca_ids)
            flag_keys = [f'study:retry_ok:{user_id}:{vid}' for vid in candidate_ids]
            flag_values = cache.get_many(*flag_keys)
            cleared_ids = set()
            for vid, raw_val in zip(candidate_ids, flag_values):
                if not raw_val:
                    continue
                try:
                    flag_ts = float(raw_val)
                except (TypeError, ValueError):
                    continue
                latest_log = latest_log_by_voca.get(vid)
                if latest_log is None:
                    continue
                latest_ts = latest_log.created_at.replace(tzinfo=dt.timezone.utc).timestamp()
                if flag_ts > latest_ts:
                    cleared_ids.add(vid)
            recent_lapse_voca_ids -= cleared_ids
        except Exception:
            logging.getLogger(__name__).warning(
                '재출제 정답 lapse 플래그 조회 실패 — 기존 동작 유지', exc_info=True,
            )

    # 약점 유형 조회 (UserQuestionTypeStat)
    stats = (
        UserQuestionTypeStat.query
        .filter_by(user_id=user_id)
        .all()
    )
    weakness_types = []
    for s in stats:
        if s.total_count >= 10:
            rate = s.correct_count / s.total_count
            if rate < 0.6:
                weakness_types.append({
                    'question_type': s.question_type,
                    'correct_rate':  round(rate, 4),
                    'samples':       s.total_count,
                })
    weakness_types.sort(key=lambda x: x['correct_rate'])

    return {
        'recent_7d_correct_rate': recent_7d_correct_rate,
        'recent_7d_total':        total_7d,
        'weakness_types':         weakness_types,
        'today_seen':             today_seen,
        'recent_lapse_voca_ids':  recent_lapse_voca_ids,
        'new_introduced_today':   len(new_today_ids),
    }


@study_bp.route('/recommend', methods=['GET'])
@jwt_required
def get_recommend():
    """
    GET /study/recommend — 단어 추천 (세션 구성).

    빠른 복습과 테스트(추천 모드)는 동일한 추천 알고리즘을 사용한다.
    차이는 입력 필터(book_ids / target_states) 뿐.

    쿼리 파라미터:
      count         : 1~50                                (default: 20)
      book_ids      : 콤마 구분 UUID 또는 'all'             (default: all)
      target_states : 콤마 구분 (unlearned,seed,sprout,leaf,carrot | legacy short,medium,long | all)
                      pool에서 해당 작물 단계(crop stage) 단어만 추출 — 복습 예정일과
                      무관하게 FSRS state만 본다(default: all)
      selection     : recommended | random                (default: recommended)
      type          : (선택) 통계 라벨용. 알고리즘은 무시  (default: recommend)
      task_bucket   : (선택) wilted | care — 홈 '오늘 할 일' 카드의 그 줄 단어만 학습.
                      정의는 `GET /farm/today-tasks` 와 완전히 같다(공유 헬퍼
                      `farm_v2.query.get_task_bucket_ids`). wilted=WILTED+CRITICAL
                      (rot_due_at 오름차순), care=날짜 기준 돌봄 중 wilted/critical/
                      rotten 제외. 생략하면 기존 동작 그대로(하위호환).
      question_types: (선택) 콤마 구분 question_type id 목록(2026-09, 계약:
                      SENTENCE_QUESTIONS_CONTRACT.md 9절). 설정 시트에서 유형을 직접
                      고른 테스트용 — 지정되면 tier 로직을 완전히 건너뛰고 각 단어가
                      이 목록 중 쓸 수 있는 유형으로만 배정한다(여러 개면 기존
                      가중치·연속 회피). 하나도 못 쓰는 단어는 기존 전체 유형 가중치
                      배정으로 폴백. 이 경로에서는 응답의 tier_target/tier_shown이
                      항상 null(UserVoca의 tier 상태를 건드리지 않음). 모르는 값은
                      무시, 남는 게 없으면 파라미터를 안 준 것과 동일(default: 없음).
      mode          : (선택, 2026-09 "새 씨앗 심기 분리") review | plant. 다른
                      파라미터(task_bucket, allowed_types 등)와 공존 가능.
                        - review: 신규(unplanted) 단어 0개 — 이미 심은 단어만
                          추천한다(pool에서 bucket='new'를 미리 제거). 대상이
                          부족하면 부족한 대로 반환하고 새 단어로 채우지 않는다.
                        - plant: 아직 안 심은 새 단어만 count개(compose_plant —
                          new_ranked 순서 그대로, priority/tier 큐 없음). 오늘
                          남은 새 씨앗 수(daily_new_limit − 오늘 심은 수,
                          `GET /farm/today-tasks`의 new_seed와 같은 계산 공유,
                          `app.services.daily_progress.get_today_new_done`)를
                          넘지 않게 count를 min 처리한다. force=1이면 이 한도를
                          무시한다(사용자가 명시적으로 '심기'를 누른 경우).
                      생략하면(default: 없음) 기존 동작 그대로(하위호환).
      force         : (선택) mode=plant에서만 의미 있음. 1|true|yes면 오늘 남은
                      새 씨앗 한도를 무시(default: 미지정=한도 적용).

    응답 (mode 무관하게 항목 모양은 동일 — 프론트가 같은 매퍼를 쓴다):
      {
        "code": 200,
        "data": {
          "session_id": "<uuid>",
          "composition": {"overdue": 8, "today": 5, "new": 4, ...},
          "items": [
            {
              "user_voca_id": ...,
              "user_voca_book_id": ...,
              "word": ...,
              "meanings": [...],              # 기존과 동일한 문자열 배열
              "concept_ids": [12, ...],       # 단어 단위 distinct concept_id (없으면 [])
              "meaning_concepts": [[12], []],   # meanings와 순서/길이가 같은 concept_id 리스트의 리스트
              "examples": [...],
              "fsrs": {...},
              "priority_bucket": "overdue" | "lapse" | ...,
              "suggested_question_type": ...,
              "reason": "..."
            },
            ...
          ]
        }
      }
    """
    from app.services.recommend.pool import build_candidate_pool
    from app.services.recommend.composer import compose, compose_plant

    user_id = UUID(g.user_id)

    # ── 쿼리 파라미터 파싱 ──
    try:
        count = int(request.args.get('count', 20))
    except (TypeError, ValueError):
        count = 20
    count = max(1, min(count, 50))

    # mode: 2026-09 "새 씨앗 심기 분리" — 지정하지 않으면 기존 동작 그대로(하위 호환).
    #   review : 신규(unplanted) 단어 0개 — 이미 심은 단어만 추천. 대상이 부족해도
    #            새 단어로 채우지 않는다(pool에서 bucket='new'를 미리 제거).
    #   plant  : 아직 안 심은 새 단어만 count개 — 새 씨앗 심기 전용 세션(compose_plant).
    mode = (request.args.get('mode') or '').strip().lower() or None
    if mode not in (None, 'review', 'plant'):
        return jsonify({'code': 400, 'message': 'mode는 review 또는 plant만 지원합니다.'}), 400

    # force: mode=plant에서 오늘 남은 새 씨앗 한도를 무시할지(사용자가 명시적으로
    # '심기'를 눌렀을 때 프론트가 보낸다). mode=plant가 아니면 의미 없음.
    force = (request.args.get('force') or '').strip().lower() in ('1', 'true', 'yes')

    book_ids_raw = request.args.get('book_ids', 'all')
    if book_ids_raw.lower() == 'all' or not book_ids_raw:
        book_ids = None
    else:
        book_ids = [b.strip() for b in book_ids_raw.split(',') if b.strip()]
        if not book_ids:
            book_ids = None

    target_states_raw = request.args.get('target_states', 'all')
    target_states = [s.strip() for s in target_states_raw.split(',') if s.strip()]
    # 빈 값(파라미터는 존재하지만 값이 ''인 경우)·'all' 모두 "필터 없음"으로 취급한다.
    # 그렇지 않으면 target_states가 []([]는 None이 아님)로 남아 full_recommend 판정이
    # False가 되고, AI 추천 모드의 신규/단기 floor 보호(composer.py)가 꺼진다.
    if not target_states or 'all' in target_states:
        target_states = None

    selection = request.args.get('selection', 'recommended').lower()
    if selection not in ('recommended', 'random'):
        selection = 'recommended'

    # type은 통계 라벨로만 사용 (알고리즘 분기 없음)
    type_label = request.args.get('type', 'recommend').lower()

    task_bucket = (request.args.get('task_bucket') or '').strip().lower() or None
    if task_bucket not in (None, 'wilted', 'care'):
        return jsonify({'code': 400, 'message': 'task_bucket은 wilted 또는 care만 지원합니다.'}), 400

    # question_types: 설정 시트에서 유형을 직접 고른 테스트(2026-09) — 지정되면
    # tier 로직을 완전히 건너뛰고 이 유형들 중 각 단어가 쓸 수 있는 것으로만 배정한다
    # (composer.compose의 allowed_types, SENTENCE_QUESTIONS_CONTRACT.md 9절 참고).
    # 모르는 값은 조용히 무시하고, 남는 게 하나도 없으면 파라미터를 안 준 것과 동일하게
    # 취급한다(기존 동작 그대로).
    question_types_raw = request.args.get('question_types', '')
    requested_types = [t.strip() for t in question_types_raw.split(',') if t.strip()]
    allowed_types = [t for t in requested_types if t in RECOMMENDABLE_QUESTION_TYPES] or None

    # ── 사용자 통계 조회 (1쿼리로 묶음) ──
    try:
        user_stats = _fetch_user_stats(user_id)
    except Exception:
        user_stats = None

    # ── 후보 풀 빌드 ──
    try:
        pool = build_candidate_pool(user_id, book_ids)
    except Exception as e:
        logging.getLogger(__name__).error('후보 풀 빌드 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500

    # ── mode=review: 신규(unplanted) 단어를 후보에서 완전히 뺀다 ──
    # 이후의 rotten/task_bucket/target_states 필터·compose() 어디를 타도 bucket='new'가
    # 하나도 없으니 새 단어로 채워질 일이 없다(부족하면 부족한 대로 반환).
    if mode == 'review':
        pool = [it for it in pool if it.bucket != 'new']

    # ── 당근 농장: 썩은 단어는 되살리기 전까지 **모든 모드에서** 제외한다. ──
    # 제품 결정(2026-09): AI 추천·자유 설정 테스트·빠른 학습 어디서도 썩은 단어는
    # 출제하지 않는다. 되살리기(물주기/회복제) 전까지 학습 불가가 기획 6.1 의 정의다.
    # 이 필터가 target_states 앞에 있으므로 selection/target_states 조합과 무관하게 적용된다.
    #
    # 예전에는 V1 의 dead_user_voca_ids(life=='DEAD')를 썼는데, V2 는 부패를
    # health_state=='ROTTEN' 에 적고 life 는 ALIVE 로 두어 **한 건도 걸러지지 않았다**
    # (prod 실측: ROTTEN 21 / DEAD 0). 화면과 같은 판정을 쓰는 V2 헬퍼로 교체한다.
    # 게임 로직은 services/game/에만 두고, 실패해도 추천을 막지 않는다.
    try:
        from app.services.game.farm_v2.query import rotten_user_voca_ids
        rotten_ids = rotten_user_voca_ids(user_id, [it.user_voca_id for it in pool])
        if rotten_ids:
            pool = [it for it in pool if it.user_voca_id not in rotten_ids]
    except Exception:
        logging.getLogger(__name__).error('농장 썩은단어 필터 실패 (추천은 정상)', exc_info=True)

    # ── task_bucket 필터 — 홈 '오늘 할 일' 카드에서 그 줄만 눌러 들어온 학습. ──
    # /farm/today-tasks 와 정의가 갈리지 않도록 같은 공유 헬퍼(get_task_bucket_ids)를
    # 그대로 쓴다. 순서도 그 헬퍼가 정한 우선순위(wilted=rot_due_at 오름차순)를 따른다 —
    # count가 남은 대상보다 적어 잘릴 때 "썩기 전 것부터"가 지켜져야 한다.
    if task_bucket:
        try:
            from app.services.game.farm_v2.query import get_task_bucket_ids
            bucket_ids = get_task_bucket_ids(user_id, task_bucket, dt.datetime.utcnow())
        except Exception:
            logging.getLogger(__name__).error('오늘 할 일 학습 진입 필터 실패', exc_info=True)
            bucket_ids = []
        order = {uv_id: i for i, uv_id in enumerate(bucket_ids)}
        pool = sorted((it for it in pool if it.user_voca_id in order),
                     key=lambda it: order[it.user_voca_id])

    # ── target_states 필터 (테스트에서 암기 상태 좁히기) ──
    # bucket(new/overdue/today/short/medium/long)이 아니라 crop_stage로 거른다 — bucket의
    # short/medium/long은 "미래에 도래할" 단어에만 붙어서, bucket으로 걸렀다면 오늘 당장
    # 복습해야 할(overdue/today) 단어가 통째로 빠졌었다(recommend/stage.py 참고).
    if target_states:
        from app.services.recommend.stage import crop_stage, expand_target_states
        allowed_stages = expand_target_states(target_states)
        if allowed_stages:
            pool = [it for it in pool if crop_stage(it.fsrs_state) in allowed_stages]

    if mode == 'plant':
        # ── mode=plant: 아직 안 심은 새 단어만 — 오늘 남은 새 씨앗 한도로 count를 clamp ──
        # (`GET /farm/today-tasks`의 new_seed 와 같은 계산: daily_new_limit − 오늘 심은 수.
        # force=1이면 사용자가 명시적으로 '심기'를 눌렀다고 보고 한도를 무시한다.)
        new_items_pool = [it for it in pool if it.bucket == 'new']
        if not force:
            from app.services.daily_progress import get_today_new_done
            user_row = db.session.query(User).filter(User.id == user_id).first()
            daily_limit = getattr(user_row, 'daily_new_limit', 20) if user_row else 20
            if daily_limit is None:
                daily_limit = 20
            if daily_limit > 0:
                new_done_today, _reviews_done = get_today_new_done(user_id)
                remaining_allowance = max(0, daily_limit - new_done_today)
                count = min(count, remaining_allowance)
            # daily_limit <= 0 → 무제한 → count 그대로

        result = compose_plant(
            new_items_pool, count, user_stats=user_stats, allowed_types=allowed_types,
        )
    else:
        # ── AI 추천 모드 판정 + 신규 일일 cap 산출 ──
        # 사용자가 암기상태를 명시(target_states)하거나 random이거나 task_bucket으로
        # 좁혔으면 그 의도를 그대로 존중 → cap/floor 미적용(task_bucket 대상은 애초에
        # 이미 심어 복습 중이던 단어라 신규 cap 자체가 의미 없다). mode=review도 pool에서
        # 이미 bucket='new'를 제거했으니 이 cap과 무관하게 새 단어는 0개로 유지된다.
        full_recommend = (selection == 'recommended' and target_states is None and task_bucket is None)
        new_allowance = None
        if full_recommend:
            user_row = db.session.query(User).filter(User.id == user_id).first()
            daily_limit = getattr(user_row, 'daily_new_limit', 20) if user_row else 20
            if daily_limit is None:
                daily_limit = 20
            if daily_limit > 0:
                new_today = (user_stats or {}).get('new_introduced_today', 0)
                new_allowance = max(0, daily_limit - new_today)
            # daily_limit <= 0 → 무제한 → new_allowance=None

        # ── 세션 구성 ──
        result = compose(
            pool, count, selection=selection, user_stats=user_stats,
            full_recommend=full_recommend, new_allowance=new_allowance,
            allowed_types=allowed_types,
        )
    composition:    dict = result['composition']
    enriched_items: list = result['enriched_items']

    # ── 일반 학습: 조립형 suggested 제거 → 별도 sentence_arrange 필드(아래 응답 구성) ──
    # 모든 단어가 먼저 일반 콘텐츠를 풀고, 일부(3~4개)만 문장 만들기를 추가로 한다.
    # 유형 직접 지정(allowed_types)·plant 는 기존 동작 유지.
    former_arrange = []
    general_mode = mode != 'plant' and not allowed_types
    if general_mode:
        former_arrange = _demote_arrange_to_general(enriched_items)

    # ── UserStudySession INSERT ──
    book_ids_for_session = [str(b) for b in book_ids] if book_ids else ['all']
    session_obj = UserStudySession(
        user_id=user_id,
        test_type=type_label,
        book_ids=json.dumps(book_ids_for_session, ensure_ascii=False),
        question_count=0,
        correct_count=0,
    )
    try:
        db.session.add(session_obj)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('세션 생성 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '세션 생성에 실패했습니다.'}), 500

    # ── 응답 구성 ──
    lang = get_dict_lang()
    selected_voca_ids = [e['_item'].voca_id for e in enriched_items]
    ja_info   = load_ja_word_info(selected_voca_ids) if lang == 'ja' else {}
    ja_tokens = load_ja_example_tokens(selected_voca_ids) if lang == 'ja' else {}
    # "매번 새 문장"(2026-09-30) 선택 컨텍스트 — 이번 응답에 실제로 나갈 단어들만으로
    # 한 번 빌드해 모든 item·모든 문제 유형에서 공유한다(used_hashes가 응답 전체에서
    # 누적돼야 plant의 여러 유형이 서로 다른 문장을 고른다). en 전용.
    ctx = _build_selection_ctx(user_id, [e['_item'] for e in enriched_items], lang, easy=(mode == 'plant'))
    if mode == 'plant':
        # plant 의 조립형은 사전 쉬운 예문+조각만 쓴다 — 없는 단어가 조립형으로 배정되면 payload 가
        # 비므로 보편 유형(사지선다)으로 돌린다.
        from app.services.sentence_puzzle import puzzle_usable as _puzzle_ok
        from app.services.example_select import _is_plant_arrange_ok
        for e in enriched_items:
            if e.get('suggested_question_type') in _ARRANGE_TYPES and not any(
                ex.get('source') == 'dict' and ex.get('puzzle') and _puzzle_ok(ex['puzzle'])
                and _is_plant_arrange_ok(ex)
                for ex in (e['_item'].example_pool or [])
            ):
                e['suggested_question_type'] = 'multipleChoice'
    items_response = [
        _serialize_recommend_item(
            enriched['_item'],
            suggested_question_type=enriched['suggested_question_type'],
            tier_target=enriched.get('tier_target'),
            tier_shown=enriched.get('tier_shown'),
            reason=enriched['reason'],
            # priority_bucket은 composer가 lapse로 재분류한 결과(src_bucket)를 사용한다.
            priority_bucket=enriched.get('src_bucket', enriched['_item'].bucket),
            lang=lang, ja_info=ja_info, ja_tokens=ja_tokens, ctx=ctx,
        )
        for enriched in enriched_items
    ]
    if general_mode:
        sa_map = _select_sentence_arrange(enriched_items, former_arrange, ctx)
        for resp in items_response:
            sa = sa_map.get(resp['user_voca_id'])
            if sa:
                resp['sentence_arrange'] = sa
    # 새 씨앗 심기 세션은 한 단어를 여러 유형으로 연달아 푼다 — suggested 유형 하나만의
    # question_payload 로는 빈칸 입력·문장 만들기 단계가 대부분 비므로 세 유형 payload 를 모두 싣는다.
    if mode == 'plant':
        for resp, enriched in zip(items_response, enriched_items):
            # 문장 만들기를 먼저 뽑는다 — 후보가 가장 적고(사전+조각+엄격 기준) 빈칸 유형이 쉬운
            # 예문을 먼저 가져가면 문장 만들기가 어려운 문장만 남는다(2026-10 실측: 평균 8.2→개선).
            # Partial 우선, 엄격 기준을 맞는 사전 예문이 없으면 키 생략(폴백 없음).
            # 다른 유형과 문장이 겹치지 않도록 ctx.used_hashes 공유.
            qp = {}
            for t in ('sentenceArrangePartial', 'sentenceArrange'):
                arr = _build_sentence_question_payload(enriched['_item'], t, ctx)
                if arr:
                    qp[t] = arr
                    break
            for t in ('fillInTheBlank', 'fillInTheBlankTyping'):
                qp[t] = _build_sentence_question_payload(enriched['_item'], t, ctx)
            resp['question_payloads'] = qp

    return jsonify({
        'code': 200,
        'data': {
            'session_id':  str(session_obj.id),
            'composition': composition,
            'items':       items_response,
        },
    }), 200


@study_bp.route('/requeue-easier', methods=['GET'])
@jwt_required
def requeue_easier():
    """GET /study/requeue-easier — 세션 안 오답 재출제.

    방금 실패한 문제의 tier(from_tier)보다 한 단계 쉬운 tier에서, 이번 세션에서 이미
    시도한 유형(exclude_types)을 피해 같은 단어의 새 문제를 만들어 돌려준다. 프론트가
    로컬에서 문제를 새로 조립할 필요 없이(특히 arrange/typing류는 서버 조립 payload가
    필요) 이 엔드포인트 하나로 재출제할 수 있다. 계약: SENTENCE_QUESTIONS_CONTRACT.md.

    쿼리 파라미터:
      user_voca_id   : 필수
      from_tier      : (선택) 방금 보여준 tier(1~5). 없으면 그 단어의 최고 tier-1에서 시작.
      exclude_types  : (선택) 콤마 구분 question_type — 이번 세션에서 이미 실패한 유형들.

    응답: { "code":200, "data": {...} } — data는 /study/recommend items[] 원소와 동일한 모양.
    puzzle/보기 부족 등으로 재출제 불가면 404.
    """
    from app.services.recommend.pool import build_candidate_pool
    from app.services.recommend.stage import crop_stage
    from app.services.recommend.composer import _pick_type_at_tier

    user_id = UUID(g.user_id)

    try:
        user_voca_id = int(request.args.get('user_voca_id'))
    except (TypeError, ValueError):
        return jsonify({'code': 400, 'message': 'user_voca_id는 필수입니다.'}), 400

    try:
        from_tier = int(request.args.get('from_tier', 0))
    except (TypeError, ValueError):
        from_tier = 0

    exclude_types = {t.strip() for t in (request.args.get('exclude_types') or '').split(',') if t.strip()}

    try:
        pool = build_candidate_pool(user_id, None)
    except Exception:
        logging.getLogger(__name__).error('requeue-easier 풀 빌드 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500

    item = next((it for it in pool if it.user_voca_id == user_voca_id), None)
    if item is None:
        return jsonify({'code': 404, 'message': '단어를 찾을 수 없습니다.'}), 404

    max_tier = CROP_STAGE_MAX_TIER.get(crop_stage(item.fsrs_state), 1)
    start_tier = (from_tier - 1) if from_tier > 0 else max(1, max_tier - 1)
    start_tier = max(1, min(start_tier, max_tier))

    tier = start_tier
    chosen = None
    while tier >= 1:
        chosen = _pick_type_at_tier(item, tier, [], exclude_types)
        if chosen:
            break
        tier -= 1
    if chosen is None:
        return jsonify({'code': 404, 'message': '재출제 가능한 문제 유형이 없습니다.'}), 404

    lang = get_dict_lang()
    ja_info   = load_ja_word_info([item.voca_id]) if lang == 'ja' else {}
    ja_tokens = load_ja_example_tokens([item.voca_id]) if lang == 'ja' else {}
    ctx = _build_selection_ctx(user_id, [item], lang)

    if chosen == 'sentenceArrange':
        chosen = 'sentenceArrangePartial'  # 문장 만들기는 부분 빈칸 우선
    data = _serialize_recommend_item(
        item,
        suggested_question_type=chosen,
        tier_target=None,   # 재출제는 자동 tier 진행에 영향 주지 않음(같은 세션 내 임시 재시도)
        tier_shown=tier,
        reason='',
        priority_bucket=item.bucket,
        lang=lang, ja_info=ja_info, ja_tokens=ja_tokens, ctx=ctx,
    )
    return jsonify({'code': 200, 'data': data}), 200


def _build_mcq_options(correct: str, distractor_pool: list, k: int = 3,
                        correct_concept_ids: list = None, correct_norms: list = None):
    """정답 + 오답 k개로 사지선다 보기 구성.

    distractor_pool: [{'text': str, 'concept_ids': list, 'normalized_meanings': list}, ...]
    correct_concept_ids / correct_norms: 정답 단어의 concept_id / 정규화 뜻(오답 제외 판정용).
    정답과 "뜻이 겹치는"(개념 그룹이 같거나 정규화 뜻이 같은) 후보는 1차로 제외하고,
    그렇게 걸러낸 후보가 k개 미만이면 겹침을 허용한 원래 후보 풀로 폴백한다(최소 보기 수 보장).

    Returns:
        (options: list[str], answer_index: int) — 오답을 하나도 못 뽑으면 (None, None).
    """
    from app.services.meaning_concept import words_overlap

    seen = set()
    dedup = []
    for d in distractor_pool:
        text = d.get('text') if isinstance(d, dict) else d
        if not text or text == correct or text in seen:
            continue
        seen.add(text)
        dedup.append(d if isinstance(d, dict) else {'text': text, 'concept_ids': [], 'normalized_meanings': []})

    filtered = [
        d for d in dedup
        if not words_overlap(correct_concept_ids or [], correct_norms or [],
                              d.get('concept_ids') or [], d.get('normalized_meanings') or [])
    ]
    # 겹침 제외 후보가 부족하면(k개 미만) 기존 폴백(겹침 허용)으로 채운다.
    candidates = filtered if len(filtered) >= k else dedup
    if not candidates:
        return None, None
    texts = [d['text'] for d in candidates]
    distractors = random.sample(texts, min(k, len(texts)))
    options = distractors + [correct]
    random.shuffle(options)
    return options, options.index(correct)


@study_bp.route('/chat-session', methods=['GET'])
@jwt_required
def get_chat_session():
    """GET /study/chat-session — 채팅 학습용 완성형 사지선다 세션.

    /study/recommend와 동일한 추천 알고리즘으로 오늘 복습+신규 단어를 뽑되,
    각 문제에 서버가 사지선다 보기(정답+오답)를 만들어 붙여 반환한다.
    (네이티브 클라이언트가 보기 풀을 갖지 않아도 되게 하기 위함.)

    쿼리 파라미터:
      count : 1~50 (default 50) — 오늘 학습 세트 상한.

    응답:
      { "code":200, "data": {
          "session_id": "<uuid>" | null,
          "composition": {...},
          "questions": [{
            "user_voca_id", "user_voca_book_id", "word",
            "meanings": [...],               # 기존과 동일한 문자열 배열
            "concept_ids": [12, ...],        # 단어 단위 distinct concept_id (없으면 [])
            "meaning_concepts": [[12], []],    # meanings와 순서/길이가 같은 concept_id 리스트의 리스트
            "examples",
            "options": [str,...], "answer_index": int,  # 오답은 정답과 concept 겹치지 않게 1차 필터링(부족하면 폴백)
            "fsrs": {...}, "priority_bucket", "suggested_question_type"
          }, ...]
      }}
    """
    from app.services.recommend.pool import build_candidate_pool
    from app.services.recommend.composer import compose
    from app.utils.app_version import is_app_version_at_least

    user_id = UUID(g.user_id)
    lang = get_dict_lang()

    # 일본어 모드: 채팅 화면(네이티브)이 question.language 를 이해하는 앱 버전부터만 제공.
    # 버전은 X-App-Version 헤더 또는 UA 'HeyVoca iOS|Android/x.y.z' 로 판정(없으면 구버전 취급).
    if lang == 'ja' and not is_app_version_at_least(CHAT_JA_MIN_APP_VERSION):
        return jsonify({
            'code': 200,
            'data': {
                'available': False,
                'reason': 'app_update_required',
                'min_app_version': CHAT_JA_MIN_APP_VERSION,
                'language': lang,
                'session_id': None,
                'questions': [],
            },
            # 규격 4절 형태 그대로도 최상위에 노출(클라이언트가 어느 쪽을 읽어도 되게)
            'available': False,
            'reason': 'app_update_required',
        }), 200

    try:
        count = int(request.args.get('count', 50))
    except (TypeError, ValueError):
        count = 50
    count = max(1, min(count, 50))

    # ── 사용자 통계 ──
    try:
        user_stats = _fetch_user_stats(user_id)
    except Exception:
        user_stats = None

    # ── 후보 풀 ──
    try:
        pool = build_candidate_pool(user_id, None)
    except Exception:
        logging.getLogger(__name__).error('chat-session 풀 빌드 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500

    # ── 당근 농장: 썩은 단어 제외 (get_recommend와 동일한 정본 헬퍼) ──
    try:
        from app.services.game.farm_v2.query import rotten_user_voca_ids
        rotten_ids = rotten_user_voca_ids(user_id, [it.user_voca_id for it in pool])
        if rotten_ids:
            pool = [it for it in pool if it.user_voca_id not in rotten_ids]
    except Exception:
        logging.getLogger(__name__).error('농장 썩은단어 필터 실패 (채팅세션은 정상)', exc_info=True)

    # ── 신규 일일 cap (get_recommend와 동일) ──
    new_allowance = None
    user_row = db.session.query(User).filter(User.id == user_id).first()
    daily_limit = getattr(user_row, 'daily_new_limit', 20) if user_row else 20
    if daily_limit is None:
        daily_limit = 20
    if daily_limit > 0:
        new_today = (user_stats or {}).get('new_introduced_today', 0)
        new_allowance = max(0, daily_limit - new_today)

    # ── 세션 구성 ──
    result = compose(
        pool, count, selection='recommended', user_stats=user_stats,
        full_recommend=True, new_allowance=new_allowance,
    )
    composition:    dict = result['composition']
    enriched_items: list = result['enriched_items']

    # ── 오답 풀: 후보 전체 단어의 대표 뜻 모음(+ 뜻 겹침 판정용 concept 정보) ──
    distractor_pool = []
    seen_d = set()
    for it in pool:
        if it.meanings:
            m = it.meanings[0]
            if m and m not in seen_d:
                seen_d.add(m)
                distractor_pool.append({
                    'text':                m,
                    'concept_ids':         it.concept_ids,
                    'normalized_meanings': it.normalized_meanings,
                })

    # ── 사지선다 생성 ──
    # 오답 풀은 build_candidate_pool 이 현재 언어로 한정했으므로 같은 언어 뜻만 보기로 나온다.
    chat_voca_ids = [e['_item'].voca_id for e in enriched_items]
    ja_info   = load_ja_word_info(chat_voca_ids) if lang == 'ja' else {}
    ja_tokens = load_ja_example_tokens(chat_voca_ids) if lang == 'ja' else {}
    questions = []
    for enriched in enriched_items:
        item = enriched['_item']
        if not item.meanings:
            continue  # 정답으로 쓸 뜻이 없으면 스킵
        correct = item.meanings[0]
        options, answer_index = _build_mcq_options(
            correct, distractor_pool, k=3,
            correct_concept_ids=item.concept_ids, correct_norms=item.normalized_meanings,
        )
        if options is None:
            continue  # 오답을 하나도 못 뽑으면 스킵(최소 2지선다 보장)

        fsrs = item.fsrs_state or {}
        questions.append({
            'user_voca_id':            item.user_voca_id,
            'user_voca_book_id':       str(item.user_voca_book_id) if item.user_voca_book_id else None,
            'voca_id':                 item.voca_id,
            'word':                    item.word,
            **word_fields(lang, item.voca_id, ja_info),
            'meanings':                item.meanings,
            'concept_ids':             item.concept_ids,
            'meaning_concepts':        item.meaning_concepts,
            'examples':                examples_with_tokens(lang, item.voca_id, item.examples, ja_tokens),
            'options':                 options,
            'answer_index':            answer_index,
            'fsrs': {
                'state':          fsrs.get('state', 'new'),
                'stability':      fsrs.get('stability', 0.0),
                'difficulty':     fsrs.get('difficulty', 0.0),
                'retrievability': fsrs.get('retrievability', 0.0),
                'next_review':    fsrs.get('next_review'),
                'last_review':    fsrs.get('last_review'),
                'reps':           fsrs.get('reps', 0),
                'lapses':         fsrs.get('lapses', 0),
            },
            'priority_bucket':         enriched.get('src_bucket', item.bucket),
            'suggested_question_type': enriched['suggested_question_type'],
        })

    # ── 문제가 없으면 세션 생성 없이 빈 응답 ──
    if not questions:
        return jsonify({
            'code': 200,
            'data': {'session_id': None, 'composition': composition, 'questions': [],
                     'available': True, 'language': lang},
        }), 200

    # ── 세션 INSERT ──
    session_obj = UserStudySession(
        user_id=user_id,
        test_type='chat',
        book_ids=json.dumps(['all'], ensure_ascii=False),
        question_count=0,
        correct_count=0,
    )
    try:
        db.session.add(session_obj)
        db.session.commit()
    except Exception:
        db.session.rollback()
        logging.getLogger(__name__).error('chat-session 세션 생성 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '세션 생성에 실패했습니다.'}), 500

    return jsonify({
        'code': 200,
        'data': {
            'session_id':  str(session_obj.id),
            'composition': composition,
            'questions':   questions,
            'available':   True,
            'language':    lang,
        },
    }), 200


@study_bp.route('/sessions/<session_id>/finish', methods=['POST'])
@jwt_required
def finish_session(session_id):
    """
    학습 세션 종료. finished_at 기록 + 요약 통계 반환.

    응답:
      {
        "code": 200,
        "data": {
          "session_id":     "<uuid>",
          "question_count": 20,
          "correct_count":  17,
          "duration_sec":   372
        }
      }
    """
    user_id = UUID(g.user_id)

    try:
        session_uuid = UUID(session_id)
    except (ValueError, AttributeError):
        return jsonify({'code': 400, 'message': '유효하지 않은 session_id 형식입니다.'}), 400

    session_obj = UserStudySession.query.filter_by(
        id=session_uuid, user_id=user_id
    ).first()
    if not session_obj:
        return jsonify({'code': 403, 'message': '세션 접근 권한이 없습니다.'}), 403

    if session_obj.finished_at:
        # 이미 종료된 세션 — 통계만 반환
        duration_sec = int(
            (session_obj.finished_at - session_obj.started_at).total_seconds()
        ) if session_obj.started_at else 0
        return jsonify({
            'code': 200,
            'data': {
                'session_id':     str(session_obj.id),
                'question_count': session_obj.question_count,
                'correct_count':  session_obj.correct_count,
                'duration_sec':   duration_sec,
            },
        }), 200

    finished_at = dt.datetime.utcnow()
    session_obj.finished_at = finished_at

    duration_sec = int(
        (finished_at - session_obj.started_at).total_seconds()
    ) if session_obj.started_at else 0

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logging.getLogger(__name__).error('세션 종료 오류', exc_info=True)
        return jsonify({'code': 500, 'message': '세션 종료에 실패했습니다.'}), 500

    return jsonify({
        'code': 200,
        'data': {
            'session_id':     str(session_obj.id),
            'question_count': session_obj.question_count,
            'correct_count':  session_obj.correct_count,
            'duration_sec':   duration_sec,
        },
    }), 200
