"""실험실 '내 농장 꾸미기' 서비스. 계약: docs/FARM_LAB_CONTRACT.md

라우트(app/routes/farm_lab.py)는 HTTP 만 맡고 판단은 여기서 한다.
실패는 FarmError(code, message, extra)로 알린다.
"""
import json
import os
from uuid import UUID, uuid4

from sqlalchemy import func

from app import db
from app.models.models import (
    GemReason, UserFarmInventory, UserFarmLayout, UserVocaBook, UserVocaBookMap,
    UserVocaGame, VisualStage,
)
from app.utils.gem import InsufficientGem, change_gem, start_user_tx

_CATALOG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'farm_catalog.json')
with open(_CATALOG_PATH, encoding='utf-8') as _f:
    _RAW = json.load(_f)

GRID_W = _RAW['grid']['w']
GRID_H = _RAW['grid']['h']
CATALOG = _RAW['items']
ITEMS = {i['id']: i for i in CATALOG}
CROP_IDS = {i['id'] for i in CATALOG if i['category'] == 'crop'}
DEFAULT_CROP = 'carrot'
MAX_LAYOUT = 800
STAGE_KEYS = ('seed', 'sprout', 'leaf', 'carrot', 'golden')
_STAGE_OF = {
    VisualStage.UNPLANTED_SEED: 'seed', VisualStage.PLANTED_SEED: 'seed',
    VisualStage.SPROUT: 'sprout', VisualStage.LEAF: 'leaf',
    VisualStage.CARROT: 'carrot', VisualStage.GOLDEN: 'golden',
}


class FarmError(Exception):
    def __init__(self, code, message, extra=None):
        super().__init__(message)
        self.code, self.message, self.extra = code, message, extra or {}


def _placeable(item):
    return item['category'] != 'crop'


def _user_books(user_id):
    return (UserVocaBook.query
            .filter(UserVocaBook.user_id == user_id, UserVocaBook.book_kind == 'normal')
            .order_by(UserVocaBook.created_at.asc()).all())


def _stats(user_id):
    from app.services.streak import get_user_streak
    from app.utils.script_scope import script_user_voca_ids_subquery
    streak = int(get_user_streak(user_id)[0] or 0)
    learned = (db.session.query(func.count(UserVocaGame.user_voca_id))
               .filter(UserVocaGame.user_id == user_id,
                       UserVocaGame.visual_stage != VisualStage.UNPLANTED_SEED,
                       ~UserVocaGame.user_voca_id.in_(script_user_voca_ids_subquery(user_id)))
               .scalar() or 0)
    return {'streak': streak, 'words_learned': int(learned)}


def _unlocked(item, stats):
    u = item.get('unlock')
    if not u:
        return True
    return int(stats.get(u['type'], 0)) >= int(u['value'])


def _occupied(layout, skip_uid=None):
    cells = set()
    for e in layout:
        it = ITEMS[e['item_id']]
        for dx in range(it['w']):
            for dy in range(it['h']):
                cells.add((e['x'] + dx, e['y'] + dy))
    return cells


def _find_free(cells, w, h):
    cands = [(x, y) for x in range(GRID_W - w + 1) for y in range(GRID_H - h + 1)]
    cx, cy = (GRID_W - w) / 2, (GRID_H - h) / 2
    cands.sort(key=lambda p: ((p[0] - cx) ** 2 + (p[1] - cy) ** 2, p[1], p[0]))
    for x, y in cands:
        if all((x + dx, y + dy) not in cells for dx in range(w) for dy in range(h)):
            return x, y
    return None


def _inv_map(user_id):
    return {r.item_id: int(r.qty) for r in UserFarmInventory.query.filter_by(user_id=user_id).all()}


def _add_inv(user_id, item_id, n=1):
    row = UserFarmInventory.query.filter_by(user_id=user_id, item_id=item_id).first()
    if row is None:
        db.session.add(UserFarmInventory(user_id=user_id, item_id=item_id, qty=n))
    else:
        row.qty = int(row.qty or 0) + n


