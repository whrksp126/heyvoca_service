"""
was_correct + time_taken_ms → FSRS rating(1~4) 변환.

Phase 1.2: 단순 시간 컷오프 (5/10초)
Phase 2.3: 단어 길이/FSRS 난이도 기반 expected_time 보정 추가.

보정 로직 (RATINGS_USE_TIME_CALIBRATION=true, 기본값):
  expected_time_ms = 1500 + 120 * word_length + 200 * fsrs_difficulty
  ratio = time_taken_ms / expected_time_ms

  ratio <= 0.5 → 4 (Easy)
  ratio <= 1.0 → 3 (Good)
  그 외        → 2 (Hard)

폴백 조건:
  - RATINGS_USE_TIME_CALIBRATION=false 로 설정 시
  - word_length 또는 fsrs_difficulty 둘 중 하나라도 None 시
  단순 컷오프(5초/10초) 적용.
"""

import os
from typing import Optional

from app.services.fsrs.core import AGAIN, HARD, GOOD, EASY

# 기대 시간 계산 상수 (Phase 2.3)
_BASE_MS        = 1500   # 기본 기대 시간 (ms)
_PER_CHAR_MS    = 120    # 글자당 추가 시간 (ms)
_PER_DIFF_MS    = 200    # difficulty 단위당 추가 시간 (ms)

# 폴백 컷오프 (Phase 1.2 기존값)
_CUTOFF_EASY_MS = 5_000
_CUTOFF_GOOD_MS = 10_000


def _use_calibration() -> bool:
    """RATINGS_USE_TIME_CALIBRATION 환경변수 확인. 기본값 true."""
    val = os.environ.get('RATINGS_USE_TIME_CALIBRATION', 'true').strip().lower()
    return val != 'false'


def _expected_time_ms(word_length: int, fsrs_difficulty: float) -> float:
    """단어 길이·난이도 기반 기대 응답 시간(ms) 계산."""
    return _BASE_MS + _PER_CHAR_MS * word_length + _PER_DIFF_MS * fsrs_difficulty


def _rating_by_ratio(ratio: float) -> int:
    """ratio(실제/기대 시간 비율) → rating."""
    if ratio <= 0.5:
        return EASY
    elif ratio <= 1.0:
        return GOOD
    else:
        return HARD


def _rating_by_cutoff(time_taken_ms: int) -> int:
    """Phase 1.2 단순 컷오프 → rating."""
    if time_taken_ms <= _CUTOFF_EASY_MS:
        return EASY
    elif time_taken_ms <= _CUTOFF_GOOD_MS:
        return GOOD
    else:
        return HARD


def derive_rating(
    was_correct: bool,
    time_taken_ms: int,
    *,
    word_length: Optional[int] = None,
    fsrs_difficulty: Optional[float] = None,
) -> int:
    """
    학습 결과를 FSRS rating(1~4)으로 변환.

    Args:
        was_correct:     정답 여부
        time_taken_ms:   응답 소요 시간 (밀리초)
        word_length:     단어 길이 (글자 수). None이면 폴백.
        fsrs_difficulty: FSRS 난이도 (1.0~10.0). None이면 폴백.

    Returns:
        1=Again, 2=Hard, 3=Good, 4=Easy

    환경변수:
        RATINGS_USE_TIME_CALIBRATION=false 로 설정하면 기존 단순 컷오프 사용.
    """
    if not was_correct:
        return AGAIN

    # 보정 조건: 환경변수 ON + 파라미터 모두 존재
    if _use_calibration() and word_length is not None and fsrs_difficulty is not None:
        expected = _expected_time_ms(word_length, float(fsrs_difficulty))
        ratio = time_taken_ms / expected if expected > 0 else float('inf')
        return _rating_by_ratio(ratio)

    # 폴백: 기존 단순 컷오프
    return _rating_by_cutoff(time_taken_ms)


def rating_to_q_score(rating: int) -> int:
    """
    FSRS rating → SM2 q_score 역산.
    UserStudyLog.q_score 컬럼(SM2 호환용).

    변환표:
      rating 1 (Again) → q_score 0
      rating 2 (Hard)  → q_score 3
      rating 3 (Good)  → q_score 4
      rating 4 (Easy)  → q_score 5
    """
    mapping = {AGAIN: 0, HARD: 3, GOOD: 4, EASY: 5}
    return mapping.get(rating, 4)
