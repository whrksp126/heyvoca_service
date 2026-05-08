"""
recommend/ranking.py — bucket별 FSRS 기반 정렬 함수.

각 함수는 CandidateItem 리스트를 받아 정렬된 리스트를 반환.
원본 리스트는 변경하지 않는다.
"""

import random
import datetime as dt
from typing import List

from app.services.recommend.pool import CandidateItem


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


def _get_retrievability(item: CandidateItem) -> float:
    """현재 retrievability 값 반환 (0.0~1.0)."""
    return float(item.fsrs_state.get("retrievability") or 0.0)


def _get_stability(item: CandidateItem) -> float:
    """stability 값 반환."""
    return float(item.fsrs_state.get("stability") or 0.0)


def rank_overdue(items: List[CandidateItem], now: dt.datetime = None) -> List[CandidateItem]:
    """
    overdue 단어 정렬.
    next_review가 가장 오래된 순(오름차순) — 오래 묵은 단어 먼저.
    """
    return sorted(items, key=lambda it: _parse_next_review(it))


def rank_today(items: List[CandidateItem], now: dt.datetime = None) -> List[CandidateItem]:
    """
    today 단어 정렬.
    Phase 1.3은 그룹 내 셔플. Phase 2.2에서 인터리빙 추가 예정.
    """
    result = list(items)
    random.shuffle(result)
    return result


def rank_long_interleave(items: List[CandidateItem]) -> List[CandidateItem]:
    """
    장기 단어 정렬.
    주 기준: retrievability 오름차순 (망각 위험 순).
    보조 기준: stability 오름차순 (같은 retrievability면 stability 낮은 것 먼저).
    복합 키: (retrievability ASC, stability ASC)
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


def rank_short_medium(items: List[CandidateItem]) -> List[CandidateItem]:
    """
    단기/중기 단어 정렬.
    retrievability 낮은 것(망각 위험) 우선.
    """
    return sorted(items, key=lambda it: _get_retrievability(it))