def _ensure(user_id):
    """잠금 안에서 멱등 초기화: starter·해금 지급, 단어장 밭 자동 배치. 커밋은 호출부."""
    row = UserFarmLayout.query.filter_by(user_id=user_id).first()
    first = row is None
    inv = _inv_map(user_id)
    if first:
        row = UserFarmLayout(user_id=user_id, layout=[], version=0)
        db.session.add(row)
        for it in CATALOG:
            if it.get('starter_qty') and it['id'] not in inv:
                _add_inv(user_id, it['id'], int(it['starter_qty']))
                inv[it['id']] = int(it['starter_qty'])
    stats = _stats(user_id)
    for it in CATALOG:
        if (_placeable(it) and it['unlock'] and not it['price_gem'] and not it.get('starter_qty')
                and it['id'] not in inv and _unlocked(it, stats)):
            _add_inv(user_id, it['id'], 1)
            inv[it['id']] = 1

    layout = list(row.layout or [])
    changed = False
    books = _user_books(user_id)
    book_ids = {str(b.id) for b in books}
    kept = [e for e in layout if not (e['item_id'] == 'field' and e.get('book_id') not in book_ids)]
    if len(kept) != len(layout):
        layout, changed = kept, True
    have = {e.get('book_id') for e in layout if e['item_id'] == 'field'}
    cells = _occupied(layout)
    f = ITEMS['field']
    for b in books:
        if str(b.id) in have:
            continue
        pos = _find_free(cells, f['w'], f['h'])
        if pos is None:
            break
        layout.append({'uid': uuid4().hex[:12], 'item_id': 'field', 'x': pos[0], 'y': pos[1],
                       'flip': False, 'book_id': str(b.id)})
        cells |= _occupied([layout[-1]])
        changed = True
    if changed:
        row.layout = layout
        row.version = int(row.version or 0) + 1
    return row, books, stats


def _book_stages(user_id, books):
    rows = (db.session.query(UserVocaBookMap.user_voca_book_id, UserVocaGame.visual_stage, func.count())
            .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVocaBookMap.user_voca_id)
            .filter(UserVocaBookMap.user_voca_book_id.in_([b.id for b in books]))
            .group_by(UserVocaBookMap.user_voca_book_id, UserVocaGame.visual_stage).all()) if books else []
    out = {str(b.id): {k: 0 for k in STAGE_KEYS} for b in books}
    for bid, stage, n in rows:
        out[str(UUID(bytes=bid) if isinstance(bid, bytes) else bid)][_STAGE_OF.get(stage, 'seed')] += int(n)
    return out


def get_state(user_id):
    user = start_user_tx(user_id)
    if user is None:
        raise FarmError(404, '사용자를 찾을 수 없습니다.')
    row, books, stats = _ensure(user_id)
    db.session.commit()
    inv = _inv_map(user_id)
    inv['field'] = len(books)
    stages = _book_stages(user_id, books)
    return {
        'catalog': CATALOG,
        'grid': {'w': GRID_W, 'h': GRID_H},
        'inventory': inv,
        'layout': row.layout or [],
        'version': int(row.version or 0),
        'books': [{'id': str(b.id), 'name': b.name, 'crop_type': b.crop_type or DEFAULT_CROP,
                   'word_count': sum(stages[str(b.id)].values()), 'stages': stages[str(b.id)]}
                  for b in books],
        'gem': int(user.gem_cnt or 0),
        'stats': stats,
    }


