"""
was_correct → FSRS rating(1~4) 변환.

2026-10 (이슈 #15 4차) 응답 시간·글자 수 기반 판정 폐기:
  오답                 → 1 (Again)
  정답                 → 3 (Good)
  오타 허용 정답(typo) → 2 (Hard)

예전에는 기대 응답 시간(1500 + 120×글자 수 + 200×난이도, 유형별 배수)과 실제 시간을
비교해 Easy/Good/Hard 를 갈랐지만, 조작 속도·글자 수가 기억 강도를 대변하지 못해
간격이 들쭉날쭉했다. Easy 는 이제 명시적 신호로만 쓴다(이 함수는 내지 않는다).
time_taken_ms·word_length 는 UserStudyLog 기록용으로만 남는다.
"""

from typing import Optional

from app.services.fsrs.core import AGAIN, HARD, GOOD, EASY


def derive_rating(
    was_correct: bool,
    time_taken_ms: Optional[int] = None,
    *,
    word_length: Optional[int] = None,
    fsrs_difficulty: Optional[float] = None,
    question_type: Optional[str] = None,
    typo: bool = False,
) -> int:
    """
    학습 결과를 FSRS rating(1~4)으로 변환.

    Args:
        was_correct: 정답 여부
        typo:        fillInTheBlankTyping 에서 오타 허용으로 정답 처리된 경우 True →
                     형태를 완전히 맞히지 못했으므로 Hard(2).
        time_taken_ms, word_length, fsrs_difficulty, question_type:
                     호출부 호환용으로 받기만 하고 판정에 쓰지 않는다(2026-10 폐기).

    Returns:
        1=Again, 2=Hard, 3=Good
    """
    if not was_correct:
        return AGAIN
    if typo:
        return HARD
    return GOOD


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
