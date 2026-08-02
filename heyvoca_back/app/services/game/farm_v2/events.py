"""작물 상태 전이 로그 (기획 16.2).

**커밋하지 않는다.** 호출부의 트랜잭션에 얹기만 한다. 상태 변경과 그 기록이 서로 다른
트랜잭션에 있으면 한쪽만 남는 순간이 생기고, 그 로그로 밸런싱을 판단하게 된다.
"""

import json
from typing import Optional
from uuid import UUID

from app import db
from app.models.models import FarmEvent, FarmEventLog


def log(user_id: UUID, event: str, user_voca_id: Optional[int] = None,
        from_state: Optional[str] = None, to_state: Optional[str] = None,
        reason: Optional[str] = None, session_id=None, purchase_id=None,
        detail: Optional[dict] = None) -> FarmEventLog:
    """이벤트 1건 기록. detail 은 dict 를 주면 JSON 문자열로 넣는다."""
    row = FarmEventLog(
        user_id=user_id,
        event=event,
        user_voca_id=user_voca_id,
        from_state=from_state,
        to_state=to_state,
        reason=reason,
        session_id=session_id,
        purchase_id=purchase_id,
        detail=_encode(detail),
    )
    db.session.add(row)
    return row


def log_many(rows: list) -> None:
    """여러 건을 한 번에. 일괄 회복·전환처럼 수백 건이 한 트랜잭션에 들어갈 때 쓴다."""
    if rows:
        db.session.bulk_save_objects(rows)


def build(user_id: UUID, event: str, **kwargs) -> FarmEventLog:
    """log_many 에 넣을 행을 만들기만 하고 session 에 넣지 않는다."""
    detail = kwargs.pop('detail', None)
    return FarmEventLog(user_id=user_id, event=event, detail=_encode(detail), **kwargs)


def _encode(detail) -> Optional[str]:
    if detail is None:
        return None
    if isinstance(detail, str):
        return detail[:255]
    try:
        # detail 은 감사용 부가 정보다. 길어서 잘리더라도 본 컬럼들(from/to/reason)이
        # 남아 있으므로 기록 자체가 무의미해지지는 않는다.
        return json.dumps(detail, ensure_ascii=False)[:255]
    except (TypeError, ValueError):
        return None


# 상태 전이에 대응하는 이벤트를 고르는 표.
# 호출부마다 if 문으로 고르면 같은 전이가 파일마다 다른 이벤트로 기록된다.
STAGE_UP_EVENT = {
    'UNPLANTED_SEED->PLANTED_SEED': FarmEvent.SEED_PLANTED,
    'PLANTED_SEED->SPROUT':         FarmEvent.SPROUTED,
}


def stage_up_event(from_stage: str, to_stage: str) -> str:
    """단계 상승 이벤트 이름. 심기·발아는 전용 이벤트가 있고 나머지는 STAGE_UP."""
    return STAGE_UP_EVENT.get(f'{from_stage}->{to_stage}', FarmEvent.STAGE_UP)


# 건강이 나빠지는 전이에서 남길 이벤트. 좋아지는 전이(물주기)는 REVIEW_WATERED 로 묶는다.
HEALTH_DOWN_EVENT = {
    'WILTED':   FarmEvent.WILT_STARTED,
    'CRITICAL': FarmEvent.CRITICAL_STARTED,
    'ROTTEN':   FarmEvent.ROTTEN_CONFIRMED,
}