def save_layout(user_id, layout, version):
    if not isinstance(layout, list) or not isinstance(version, int) or isinstance(version, bool):
        raise FarmError(400, '요청 형식이 올바르지 않습니다.')
    if len(layout) > MAX_LAYOUT:
        raise FarmError(400, '배치 항목이 너무 많습니다.')
    user = start_user_tx(user_id)
    if user is None:
        raise FarmError(404, '사용자를 찾을 수 없습니다.')
    row, books, _ = _ensure(user_id)
    if int(row.version or 0) != version:
        db.session.commit()
        raise FarmError(409, '다른 기기에서 농장이 바뀌었어요. 새로고침해 주세요.', {'version': int(row.version or 0)})

    inv = _inv_map(user_id)
    own_books = {str(b.id) for b in books}
    clean, cells, uids, counts, used_books = [], set(), set(), {}, set()
    for e in layout:
        if not isinstance(e, dict):
            raise FarmError(400, '배치 항목 형식이 올바르지 않습니다.')
        it = ITEMS.get(e.get('item_id'))
        uid, x, y = e.get('uid'), e.get('x'), e.get('y')
        if it is None or not _placeable(it):
            raise FarmError(400, '배치할 수 없는 아이템입니다.')
        if not isinstance(uid, str) or not uid or len(uid) > 40 or uid in uids:
            raise FarmError(400, '배치 uid 가 올바르지 않습니다.')
        if any(not isinstance(v, int) or isinstance(v, bool) for v in (x, y)):
            raise FarmError(400, '좌표가 올바르지 않습니다.')
        if x < 0 or y < 0 or x + it['w'] > GRID_W or y + it['h'] > GRID_H:
            raise FarmError(400, '격자 범위를 벗어났습니다.')
        spots = {(x + dx, y + dy) for dx in range(it['w']) for dy in range(it['h'])}
        if spots & cells:
            raise FarmError(400, '다른 아이템과 겹칩니다.')
        bid = e.get('book_id')
        if it['id'] == 'field':
            if bid not in own_books or bid in used_books:
                raise FarmError(400, '밭에 연결된 단어장이 올바르지 않습니다.')
            used_books.add(bid)
        elif bid is not None:
            raise FarmError(400, '밭이 아닌 아이템에는 book_id 를 쓸 수 없습니다.')
        else:
            counts[it['id']] = counts.get(it['id'], 0) + 1
            if counts[it['id']] > inv.get(it['id'], 0):
                raise FarmError(400, '보유 수량보다 많이 배치했습니다.')
        uids.add(uid)
        cells |= spots
        clean.append({'uid': uid, 'item_id': it['id'], 'x': x, 'y': y,
                      'flip': bool(e.get('flip', False)), 'book_id': bid})
    row.layout = clean
    row.version = version + 1
    db.session.commit()
    return {'layout': clean, 'version': row.version}


def buy(user_id, item_id):
    it = ITEMS.get(item_id)
    if it is None or not _placeable(it) or it['id'] == 'field':
        raise FarmError(400, '살 수 없는 아이템입니다.')
    if not it['price_gem']:
        raise FarmError(400, '상점에서 팔지 않는 아이템입니다.')
    user = start_user_tx(user_id)
    if user is None:
        raise FarmError(404, '사용자를 찾을 수 없습니다.')
    row, _, stats = _ensure(user_id)
    if not _unlocked(it, stats):
        db.session.rollback()
        raise FarmError(400, '아직 열리지 않은 아이템입니다.', {'reason': 'locked'})
    try:
        _, gem = change_gem(user_id, -int(it['price_gem']), GemReason.ITEM_PURCHASE,
                            f'농장 아이템 구매: {it["name"]}', source_type='farm_item', user=user)
    except InsufficientGem as e:
        db.session.rollback()
        raise FarmError(400, '보석이 부족합니다.', {'reason': 'gem_short', 'gem': e.balance, 'need': e.need})
    _add_inv(user_id, item_id, 1)
    db.session.commit()
    return {'item_id': item_id, 'qty': _inv_map(user_id).get(item_id, 0), 'gem': int(gem)}


def set_crop(user_id, book_id, crop_type):
    if crop_type not in CROP_IDS:
        raise FarmError(400, '알 수 없는 작물 종류입니다.')
    try:
        bid = UUID(str(book_id))
    except ValueError:
        raise FarmError(404, '단어장을 찾을 수 없습니다.')
    book = UserVocaBook.query.filter_by(id=bid, user_id=user_id).first()
    if book is None or book.book_kind != 'normal':
        raise FarmError(404, '단어장을 찾을 수 없습니다.')
    book.crop_type = crop_type
    db.session.commit()
    return {'id': str(book.id), 'crop_type': crop_type}
