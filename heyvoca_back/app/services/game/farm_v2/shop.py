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
`routes/common.register_gem_log`(내부 커밋)를 쓰지 않고 원장 행을 직접 넣는다.
"""

import datetime as dt
from typing import Optional
from uuid import UUID

from sqlalchemy import func

from app import db
from app.models.models import (
    FarmEvent, FarmItem, FarmItemReason, GemLog, GemReason, User,
)
from app.services.game.farm_v2 import constants as C
from app.services.game.farm_v2 import events, inventory, localday

# ── 경제 안전장치 (기획 9.4) ─────────────────────────────────────────
# 하루 농장 아이템 구매 지출 상한. 기획은 "설정에서만 변경 가능"이라고 하지만
# user_farm_setting 에 해당 컬럼이 없다(새 마이그레이션 금지) → 지금은 전역 고정값으로
# 두고, 컬럼이 생기면 _daily_limit() 만 사용자 설정을 읽도록 바꾸면 된다.
DAILY_GEM_SPEND_LIMIT = 30

# 한 번의 호출로 살 수 있는 묶음 수 상한.
# 상한을 두는 이유는 하루 한도만으로는 "한 번의 실수"를 못 막기 때문이다.
# 수량 스테퍼가 길게 눌리거나 클라이언트가 잘못된 값을 보내면 qty=999 가 그대로 오는데,
# 한도 안에서라도 사용자가 의도하지 않은 대량 구매는 되돌릴 방법이 없다.
# 10 묶음이면 어떤 상품이든 하루 한도를 넘기므로 정상 사용을 막지 않는다.
MAX_PURCHASE_QTY = 10

# 보석 원장에서 농장 상점 지출을 식별하는 값. V1 부활템 구매는 'revive_item' 이라
# 하루 한도 집계에 섞이지 않는다.
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


def _daily_limit(user_id: UUID) -> int:
    """하루 지출 상한 (기획 9.4). 사용자별 설정이 생기기 전까지는 전역 고정값."""
    return DAILY_GEM_SPEND_LIMIT


def daily_spend(user_id: UUID, now_utc: Optional[dt.datetime] = None) -> dict:
    """오늘(사용자 현지일) 농장 아이템에 쓴 보석 (기획 9.4).

    보유 아이템 수가 아니라 **보석 원장**을 집계한다. 아이템은 무료 획득 경로가 여럿이라
    보유량으로는 지출을 알 수 없고, 원장이 이미 모든 소비를 남기고 있어(9.4) 별도
    집계 테이블을 만들 이유가 없다.

    하루 경계는 KST 고정이 아니라 localday 를 쓴다 — 해외 사용자의 한도가 한국 자정에
    풀리면 자기 하루 안에서 두 번 한도를 쓰거나 반대로 못 쓰는 시간대가 생긴다.
    """
    now = now_utc or dt.datetime.utcnow()
    tz_name = localday.get_timezone(user_id)
    day = localday.local_day(now, tz_name)
    start, end = localday.day_bounds_utc(day, tz_name)

    spent = (
        db.session.query(func.coalesce(func.sum(GemLog.amount), 0))
        .filter(
            GemLog.user_id == user_id,
            GemLog.reason == GemReason.ITEM_PURCHASE,
            GemLog.source_type == GEM_SOURCE_TYPE,
            GemLog.created_at >= start,
            GemLog.created_at < end,
        )
        .scalar()
    ) or 0
    # 원장에는 차감이 음수로 쌓인다. 화면·비교는 양수 지출액으로 다룬다.
    spent = abs(int(spent))
    limit = _daily_limit(user_id)
    return {'spent': spent, 'limit': limit, 'remaining': max(0, limit - spent)}


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


def purchase(user_id: UUID, sku: str, qty: int = 1,
             now_utc: Optional[dt.datetime] = None) -> dict:
    """보석으로 농장 아이템 구매 (기획 8.2, 9.3).

    한 트랜잭션 안에서 보석 차감 → 원장 기록 → 아이템 지급 → 이벤트 기록까지 끝낸다.
    중간에 실패하면 전부 되돌린다. 아이템만 남거나 보석만 빠지는 상태가 한 순간도
    존재하면 안 된다 — 원장과 보유량이 어긋나면 inventory.audit 으로도 원인을 못 찾는다.

    사용자 행을 FOR UPDATE 로 잠그는 이유는 두 기기에서 동시에 구매 버튼을 눌렀을 때
    두 트랜잭션이 같은 잔액을 읽어 한도를 넘겨 사는 걸 막기 위해서다.

    Raises:
        LookupError     — 없는 sku, 없는 사용자
        ValueError      — 수량이 1..MAX_PURCHASE_QTY 범위 밖
        PermissionError — 보석 부족, 또는 오늘 지출 한도 초과(9.4)
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

    try:
        user = (
            db.session.query(User).filter(User.id == user_id).with_for_update().first()
        )
        if user is None:
            raise LookupError('사용자를 찾을 수 없어요.')

        if (user.gem_cnt or 0) < cost:
            # 결제 유도 문구는 넣지 않는다(기획 13.4). 무료 획득 안내는 화면이 한다.
            raise PermissionError('보석이 부족해요.')

        spend_state = daily_spend(user_id, now_utc)
        if spend_state['spent'] + cost > spend_state['limit']:
            raise PermissionError(
                '오늘 농장 아이템에 쓸 수 있는 보석은 {0}개까지예요. '
                '오늘 {1}개를 썼어요. 내일 다시 이용할 수 있어요.'.format(
                    spend_state['limit'], spend_state['spent'])
            )

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

        db.session.commit()
    except Exception:
        db.session.rollback()
        raise

    return {
        'sku': pack['sku'],
        'item_type': item_type,
        'granted': granted,
        'gem_cnt': gem_left,
        'item_qty': item_qty,
    }
