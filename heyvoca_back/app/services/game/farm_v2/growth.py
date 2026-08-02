"""성장 축 — 보유 씨앗 / 심은 씨앗 / 새싹 / 잎 / 당근 / 황금 (기획 5.1, 10.2).

**성장은 내려가지 않는다**(5.2). 오답도, 부패도 단계를 깎지 않는다. 부패한 작물을
다시 심었을 때만 현재 단계가 `심은 씨앗`으로 돌아가고, 그때도 highest_stage 는 남는다.

FSRS 에서 파생할 수 있는 것과 없는 것:
    잎·당근  — stability 임계값만 보면 된다. 파생 가능.
    씨앗·새싹 — `보유 씨앗`과 `심은 씨앗`은 FSRS 로 구분되지 않는다. 둘 다 unlearned/short
               구간이고, 갈리는 건 "첫 독립 정답을 했는가"다. 그래서 저장한다.
    황금     — 최근 복습 이력이 필요해 로그를 봐야 한다.
"""

import datetime as dt
from typing import Optional
from uuid import UUID

from app import db
from app.models.models import UserStudyLog, UserVocaGame, VisualStage
from app.services.game.farm_v2 import constants as C

# 화면 라벨 — 기획 2.1 이 금지한 표현을 쓰지 않는다
STAGE_LABEL = {
    VisualStage.UNPLANTED_SEED: '씨앗',
    VisualStage.PLANTED_SEED:   '심은 씨앗',
    VisualStage.SPROUT:         '새싹',
    VisualStage.LEAF:           '이파리',
    VisualStage.CARROT:         '당근',
    VisualStage.GOLDEN:         '황금 당근',
}

# 홈은 4그룹만 쓴다(5.1) — 씨앗 그룹 상세에서만 심기 전/심은 씨앗을 나눈다
HOME_GROUP = {
    VisualStage.UNPLANTED_SEED: 'seed',
    VisualStage.PLANTED_SEED:   'seed',
    VisualStage.SPROUT:         'sprout',
    VisualStage.LEAF:           'leaf',
    VisualStage.CARROT:         'carrot',
    VisualStage.GOLDEN:         'carrot',
}


def _stability(fsrs_state: dict) -> float:
    try:
        return float((fsrs_state or {}).get('stability') or 0.0)
    except (TypeError, ValueError):
        return 0.0


def stage_from_stability(stability: float) -> Optional[str]:
    """안정성만으로 정해지는 단계. 잎 미만이면 None — 씨앗/새싹은 저장값이 정한다.

    임계값은 study.py 를 단일 소스로 읽는다. 두 곳에 같은 숫자를 적어 두면
    한쪽만 조정됐을 때 화면의 단계와 추천 로직이 어긋난다.
    """
    from app.routes.study import _STABILITY_SHORT, _STABILITY_MEDIUM
    if stability >= _STABILITY_MEDIUM:
        return VisualStage.CARROT
    if stability >= _STABILITY_SHORT:
        return VisualStage.LEAF
    return None


def next_stage(game: UserVocaGame, fsrs_state: dict, now: dt.datetime,
               local_today: dt.date, is_independent: bool, was_correct: bool) -> Optional[str]:
    """이번 답안으로 올라갈 단계. 오르지 않으면 None.

    is_independent 는 "힌트·정답 노출 없이, 이번 세션에서 이 단어를 아직 틀리지 않은
    상태로 맞혔는가"다(5.1 조건 4, 5.2). 도움을 본 직후의 확인 답변은 성장이 아니다.
    """
    if not was_correct:
        return None   # 오답으로는 오르지도 내리지도 않는다(5.2)

    current = game.visual_stage or VisualStage.UNPLANTED_SEED
    if current == VisualStage.GOLDEN:
        return None

    # 부패한 작물은 다시 심기/회복을 거치기 전에는 자라지 않는다(6.1)
    from app.models.models import HealthState
    if game.health_state == HealthState.ROTTEN:
        return None

    stability = _stability(fsrs_state)
    by_stability = stage_from_stability(stability)

    # 잎·당근은 안정성만으로 결정된다 — 단, 내려가지 않는다
    if by_stability is not None:
        if VisualStage.rank(by_stability) > VisualStage.rank(current):
            return by_stability
        return None

    # ── 여기부터는 씨앗 구간 ──
    if current == VisualStage.UNPLANTED_SEED:
        # 첫 독립 정답 = 씨앗 심기 + 첫 물주기 (5.1)
        return VisualStage.PLANTED_SEED if is_independent else None

    if current == VisualStage.PLANTED_SEED:
        if not is_independent:
            return None
        # 조건 2 — 심은 날보다 늦은 현지 학습일이어야 한다.
        # 같은 날 여러 번 맞힌 것은 "시간이 지나도 기억함"의 증거가 아니다.
        if game.planted_study_day is None or local_today <= game.planted_study_day:
            return None
        # 조건 3 — 첫 예정 복습 시각 이후여야 한다.
        # 예정일보다 일찍 자율 학습해 맞힌 것도 증거로 치지 않는다.
        if game.first_due_at is not None and now < game.first_due_at:
            return None
        return VisualStage.SPROUT

    return None


