import json
import logging
import random
import datetime as dt
from uuid import UUID, uuid4

from flask import Blueprint, jsonify, request, g
from sqlalchemy import text

from app import db
from app.models.models import UserStudySession, UserStudyLog, UserVoca, UserQuestionTypeStat, User
from app.utils.jwt_utils import jwt_required
from app.utils.db_lock import begin_user_tx
from app.constants.question_types import ALLOWED_QUESTION_TYPES
from app.utils.dict_lang import get_dict_lang
from app.services.ja_fields import (
    load_ja_word_info, load_ja_example_tokens, word_fields, examples_with_tokens,
)

study_bp = Blueprint('study', __name__, url_prefix='/study')

_MAX_LIMIT = 500

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
    )
    fsrs_state_after = fsrs_review(
        fsrs_state_before,
        rating,
        now,
        lapse_history=lapse_history,
        prior_correct_rate=prior_correct_rate,
    )

    memory_state_after = _classify_memory_state(fsrs_state_after)

    # ── payload 업데이트 ──
    payload = set_fsrs_state(payload, fsrs_state_after)
    # mastery 비정규화(2026-09) — 추천 알고리즘의 "약함 점수"용. 이미 잠그고 쓰는 이 행에
    # 필드만 더 얹는 것이라 추가 쿼리·추가 락 없음(중복 요청은 위 멱등 가드에서 이미 리턴됨).
    payload = set_mastery(payload, bool(was_correct), now.isoformat() + "Z")

    user_voca.data       = serialize_user_voca_data(payload)
    user_voca.updated_at = dt.datetime.utcnow()

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

    응답:
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
    from app.services.recommend.composer import compose

    user_id = UUID(g.user_id)

    # ── 쿼리 파라미터 파싱 ──
    try:
        count = int(request.args.get('count', 20))
    except (TypeError, ValueError):
        count = 20
    count = max(1, min(count, 50))

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

    # ── target_states 필터 (테스트에서 암기 상태 좁히기) ──
    # bucket(new/overdue/today/short/medium/long)이 아니라 crop_stage로 거른다 — bucket의
    # short/medium/long은 "미래에 도래할" 단어에만 붙어서, bucket으로 걸렀다면 오늘 당장
    # 복습해야 할(overdue/today) 단어가 통째로 빠졌었다(recommend/stage.py 참고).
    if target_states:
        from app.services.recommend.stage import crop_stage, expand_target_states
        allowed_stages = expand_target_states(target_states)
        if allowed_stages:
            pool = [it for it in pool if crop_stage(it.fsrs_state) in allowed_stages]

    # ── AI 추천 모드 판정 + 신규 일일 cap 산출 ──
    # 사용자가 암기상태를 명시(target_states)하거나 random이면 그 의도를 그대로 존중 → cap/floor 미적용.
    full_recommend = (selection == 'recommended' and target_states is None)
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
    )
    composition:    dict = result['composition']
    enriched_items: list = result['enriched_items']

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
    items_response = []
    for enriched in enriched_items:
        item = enriched['_item']
        fsrs = item.fsrs_state or {}
        # priority_bucket은 composer가 lapse로 재분류한 결과(src_bucket)를 사용한다.
        items_response.append({
            'user_voca_id':            item.user_voca_id,
            'user_voca_book_id':       str(item.user_voca_book_id) if item.user_voca_book_id else None,
            'voca_id':                 item.voca_id,
            'word':                    item.word,
            # 공통 필드: language (+ ja 면 reading/romaji/jlpt/pronunciation)
            **word_fields(lang, item.voca_id, ja_info),
            'meanings':                item.meanings,
            # 단어 단위 distinct concept_id 목록(같은/유사 뜻 그룹, 사전 미연결 단어는 [])
            'concept_ids':             item.concept_ids,
            # meanings와 순서/길이가 같은 concept_id 배열 — 뜻 하나하나의 그룹이 필요할 때 사용
            'meaning_concepts':        item.meaning_concepts,
            # ja 예문엔 reading_tokens(후리가나) 부착
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
            'priority_bucket':         enriched.get('src_bucket', item.bucket),
            'suggested_question_type': enriched['suggested_question_type'],
            'reason':                  enriched['reason'],
        })

    return jsonify({
        'code': 200,
        'data': {
            'session_id':  str(session_obj.id),
            'composition': composition,
            'items':       items_response,
        },
    }), 200


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
