"""실험실 '내 농장 꾸미기' 서비스. 계약: docs/FARM_LAB_CONTRACT.md

라우트(app/routes/farm_lab.py)는 HTTP 만 맡고 판단은 여기서 한다.
실패는 FarmError(code, message, extra)로 알린다.
"""
import json
import math
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
VILLAGE_SLOTS = _RAW['village_slots']
SLOT_BY_ID = {v['id']: v for v in VILLAGE_SLOTS}
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


def _even_up(n):
    return n + (n % 2)


def field_dims(n):
    """단어 수 n -> 밭 칸 수(cols, rows)와 타일 발판(fw, fh). 계약서 v3: 칸=타일 1개."""
    n = max(0, int(n))
    cols = min(16, max(4, _even_up(math.ceil(math.sqrt(n)))))
    rows = max(4, _even_up(math.ceil(n / cols)))
    return cols, rows, cols, rows


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


ROTS = (0, 90, 180, 270)


def _rot(e):
    """항목의 회전각. rot 없으면 기존 flip=true 를 90 으로 읽는다."""
    r = e.get('rot')
    if r in ROTS and not isinstance(r, bool):
        return r
    return 90 if e.get('flip') else 0


def _swap(w, h, rot):
    return (h, w) if rot in (90, 270) else (w, h)


def _size(e, fp):
    """배치 항목의 회전 반영 발판(w, h). 밭은 단어장별 발판, 나머지는 카탈로그."""
    w, h = None, None
    if e['item_id'] == 'field':
        d = fp.get(e.get('book_id'))
        if d:
            w, h = d
    if w is None:
        it = ITEMS[e['item_id']]
        w, h = it['w'], it['h']
    return _swap(w, h, _rot(e))


def _spots(x, y, w, h):
    return {(x + dx, y + dy) for dx in range(w) for dy in range(h)}


def _occupied(layout, fp):
    cells = set()
    for e in layout:
        w, h = _size(e, fp)
        cells |= _spots(e['x'], e['y'], w, h)
    return cells


def _find_free(cells, w, h):
    """위에서부터, 격자 안에서 처음 비는 자리. 다른 물체와 1칸 띄운다(계약서 v3)."""
    for y in range(GRID_H - h + 1):
        for x in range(GRID_W - w + 1):
            if all((x + dx, y + dy) not in cells for dx in range(-1, w + 1) for dy in range(-1, h + 1)):
                return x, y
    return None


def _find_near(cells, w, h, cx, cy):
    """집 중심(cx, cy)에 가장 가까운, 1칸 띄운 빈자리."""
    best = None
    for y in range(GRID_H - h + 1):
        for x in range(GRID_W - w + 1):
            if all((x + dx, y + dy) not in cells for dx in range(-1, w + 1) for dy in range(-1, h + 1)):
                d = (x + w / 2 - cx) ** 2 + (y + h / 2 - cy) ** 2
                if best is None or d < best[0]:
                    best = (d, x, y)
    return (best[1], best[2]) if best else None


def cells_needed(word_count):
    return max(4, math.ceil(max(0, int(word_count)) / 4))


def open_slot_count(book_count):
    return min(len(VILLAGE_SLOTS), max(3, int(book_count) + 1))


def _open_slot_ids(book_count):
    k = open_slot_count(book_count)
    return {v['id'] for v in VILLAGE_SLOTS if v['order'] <= k}


def _slot_size(word_count):
    return 'S' if word_count <= 40 else ('M' if word_count <= 150 else 'L')


def _pick_slot(free_ids, word_count):
    """크기 맞는 빈 열린 터(order 순), 없으면 아무 빈 열린 터(order 순)."""
    cand = [SLOT_BY_ID[i] for i in free_ids]
    cand.sort(key=lambda v: v['order'])
    want = _slot_size(word_count)
    for v in cand:
        if v['size'] == want:
            return v['id']
    return cand[0]['id'] if cand else None


