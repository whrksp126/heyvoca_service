"""study/log → 게임 레이어 연결 hook.

post_study_log가 학습 데이터를 커밋한 '직후' 호출한다.
여기서의 실패는 학습 저장에 영향을 주지 않는다 (호출부 try/except).

- 콤보: AI 추천 테스트(test_type='quick')에서만 적립.
- 농장: 모든 학습 모드에서 반영(당근 첫 도달 보석은 모드 무관).
"""

from typing import Optional
from uuid import UUID

# 콤보를 적립하는 학습 모드 (AI 추천 테스트 + 채팅으로 학습)
# 채팅 학습은 사실상 AI 추천 테스트의 채팅 버전이므로 콤보/암기왕을 동일하게 적립한다.
AI_RECOMMEND_TEST_TYPES = {'quick', 'chat'}


def on_study_answer(
    user_id: UUID,
    test_type: str,
    was_correct: bool,
    user_voca_id: Optional[int] = None,
    memory_state_after: Optional[str] = None,
) -> dict:
    """답안 1건을 게임 레이어(콤보 + 농장)에 반영.

    Returns:
        {'combo': <combo payload|None>, 'farm': <farm event|None>}
        — /study/log 응답의 'combo' / 'farm' 키로 그대로 나간다.
    """
    result = {'combo': None, 'farm': None}

    # 콤보 — AI 추천 테스트만
    if test_type in AI_RECOMMEND_TEST_TYPES:
        from app.services.game.combo import apply_answer
        result['combo'] = apply_answer(user_id, was_correct)

    # 농장 — 모든 모드 (당근 첫 도달 보석 등)
    if user_voca_id is not None and memory_state_after is not None:
        from app.services.game.farm import on_answer
        result['farm'] = on_answer(user_id, user_voca_id, memory_state_after, bool(was_correct))

    return result
