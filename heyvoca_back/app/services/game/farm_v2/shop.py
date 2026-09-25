"""농장 아이템 상점 — 보석으로 사는 게임 아이템 (기획 8.2, 9).

여기서 다루는 것은 **보석 → 농장 아이템** 교환이다. 현금 → 보석(인앱결제)은
`app/routes/purchase.py` 가 담당하며 이 모듈은 그쪽을 전혀 건드리지 않는다.
두 층을 섞지 않는 이유는 환불 정책이 다르기 때문이다 — 스토어 영수증은 취소·환불이
가능하지만 보석으로 산 게임 아이템은 즉시 재고가 되어 되돌릴 수 없다.

가격표는 `constants.py` 한 곳에만 둔다. 상점 진열 순서도 그 리스트 순서를 그대로 쓴다 —
가격이 싼 순서로 보여 줄지 개당 단가가 좋은 순서로 보여 줄지는 밸런싱 판단이고,
그 판단을 코드 여러 곳에 흩으면 조정할 때마다 화면과 계산이 어긋난다.

트랜잭션 원칙: 보석 차감과 아이템 지급은 **반드시 한 트랜잭션**이다. 어느 한쪽만
커밋되면 재화가 새거나(아이템만 지급) 사용자가 손해를 본다(보석만 차감). 그래서
원장 행을 같은 트랜잭션에 직접 넣는다(예전 `routes/common.register_gem_log` 는 내부 커밋이었다).
"""

import datetime as dt
from typing import Optional
from uuid import UUID

from app import db
from app.models.models import (
    FarmEvent, FarmItem, FarmItemReason, GemLog, GemReason, User,
)
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import events, inventory
from app.utils.db_lock import retry_on_deadlock

# ── 경제 안전장치 ─────────────────────────────────────────
# 하루 보석 지출 한도(기획 9.4, 30개)는 2026-09 연속 학습 보호권 개편에서 **완전히 제거**했다.
# 빈 날이 여러 날이면 보호권을 한꺼번에 사야 하는데(최대 7개 = 보석 70개), 하루 한도가
# 그 구매를 막으면 연속을 지킬 수단이 없어진다. 남은 안전장치는 1회 수량 상한뿐이다.

# 한 번의 호출로 살 수 있는 묶음 수 상한.
# 수량 스테퍼가 길게 눌리거나 클라이언트가 잘못된 값을 보내면 qty=999 가 그대로 오는데,
# 사용자가 의도하지 않은 대량 구매는 되돌릴 방법이 없다. 더 필요하면 나눠서 산다.
MAX_PURCHASE_QTY = 10

# 보석 원장에서 농장 상점 지출을 식별하는 값(V1 부활템 구매는 'revive_item').
GEM_SOURCE_TYPE = 'farm_item'

# 상점 진열 순서 = 삽 → 회복제 → 보호권. 부패 후 처리 흐름에서 사용자가 먼저 찾는 것이
# 삽이고, 보호권은 연속 학습 화면에서 따로 진입하는 상품이라 맨 뒤에 둔다.
_PACK_GROUPS = [
    (FarmItem.SHOVEL,   C.SHOVEL_PACKS),
    (FarmItem.NUTRIENT, C.NUTRIENT_PACKS),
    (FarmItem.SHIELD,   C.SHIELD_PACKS),
]


def _all_packs() -> list:
    """constants 의 (sku, 보석가, 지급수) 튜플을 계약 형태의 dict 로 편다.

    상수를 튜플로 둔 건 밸런싱 표를 한눈에 보기 위해서다. 반면 계약은 키가 있는
    객체를 요구한다. 변환을 이 한 함수에만 두어, 튜플 순서(가격이 먼저인지 개수가
    먼저인지)를 아는 코드가 여기 말고는 없게 한다.
    """
    packs = []
    for item_type, group in _PACK_GROUPS:
        for sku, gem_price, amount in group:
            packs.append({
                'sku': sku,
                'item_type': item_type,
                'gem_price': int(gem_price),
                'amount': int(amount),
                # 개당 보석. 화면이 "묶음이 이득"임을 보여 주는 유일한 근거라
                # 프론트에서 계산하게 두지 않고 서버가 확정값을 준다.
                'per_unit': round(float(gem_price) / float(amount), 2),
            })
    return packs


def list_packs() -> list:
    """GET /farm/shop 의 packs (기획 8.2).

    매 호출마다 새로 만든다. 모듈 전역에 캐시하면 운영 중 가격을 바꿨을 때
    (기획 9.4 — 앱 업데이트 없이 서버에서 가격 변경) 워커 재시작 전까지 옛 가격이 남는다.
    상품이 7개뿐이라 계산 비용은 무시할 수 있다.
    """
    return _all_packs()


def find_pack(sku: str) -> dict:
    """sku 로 상품 1개. 없으면 LookupError (라우트가 404 로 옮긴다).

    가격을 요청 본문에서 받지 않고 sku 로만 되찾는 이유는, 클라이언트가 보낸 가격을
    믿으면 보석 1개로 100개짜리 묶음을 사는 조작이 가능해지기 때문이다.
    """
    for pack in _all_packs():
        if pack['sku'] == sku:
            return pack
    raise LookupError('존재하지 않는 상품이에요.')


class GemShortage(PermissionError):
    """보석 부족. `shortage` = 모자란 보석 수 — 화면이 "보석이 N개 모자라요"를 그린다.

    PermissionError 를 상속해 기존 라우트(`/farm/shop/purchase`)의 400 처리를 그대로 탄다.
    """

    def __init__(self, message: str, shortage: int):
        super().__init__(message)
        self.shortage = int(shortage)


