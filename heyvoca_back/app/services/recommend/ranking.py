"""
recommend/ranking.py — bucket별 FSRS 기반 정렬 함수.

각 함수는 CandidateItem 리스트를 받아 정렬된 리스트를 반환.
원본 리스트는 변경하지 않는다.

약함 점수(weakness score, 2026-09 추가):
  단어별 "최근 5회 정오답·연속 정답·마지막 학습"(mastery, pool.py의 CandidateItem.mastery)과
  FSRS difficulty(D)/lapses/retrievability(R)를 합쳐 "얼마나 못 외운 단어인가"를 0~1로 수치화.
  overdue/lapse 버킷에서는 next_review/retrievability가 동률일 때의 tie-break로 쓰이고,
  short/medium/long 버킷(rank_by_weakness)에서는 tie-break로만 쓰인다(2026-09 정정 — 아래 참조).

short/medium/long 버킷 정렬(rank_by_weakness, 2026-09 정정):
  1차 기준은 "지금 시점" retrievability(_current_retrievability — last_studied_at 경과 시간
  + stability로 FSRS 공식을 다시 계산) 오름차순이다. fsrs_state에 저장된 retrievability는
  마지막 복습 '당시' 스냅샷이라(복습 직후엔 항상 ~1.0) 방금 학습한 단어와 며칠 전 학습한
  단어를 구분하지 못해서, 그걸 그대로 쓰던 이전 버전은 방금 처음 맞힌 단어가 다음 세션에
  바로 다시 뽑히는 버그가 있었다. 약함 점수는 tie-break로만 쓰고, 최근 몇 시간 이내 학습한
  단어는 그 무엇과도 무관하게 정렬 맨 뒤로 보낸다(제외는 아님).
"""

import random
import datetime as dt
from typing import List, Optional

from app.services.recommend.pool import CandidateItem
from app.services.fsrs.core import _retrievability as _fsrs_retrievability

# ──────────────────────────────────────────────
# 약함 점수(weakness) 가중치 — 각 항목 0~1로 정규화한 뒤 가중합(합계 1.0).
# 값이 클수록 "더 취약한(우선 학습이 필요한) 단어".
# ──────────────────────────────────────────────

# 최근 5회 중 실패율 — 가장 직접적인 "진짜 못 외움" 신호라 가중치를 가장 크게 둔다.
_WEAKNESS_W_RECENT_ACC     = 0.40
# FSRS difficulty(D) — core.py의 _init_difficulty/_next_difficulty가 [1,10]으로 clamp한다.
_WEAKNESS_W_DIFFICULTY     = 0.20
# 누적 실패 횟수(fsrs.lapses) — 상한 이후 포화(아래 _LAPSES_NORM_CAP).
_WEAKNESS_W_LAPSES         = 0.10
# 현재 retrievability(R) 기반 망각 위험 — 기존 알고리즘이 쓰던 시간 기반 신호를 그대로 승계.
_WEAKNESS_W_RETRIEVABILITY = 0.20
# 최근에 이미 학습했는지(24h/72h) — recency_penalty. **감점 항**("최근에 본 단어는
# 순위를 뒤로") — compute_weakness에서 빼서 최종 점수가 0 미만이면 0으로 clamp한다.
# (2026-09 정정: 최초 구현이 실수로 가산 항이었다 — 리뷰 후 부호 수정.)
# "지금 아는 단어"를 후보에서 아예 빼는 강한 규칙은 composer.py가 별도로 담당한다
# (streak>=3 && 24h 이내). 이 항은 그 문턱에는 못 미치지만 최근에 본 단어를
# 약하게나마 뒤로 미루는 보조 신호다.
_WEAKNESS_W_RECENCY        = 0.10

# FSRS-5 표준 difficulty clamp 범위 (core.py: max(1.0, min(10.0, ...)))
_DIFFICULTY_MIN = 1.0
_DIFFICULTY_MAX = 10.0

# 8회 이상 실패한 단어는 이미 "가장 취약" 취급 — 그 이상 늘어나도 점수가 계속 커지지 않게 포화.
_LAPSES_NORM_CAP = 8.0

# recency_penalty 구간 (last_studied_at 기준 경과 시간)
_RECENCY_WINDOW_24H_HOURS = 24.0
_RECENCY_WINDOW_72H_HOURS = 72.0
_RECENCY_PENALTY_24H      = 1.0
_RECENCY_PENALTY_72H      = 0.5
_RECENCY_PENALTY_ELSE     = 0.0

# recent 기록이 아예 없을 때(신규로 short/medium/long에 막 편입된 경우 등) recent_acc는
# "모른다"가 아니라 중립으로 취급 — 0.5(실패율 0.5)로 두면 가중합 기여가 평균 근처가 된다.
_NEUTRAL_RECENT_ACC = 0.5

