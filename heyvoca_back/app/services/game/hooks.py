"""study/log → 게임 레이어 연결 hook.

post_study_log가 학습 데이터를 커밋한 '직후' 호출한다.
여기서의 실패는 학습 저장에 영향을 주지 않는다 (호출부 try/except).

- 콤보: AI 추천 테스트(test_type='quick')에서만 적립.
- 농장: 모든 학습 모드에서 반영(당근 첫 도달 보석은 모드 무관). V2(farm_v2)를 쓴다.
- 연속 학습일: 정답일 때만 반영(기획 11.1 — 하루 서로 다른 단어 5개).

세 갈래를 각각 감싸는 이유는 서로를 막지 않기 위해서다. 농장 반영이 실패했다고
연속 학습일까지 빠지면 사용자는 '오늘 학습이 통째로 안 세어진' 것으로 겪는다.
"""

import logging
from typing import Optional
from uuid import UUID

# 콤보를 적립하는 학습 모드 (AI 추천 테스트 + 채팅으로 학습)
# 채팅 학습은 사실상 AI 추천 테스트의 채팅 버전이므로 콤보/암기왕을 동일하게 적립한다.
AI_RECOMMEND_TEST_TYPES = {'quick', 'chat'}

_log = logging.getLogger(__name__)


def on_study_answer(
    user_id: UUID,
    test_type: str,
    was_correct: bool,
    user_voca_id: Optional[int] = None,
    memory_state_after: Optional[str] = None,
    session_id=None,
) -> dict:
    """답안 1건을 게임 레이어(콤보 + 농장 + 연속 학습일)에 반영.

    `memory_state_after` 는 V1 농장이 쓰던 인자다. V2 는 FSRS 안정성으로 단계를
    직접 계산하므로 쓰지 않지만, 호출부 시그니처를 깨지 않으려고 남겨 둔다.

    `session_id` 는 V2 가 요구한다 — 씨앗 구간의 '독립 정답' 판정(5.1)과
    세션 종료 요약(12.3)이 이벤트 로그의 세션 구분에 기대기 때문이다.

    Returns:
        {'combo': <combo payload|None>, 'farm': <farm payload|None>,
         'streak': <streak payload|None>}
        — /study/log 응답의 'combo' / 'farm' / 'streak' 키로 그대로 나간다.
    """
    from app import db

    result = {'combo': None, 'farm': None, 'streak': None}

    # ── 콤보 — AI 추천 테스트만 (V1 그대로) ──
    if test_type in AI_RECOMMEND_TEST_TYPES:
        from app.services.game.combo import apply_answer
        result['combo'] = apply_answer(user_id, was_correct)

    if user_voca_id is None:
        return result

    # ── 농장 V2 — 모든 모드 ──
    try:
        from app.services.game.farm_v2.answer import on_answer
        result['farm'] = on_answer(user_id, user_voca_id, bool(was_correct),
                                   session_id=session_id)
    except Exception:
        db.session.rollback()
        _log.warning('농장 반영 실패 (학습 저장은 정상)', exc_info=True)

    # ── 부패 처리 진단 마무리 (기획 7.2 / 7.3) ──
    # on_answer 는 정답이면 health_state 를 FRESH 로 되돌린다. 즉 이 호출이 빠지면
    # 부패 표시만 조용히 풀리고 다시 심기/회복은 확정되지 않는다. 반드시 on_answer
    # **뒤에** 온다 — 진단도 평범한 학습 로그로 남긴 다음 게임 상태를 확정하는 순서다.
    # 진단 대상이 아닌 평범한 답안이 훨씬 많으므로, 그 경우의 ValueError 는 조용히 넘긴다.
    try:
        from app.services.game.farm_v2.restore import complete_diagnosis
        complete_diagnosis(user_id, user_voca_id, bool(was_correct),
                           session_id=session_id)
    except (LookupError, ValueError):
        # 진단이 걸려 있지 않은 작물 — 정상 경로다. 잠금을 풀어 준다.
        db.session.rollback()
    except Exception:
        db.session.rollback()
        _log.warning('진단 마무리 실패 (학습 저장은 정상)', exc_info=True)

    # ── 연속 학습일 (기획 11.1) — 정답만 ──
    # 오답에도 부르면 '하루 5개'가 시도 횟수로 바뀐다. 서비스가 오답 여부를 따로
    # 검사하지 않으므로 거르는 책임은 여기에 있다.
    if was_correct:
        try:
            from app.services.game.farm_v2.streak_v2 import record_correct_word
            result['streak'] = record_correct_word(user_id, user_voca_id)
        except Exception:
            db.session.rollback()
            _log.warning('연속 학습일 반영 실패 (학습 저장은 정상)', exc_info=True)

    return result