def _rect_cells(n):
    """n 칸짜리 가장 정사각형에 가까운 직사각형(마지막 줄만 덜 참) 상대 좌표."""
    w = math.ceil(math.sqrt(n))
    return [[i % w, i // w] for i in range(n)]


def _connected(cs):
    cs = {tuple(c) for c in cs}
    if not cs:
        return False
    start = next(iter(cs))
    seen, stack = {start}, [start]
    while stack:
        x, y = stack.pop()
        for nb in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if nb in cs and nb not in seen:
                seen.add(nb)
                stack.append(nb)
    return len(seen) == len(cs)


def _shape_ok(cs, n):
    """cells 형식·칸 수(==n)·중복 없음·4방향 연결 검사."""
    if not isinstance(cs, list) or len(cs) != n:
        return False
    pts = set()
    for c in cs:
        if (not isinstance(c, (list, tuple)) or len(c) != 2
                or any(not isinstance(v, int) or isinstance(v, bool) or abs(v) > 200 for v in c)):
            return False
        pts.add((c[0], c[1]))
    return len(pts) == n and _connected(pts)


def _abs_cells(x, y, cs):
    return {(x + c[0], y + c[1]) for c in cs}


def _cells_in_grid(cells):
    return all(0 <= cx < GRID_W and 0 <= cy < GRID_H for cx, cy in cells)


def _find_spot(taken, cs, cx, cy):
    """cs 모양을 겹치지 않게 둘 수 있는 (x, y) 중 격자 중앙에 가장 가까운 곳."""
    best = None
    for y in range(GRID_H):
        for x in range(GRID_W):
            ab = _abs_cells(x, y, cs)
            if not _cells_in_grid(ab) or ab & taken:
                continue
            d = (x - cx) ** 2 + (y - cy) ** 2
            if best is None or d < best[0]:
                best = (d, x, y)
    return (best[1], best[2]) if best else None


def _in_range(x, y, w, h):
    return (isinstance(x, int) and isinstance(y, int)
            and x >= 0 and y >= 0 and x + w <= GRID_W and y + h <= GRID_H)


def _book_cells(books):
    """book_id -> 단어장 내 순서(map.id)의 단어별 단계 문자열 리스트."""
    out = {str(b.id): [] for b in books}
    if not books:
        return out
    rows = (db.session.query(UserVocaBookMap.user_voca_book_id, UserVocaGame.visual_stage)
            .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVocaBookMap.user_voca_id)
            .filter(UserVocaBookMap.user_voca_book_id.in_([b.id for b in books]))
            .order_by(UserVocaBookMap.id.asc()).all())
    for bid, stage in rows:
        out[str(UUID(bytes=bid) if isinstance(bid, bytes) else bid)].append(_STAGE_OF.get(stage, 'seed'))
    return out


def _footprints(book_cells):
    return {bid: field_dims(len(c))[2:] for bid, c in book_cells.items()}


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
    bcells = _book_cells(books)
    layout = [e for e in layout if not (e['item_id'] == 'field' and e.get('book_id') not in book_ids)]
    # v9: 밭 = 정해진 터(slot). 밭이 아닌 항목은 layout 에서 제거(인벤토리 유지). 멱등
    old = list(row.layout or [])
    open_ids = _open_slot_ids(len(books))
    used, new_layout, seen, pending = set(), [], set(), []
    for e in layout:
        if e['item_id'] != 'field' or e.get('book_id') in seen:
            continue
        seen.add(e['book_id'])
        sl = e.get('slot')
        ne = {'uid': e['uid'], 'item_id': 'field', 'book_id': e['book_id'], 'slot': sl}
        if isinstance(sl, str) and sl in open_ids and sl not in used:
            used.add(sl)
            new_layout.append(ne)
        else:
            pending.append(ne)
    for b in books:
        if str(b.id) not in seen:
            pending.append({'uid': uuid4().hex[:12], 'item_id': 'field', 'book_id': str(b.id), 'slot': None})
    for ne in pending:
        sid = _pick_slot(open_ids - used, len(bcells[ne['book_id']]))
        if sid is None:
            continue
        ne['slot'] = sid
        used.add(sid)
        new_layout.append(ne)
    order = {e['uid']: n for n, e in enumerate(old)}
    new_layout.sort(key=lambda e: order.get(e['uid'], 10 ** 9))
    if new_layout != old:
        layout, changed = new_layout, True
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
    bcells = _book_cells(books)

    def _book(b):
        c = bcells[str(b.id)]
        cols, rows, fw, fh = field_dims(len(c))
        return {'id': str(b.id), 'name': b.name, 'crop_type': b.crop_type or DEFAULT_CROP,
                'word_count': sum(stages[str(b.id)].values()), 'stages': stages[str(b.id)],
                'cols': cols, 'rows': rows, 'fw': fw, 'fh': fh, 'cells': c,
                'cells_needed': cells_needed(len(c))}
    return {
        'catalog': CATALOG,
        'grid': {'w': GRID_W, 'h': GRID_H},
        'village_slots': VILLAGE_SLOTS,
        'open_slot_count': open_slot_count(len(books)),
        'inventory': inv,
        'layout': row.layout or [],
        'version': int(row.version or 0),
        'books': [_book(b) for b in books],
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

    wc = {k: len(v) for k, v in _book_cells(books).items()}
    inv = _inv_map(user_id)
    own_books = {str(b.id) for b in books}
    open_ids = _open_slot_ids(len(books))
    used_slots = set()
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
        bid = e.get('book_id')
        if it['id'] == 'field':
            sl = e.get('slot')
            if bid not in own_books or bid in used_books:
                raise FarmError(400, '밭에 연결된 단어장이 올바르지 않습니다.')
            if not isinstance(sl, str) or sl not in SLOT_BY_ID:
                raise FarmError(400, '밭 터가 올바르지 않습니다.')
            if sl not in open_ids:
                raise FarmError(400, '아직 열리지 않은 터입니다.', {'reason': 'slot_locked'})
            if sl in used_slots:
                raise FarmError(400, '이미 다른 밭이 쓰는 터입니다.')
            used_books.add(bid)
            used_slots.add(sl)
            uids.add(uid)
            clean.append({'uid': uid, 'item_id': 'field', 'book_id': bid, 'slot': sl})
            continue
        if any(not isinstance(v, int) or isinstance(v, bool) for v in (x, y)):
            raise FarmError(400, '좌표가 올바르지 않습니다.')
        rot = e.get('rot')
        if rot is None:
            rot = 90 if e.get('flip') else 0
        if rot not in ROTS or isinstance(rot, bool):
            raise FarmError(400, '회전값이 올바르지 않습니다.')
        fcells = None
        if it['id'] == 'field':
            if bid not in own_books or bid in used_books:
                raise FarmError(400, '밭에 연결된 단어장이 올바르지 않습니다.')
            n = cells_needed(wc[bid])
            fcells = e.get('cells')
            if not isinstance(fcells, list) or len(fcells) != n:
                raise FarmError(400, f'밭 칸 수가 맞지 않습니다. {n}칸이어야 해요.', {'cells_needed': n})
            if not _shape_ok(fcells, n):
                raise FarmError(400, '밭 칸이 모두 이어져야 해요.')
            fcells = [[c[0], c[1]] for c in fcells]
            spots = _abs_cells(x, y, fcells)
            if not _cells_in_grid(spots):
                raise FarmError(400, '격자 범위를 벗어났습니다.')
        else:
            w, h = _swap(it['w'], it['h'], rot)
            if x < 0 or y < 0 or x + w > GRID_W or y + h > GRID_H:
                raise FarmError(400, '격자 범위를 벗어났습니다.')
            spots = _spots(x, y, w, h)
        if spots & cells:
            raise FarmError(400, '다른 아이템과 겹칩니다.')
        if it['id'] == 'field':
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
                      'flip': rot in (90, 270), 'rot': rot, 'book_id': bid,
                      **({'cells': fcells} if fcells is not None else {})})
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