def get_wallet(user_id: UUID) -> dict:
    """GET /farm/items — 보유 아이템과 보석 잔액.

    아이템과 보석을 한 응답으로 묶는 이유는 화면이 늘 둘을 같이 쓰기 때문이다.
    "삽이 부족해요 / 보석 3개로 5개 받기" 안내를 두 번의 요청으로 나누면 두 값이
    서로 다른 시점의 것이 되어, 방금 산 아이템이 잔액에 안 비치는 순간이 생긴다.
    """
    gem_cnt = (
        db.session.query(User.gem_cnt).filter(User.id == user_id).scalar()
    )
    if gem_cnt is None:
        # 잔액 0 과 사용자 없음을 구분한다 — 후자는 토큰은 유효한데 계정이 지워진 경우다.
        exists = db.session.query(User.id).filter(User.id == user_id).first()
        if exists is None:
            raise LookupError('사용자를 찾을 수 없어요.')
        gem_cnt = 0
    return {'items': inventory.get_counts(user_id), 'gem_cnt': int(gem_cnt)}


@retry_on_deadlock
def purchase(user_id: UUID, sku: str, qty: int = 1,
             now_utc: Optional[dt.datetime] = None) -> dict:
    """보석으로 농장 아이템 구매 (기획 8.2, 9.3). 성공하면 커밋한다.

    한 트랜잭션 안에서 보석 차감 → 원장 기록 → 아이템 지급 → 이벤트 기록까지 끝낸다.
    중간에 실패하면 전부 되돌린다. 아이템만 남거나 보석만 빠지는 상태가 한 순간도
    존재하면 안 된다 — 원장과 보유량이 어긋나면 inventory.audit 으로도 원인을 못 찾는다.

    Raises:
        LookupError     — 없는 sku, 없는 사용자
        ValueError      — 수량이 1..MAX_PURCHASE_QTY 범위 밖
        GemShortage     — 보석 부족 (PermissionError 하위)
    """
    try:
        result = purchase_in_tx(user_id, sku, qty)
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return result


def purchase_in_tx(user_id: UUID, sku: str, qty: int = 1) -> dict:
    """`purchase` 의 본체 — **커밋하지 않는다.**

    보호권 부족분 구매(`streak_v2.protect_streak`)처럼 구매와 다른 상태 변경(보호권 소모·
    연속 재계산)을 한 트랜잭션으로 묶어야 하는 호출부가 쓴다. 보석 원장(GemLog)과 아이템
    원장은 상점 구매와 똑같이 남는다.

    사용자 행을 FOR UPDATE 로 잠그는 이유는 두 기기에서 동시에 구매 버튼을 눌렀을 때
    두 트랜잭션이 같은 잔액을 읽어 잔액 이상을 쓰는 걸 막기 위해서다. 잠금 순서는
    User → 아이템 행으로 전역 순서(`app/utils/db_lock.py`)와 같다. `protect_streak` 처럼
    호출부가 이미 User 를 잡은 경우에도 그대로 동작한다.
    """
    pack = find_pack(sku)

    try:
        qty = int(qty)
    except (TypeError, ValueError):
        raise ValueError('수량이 올바르지 않아요.')
    if qty < 1:
        raise ValueError('수량은 1개 이상이어야 해요.')
    if qty > MAX_PURCHASE_QTY:
        raise ValueError(f'한 번에 최대 {MAX_PURCHASE_QTY}묶음까지 살 수 있어요.')

    item_type = pack['item_type']
    cost = pack['gem_price'] * qty
    granted = pack['amount'] * qty
    label = inventory.ITEM_LABEL.get(item_type, item_type)

    user = (
        db.session.query(User).filter(User.id == user_id)
        .with_for_update().populate_existing().first()
    )
    if user is None:
        raise LookupError('사용자를 찾을 수 없어요.')

    if (user.gem_cnt or 0) < cost:
        # 결제 유도 문구는 넣지 않는다(기획 13.4). 무료 획득 안내는 화면이 한다.
        raise GemShortage('보석이 부족해요.', cost - (user.gem_cnt or 0))

    user.gem_cnt = (user.gem_cnt or 0) - cost
    gem_left = user.gem_cnt   # 커밋 후에는 인스턴스가 만료돼 다시 SELECT 가 나간다
    db.session.add(GemLog(
        user_id=user_id,
        amount=-cost,
        reason=GemReason.ITEM_PURCHASE,
        description='{0} {1}개 구매'.format(label, granted),
        source_type=GEM_SOURCE_TYPE,
        source_id=None,
        balance_after=user.gem_cnt,
    ))
    db.session.flush()

    item_qty = inventory.grant(
        user_id, item_type, granted, FarmItemReason.GEM_PURCHASE,
        description='{0} 구매(보석 {1}개)'.format(pack['sku'], cost),
    )

    if item_type == FarmItem.SHOVEL:
        # 삽만 전용 이벤트가 있다(16.2). 다시 심기 퍼널에서 "부패 → 상점 → 재심기"의
        # 전환을 보려면 구매 시점이 농장 이벤트 축에 남아 있어야 한다.
        events.log(
            user_id, FarmEvent.SHOVEL_PURCHASED,
            reason='GEM_PURCHASE',
            detail={'sku': pack['sku'], 'qty': qty, 'granted': granted, 'gem': cost},
        )

    return {
        'sku': pack['sku'],
        'item_type': item_type,
        'granted': granted,
        'gem_cnt': gem_left,
        'item_qty': item_qty,
    }
