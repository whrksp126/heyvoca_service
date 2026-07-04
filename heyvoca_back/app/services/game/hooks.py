"""study/log → 게임 레이어 연결 hook.

post_study_log가 학습 데이터를 커밋한 '직후' 호출한다.
여기서의 실패는 학습 저장에 영향을 주지 않는다 (호출부 try/except).
트랙 ④ 당근 농장도 이 함수에 합류한다 — study.py 재수정 없음.
"""

from typing import Optional
from uuid import UUID

# 콤보를 적립하는 학습 모드 (AI 추천 테스트)
AI_RECOMMEND_TEST_TYPES = {'quick'}


def on_study_answer(user_id: UUID, test_type: str, was_correct: bool) -> Optional[dict]:
    """답안 1건을 게임 레이어에 반영. /study/log 응답의 'combo' 키로 그대로 나간다.

    Returns:
        콤보 payload dict — 대상 모드가 아니면 None.
    """
    if test_type not in AI_RECOMMEND_TEST_TYPES:
        return None

    from app.services.game.combo import apply_answer
    return apply_answer(user_id, was_correct)