# 가중 랜덤 샘플링 시 최소 확률을 보장하기 위한 가중치 하한(0점이어도 완전히 배제되지 않게).
_SAMPLING_WEIGHT_FLOOR = 0.01

# rank_by_weakness: 최근 이 시간(시) 이내에 학습한 단어는 R/약함 점수와 무관하게 정렬 맨 뒤로
# 보낸다(제외는 아님 — 후보가 이것뿐이면 그래도 반환된다). 방금 복습을 마친 단어가 곧바로
# 다음 세션에 다시 뽑히는 것을 막기 위함(2026-09 버그 수정).
_RECENT_STUDY_PUSH_BACK_HOURS = 3.0


def _parse_next_review(item: CandidateItem) -> dt.datetime:
    """next_review ISO 문자열 → datetime. 파싱 실패 시 epoch 반환."""
    raw = item.fsrs_state.get("next_review")
    if not raw:
        return dt.datetime(1970, 1, 1)
    try:
        return dt.datetime.fromisoformat(
            str(raw).replace("Z", "+00:00")
        ).replace(tzinfo=None)
    except (ValueError, AttributeError):
        return dt.datetime(1970, 1, 1)


def _parse_last_studied_at(mastery: dict) -> Optional[dt.datetime]:
    """mastery.last_studied_at ISO 문자열 → datetime. 없거나 파싱 실패 시 None."""
    raw = (mastery or {}).get("last_studied_at")
    if not raw:
        return None
    try:
        return dt.datetime.fromisoformat(
            str(raw).replace("Z", "+00:00")
        ).replace(tzinfo=None)
    except (ValueError, AttributeError):
        return None


def _get_retrievability(item: CandidateItem) -> float:
    """fsrs_state에 저장된 retrievability 스냅샷 반환 (0.0~1.0).

    주의: 이 값은 "지금"이 아니라 **마지막 복습 시점**에 계산되어 저장된 값이다
    (core.py의 new_r은 elapsed_days=0으로 계산되므로 복습 직후엔 항상 ~1.0에 가깝다).
    "지금 까먹었을 가능성"이 필요하면 _current_retrievability를 쓸 것.
    """
    return float(item.fsrs_state.get("retrievability") or 0.0)


def _current_retrievability(item: CandidateItem, now: dt.datetime) -> float:
    """
    지금 시점의 retrievability(R) — FSRS 공식(core._retrievability)으로
    "마지막 학습 이후 경과 시간"을 반영해 새로 계산한다.

    fsrs_state.retrievability는 마지막 복습 '당시' 스냅샷이라(위 _get_retrievability 참조)
    방금 학습한 단어와 며칠 전 학습한 단어를 구분하지 못한다 — short/medium/long 버킷
    정렬(rank_by_weakness)은 항상 이 함수로 다시 계산한 값을 쓴다.
    stability<=0(비정상 데이터)이면 0.0(가장 취약)으로 취급.
    """
    stability = _get_stability(item)
    if stability <= 0:
        return 0.0
    last_studied = _parse_last_studied_at(item.mastery)
    if last_studied is None or now is None:
        # 학습 이력 시각을 알 수 없으면 stale 스냅샷으로 폴백(완전히 망가진 데이터 방어용).
        return _get_retrievability(item)
    elapsed_days = max(0.0, (now - last_studied).total_seconds() / 86400.0)
    return _fsrs_retrievability(elapsed_days, stability)


def _studied_recently(item: CandidateItem, now: dt.datetime, *, hours: float = _RECENT_STUDY_PUSH_BACK_HOURS) -> bool:
    """마지막 학습이 hours시간 이내인지. rank_by_weakness에서 정렬 맨 뒤로 미루는 데 사용."""
    last_studied = _parse_last_studied_at(item.mastery)
    if last_studied is None or now is None:
        return False
    elapsed_hours = (now - last_studied).total_seconds() / 3600.0
    return 0 <= elapsed_hours <= hours


def _get_stability(item: CandidateItem) -> float:
    """stability 값 반환."""
    return float(item.fsrs_state.get("stability") or 0.0)


def _get_difficulty(item: CandidateItem) -> float:
    """difficulty 값 반환 (0.0 = 미기록/신규)."""
    return float(item.fsrs_state.get("difficulty") or 0.0)


def _get_lapses(item: CandidateItem) -> int:
    """누적 실패 횟수 반환."""
    try:
        return int(item.fsrs_state.get("lapses") or 0)
    except (TypeError, ValueError):
        return 0