# ──────────────────────────────────────────────────────────────
# 독립 정답 판정
# ──────────────────────────────────────────────────────────────

def is_independent_answer(user_id: UUID, user_voca_id: int, session_id,
                          was_correct: bool) -> bool:
    """이번 정답이 '독립 회상'인가 (기획 5.2).

    같은 세션에서 이 단어를 이미 틀렸다면, 지금의 정답은 재출제를 맞힌 것이다.
    기획은 이를 "도움을 본 직후의 확인 답변"으로 보고 성장으로 인정하지 않는다.

    **씨앗 구간에서만 호출한다.** 잎 이상은 안정성으로만 판정하므로 이 쿼리가 필요 없다.
    매 답안마다 부르면 학습 로그 테이블에 쓸데없는 조회가 하루 수만 건 붙는다.
    """
    if not was_correct:
        return False
    if session_id is None:
        return True
    prior_wrong = (
        db.session.query(UserStudyLog.id)
        .filter(
            UserStudyLog.session_id == session_id,
            UserStudyLog.user_voca_id == user_voca_id,
            UserStudyLog.was_correct == False,   # noqa: E712 — SQLAlchemy 표현식
        )
        .first()
    )
    return prior_wrong is None


# ──────────────────────────────────────────────────────────────
# 황금 당근 판정 (기획 10.2)
# ──────────────────────────────────────────────────────────────

def check_golden(user_id: UUID, user_voca_id: int, game: UserVocaGame,
                 fsrs_state: dict) -> bool:
    """황금 조건 6가지를 모두 만족하는가.

    조건 3·4·5 는 학습 로그를 봐야 하므로 **당근 단계에서만** 부른다.
    당근이 아닌 단어에까지 이 조회를 붙이면 매 답안이 로그 스캔을 하게 된다.
    """
    # 조건 1 — 성장 단계 당근
    if (game.visual_stage or '') != VisualStage.CARROT:
        return False

    stability = _stability(fsrs_state)
    # 조건 2 — 안정성 180일 이상
    if stability < C.GOLDEN_MIN_STABILITY_DAYS:
        return False

    # 조건 6 — 다음 예정 간격 180일 이상.
    # FSRS state 에 간격이 따로 없으면 stability 를 간격의 대리값으로 쓴다.
    interval = (fsrs_state or {}).get('scheduled_days')
    if interval is not None:
        try:
            if float(interval) < C.GOLDEN_MIN_NEXT_INTERVAL_DAYS:
                return False
        except (TypeError, ValueError):
            pass

    # 조건 3·4·5 — 로그 기반.
    # 답을 미리 보여주는 유형(카드 매칭)과 지나치게 빠른 응답은 제외한다(10.5).
    logs = (
        db.session.query(UserStudyLog.was_correct, UserStudyLog.rating,
                         UserStudyLog.question_type, UserStudyLog.time_taken_ms)
        .filter(
            UserStudyLog.user_id == user_id,
            UserStudyLog.user_voca_id == user_voca_id,
        )
        .order_by(UserStudyLog.created_at.desc())
        .limit(30)
        .all()
    )
    valid = [
        r for r in logs
        if r.question_type not in C.GOLDEN_EXCLUDED_QUESTION_TYPES
        and (r.time_taken_ms or 0) >= C.GOLDEN_MIN_ANSWER_MS
    ]
    if len(valid) < C.GOLDEN_MIN_CORRECT_REVIEWS:
        return False

    # 조건 4 — 누적 정답 복습 6회 이상
    if sum(1 for r in valid if r.was_correct) < C.GOLDEN_MIN_CORRECT_REVIEWS:
        return False
    # 조건 3 — 최근 3회 모두 정답
    if not all(r.was_correct for r in valid[:C.GOLDEN_RECENT_SCHEDULED]):
        return False
    # 조건 5 — 최근 2회 중 Again(rating=1) 없음
    if any((r.rating or 0) == 1 for r in valid[:C.GOLDEN_NO_AGAIN_RECENT]):
        return False

    return True


def parse_fsrs_due(fsrs_state: dict) -> Optional[dt.datetime]:
    """FSRS next_review → naive UTC datetime."""
    nr = (fsrs_state or {}).get('next_review')
    if not nr:
        return None
    try:
        return dt.datetime.fromisoformat(str(nr).replace('Z', '+00:00')).replace(tzinfo=None)
    except (ValueError, TypeError):
        return None


def load_fsrs_state(user_voca) -> dict:
    """UserVoca.data → FSRS state dict. 파싱 실패는 빈 dict."""
    from app.services.fsrs.state import parse_user_voca_data, get_fsrs_state
    try:
        return get_fsrs_state(parse_user_voca_data(user_voca.data)) or {}
    except Exception:
        return {}