def _norm_difficulty(d: float) -> float:
    """difficulty(대략 [1,10]) → [0,1]. 0.0(미기록)이면 중립(0.5)."""
    if d <= 0:
        return _NEUTRAL_RECENT_ACC  # 0.5 — 미기록을 "쉬움"으로 편향시키지 않는다
    return max(0.0, min(1.0, (d - _DIFFICULTY_MIN) / (_DIFFICULTY_MAX - _DIFFICULTY_MIN)))


def _norm_lapses(lapses: int) -> float:
    """lapses → [0,1], _LAPSES_NORM_CAP 이상이면 1.0으로 포화."""
    if lapses <= 0:
        return 0.0
    return max(0.0, min(1.0, lapses / _LAPSES_NORM_CAP))


def _recent_acc(mastery: dict) -> float:
    """mastery.recent(최신이 맨 앞인 bool 리스트) 평균 정답률. 기록 없으면 중립(0.5)."""
    recent = (mastery or {}).get("recent") or []
    if not recent:
        return _NEUTRAL_RECENT_ACC
    return sum(1 for v in recent if v) / len(recent)


def _recency_penalty(mastery: dict, now: dt.datetime) -> float:
    """last_studied_at 기준 경과 시간 → 24h/72h 구간 페널티."""
    last = _parse_last_studied_at(mastery)
    if last is None or now is None:
        return _RECENCY_PENALTY_ELSE
    hours = (now - last).total_seconds() / 3600.0
    if hours < 0:
        hours = 0.0
    if hours <= _RECENCY_WINDOW_24H_HOURS:
        return _RECENCY_PENALTY_24H
    if hours <= _RECENCY_WINDOW_72H_HOURS:
        return _RECENCY_PENALTY_72H
    return _RECENCY_PENALTY_ELSE


def compute_weakness(item: CandidateItem, now: dt.datetime) -> float:
    """
    "약함 점수" — 값이 클수록 우선 학습이 필요한(취약한) 단어.

    weakness = 0.40*(1-recent_acc) + 0.20*norm(D) + 0.10*norm(lapses)
             + 0.20*(1-R) - 0.10*recency_penalty   (0 미만이면 0으로 clamp)

    recency_penalty는 감점 항이다 — "최근에 이미 본 단어는 순위를 뒤로" 의도
    (2026-09 정정: 최초 구현이 실수로 가산 항이었다).
    """
    recent_acc = _recent_acc(item.mastery)
    difficulty = _norm_difficulty(_get_difficulty(item))
    lapses     = _norm_lapses(_get_lapses(item))
    retriev    = _get_retrievability(item)
    recency    = _recency_penalty(item.mastery, now)

    score = (
        _WEAKNESS_W_RECENT_ACC * (1.0 - recent_acc)
        + _WEAKNESS_W_DIFFICULTY * difficulty
        + _WEAKNESS_W_LAPSES * lapses
        + _WEAKNESS_W_RETRIEVABILITY * (1.0 - retriev)
        - _WEAKNESS_W_RECENCY * recency
    )
    return max(0.0, score)


def is_known_word(item: CandidateItem, now: dt.datetime, *, streak_threshold: int = 3,
                   recency_hours: float = 24.0) -> bool:
    """
    "지금 아는 단어" 판정 — 연속 정답 streak_threshold회 이상 && 마지막 학습이
    recency_hours시간 이내. composer.py의 후보 제외 규칙에서 사용.
    """
    mastery = item.mastery or {}
    streak = int(mastery.get("streak") or 0)
    if streak < streak_threshold:
        return False
    last = _parse_last_studied_at(mastery)
    if last is None or now is None:
        return False
    hours = (now - last).total_seconds() / 3600.0
    return 0 <= hours <= recency_hours


def rank_overdue(items: List[CandidateItem], now: dt.datetime = None) -> List[CandidateItem]:
    """
    overdue 단어 정렬.
    1차: next_review가 가장 오래된 순(오름차순) — 오래 묵은 단어 먼저.
    2차(동률 tie-break): 약함 점수 내림차순.
    """
    now = now or dt.datetime.utcnow()
    return sorted(
        items,
        key=lambda it: (_parse_next_review(it), -compute_weakness(it, now))
    )


def rank_today(items: List[CandidateItem], now: dt.datetime = None) -> List[CandidateItem]:
    """
    today 단어 정렬.
    셔플 기반(고정 정렬 키가 없어 tie-break 개념이 적용되지 않는다 — 의도적으로 유지).
    """
    result = list(items)
    random.shuffle(result)
    return result


def rank_long_interleave(items: List[CandidateItem]) -> List[CandidateItem]:
    """
    (레거시) retrievability·stability 오름차순 정렬.
    2026-09부터 'long' 버킷은 rank_by_weakness를 쓰므로 composer.py에서 더 이상 호출하지
    않지만, 다른 코드/테스트가 참조할 수 있어 함수 자체는 남겨 둔다.
    """
    return sorted(
        items,
        key=lambda it: (_get_retrievability(it), _get_stability(it))
    )


def rank_new(items: List[CandidateItem]) -> List[CandidateItem]:
    """
    미학습 단어 정렬.
    Fisher-Yates 셔플 (균등 랜덤 노출).
    """
    result = list(items)
    random.shuffle(result)
    return result


def rank_short_medium(items: List[CandidateItem], now: dt.datetime = None) -> List[CandidateItem]:
    """
    (lapse 버킷 전용, 2026-09부터) retrievability 낮은 것(망각 위험) 우선.
    동률 tie-break로 약함 점수 내림차순을 추가.
    short/medium 버킷은 더 이상 이 함수를 쓰지 않는다 — rank_by_weakness 참조.

    최우선 규칙(rank_by_weakness와 동일, 2026-09 추가): 최근
    `_RECENT_STUDY_PUSH_BACK_HOURS`시간 이내에 학습한 단어는 정렬 맨 뒤로 보낸다(제외는
    아님) — 방금 세션에서 맞힌 lapse 단어가 곧바로 다음 세션에도 최우선으로 다시
    뽑히는 것을 막는다.
    """
    now = now or dt.datetime.utcnow()
    return sorted(
        items,
        key=lambda it: (
            _studied_recently(it, now),
            _get_retrievability(it),
            -compute_weakness(it, now),
        )
    )


def rank_by_weakness(items: List[CandidateItem], now: dt.datetime = None) -> List[CandidateItem]:
    """
    short/medium/long 버킷 정렬 (2026-09 정정).

    1차: 지금 시점 retrievability(R, _current_retrievability) 오름차순 —
         "지금 까먹었을 가능성이 높은 단어"(R 낮음)가 앞.
    2차(동률 tie-break): 약함 점수(compute_weakness) 내림차순 — 더 취약한 쪽이 앞.
    최우선 규칙: 최근 _RECENT_STUDY_PUSH_BACK_HOURS시간 이내에 학습한 단어는 R/약함
         점수와 무관하게 정렬 맨 뒤로 보낸다(제외는 아님 — 후보가 그것뿐이면 그래도 나온다).

    (예전 버전은 fsrs_state에 저장된 "마지막 복습 시점" retrievability 스냅샷을 그대로 써서
    방금 처음 맞힌 단어(경과 시간 0 → R≈1.0로 저장되지만, 약함 점수 자체에는 recency가 약하게만
    반영돼 며칠 전 학습한 단어와 거의 동률로 취급됐다)가 다음 세션에 바로 다시 뽑히는 버그가
    있었다 — _current_retrievability로 항상 지금 시점 R을 재계산해 해결.)

    composer.py는 이 정렬 결과의 상위 min(len, 3*quota)만 후보로 삼아 그 안에서
    점수 가중 랜덤 샘플링을 한다(매 세션 top-N 고정 반복 방지). 시그니처/반환 형태는 그대로다.
    """
    now = now or dt.datetime.utcnow()
    return sorted(
        items,
        key=lambda it: (
            _studied_recently(it, now),       # False(0) 먼저 → 최근 학습 단어는 True(1)로 맨 뒤
            _current_retrievability(it, now), # 오름차순 — R 낮을수록(망각 위험) 앞
            -compute_weakness(it, now),       # tie-break: 약함 점수 내림차순
        ),
    )


def weighted_sample_without_replacement(
    items: List[CandidateItem],
    now: dt.datetime,
    k: int,
    rng: Optional[random.Random] = None,
) -> List[CandidateItem]:
    """
    약함 점수를 가중치로 한 비복원 랜덤 샘플링.
    items는 이미 rank_by_weakness로 top-N만 추린 후보 목록이어야 한다(호출부 책임).

    rng: 테스트에서 결정적 결과를 검증할 때 random.Random(seed) 주입 가능.
    """
    if k <= 0 or not items:
        return []
    rng = rng or random
    now = now or dt.datetime.utcnow()

    pool = [(it, max(_SAMPLING_WEIGHT_FLOOR, compute_weakness(it, now))) for it in items]
    result: List[CandidateItem] = []
    for _ in range(min(k, len(pool))):
        total = sum(w for _, w in pool)
        if total <= 0:
            idx = rng.randrange(len(pool))
        else:
            r = rng.uniform(0.0, total)
            acc = 0.0
            idx = len(pool) - 1
            for i, (_, w) in enumerate(pool):
                acc += w
                if r <= acc:
                    idx = i
                    break
        result.append(pool.pop(idx)[0])
    return result
