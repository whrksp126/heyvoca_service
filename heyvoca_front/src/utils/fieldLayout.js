/**
 * 단어장 밭의 작물 배치 — 모든 화면(홈 지도 · 단어장 목록 · 단어장 상세)이 쓰는 단 하나의 함수.
 *
 * 【규칙】
 *  1. 밭은 **고정 12×12 격자**(팻말 4칸 제외 140칸)다. 단어 수로 격자를 다시 나누지 않는다 —
 *     격자가 바뀌면 기존 작물이 전부 옮겨 가기 때문이다. 화면 크기는 CSS 폭(%)만 바꾼다.
 *  2. 칸에는 **채우는 순서**(SLOT_ORDER)가 있다. 가장 먼 점부터 고르는 방식(blue-noise)으로
 *     미리 한 번 계산해, 앞쪽 n 칸만 써도 밭 전체에 고르게 퍼진다(몇 개든 한쪽으로 안 쏠린다).
 *  3. 단어는 **심은 순서**(createdAt → id 오름차순)로 빈 칸 중 가장 앞 칸을 받는다.
 *  4. **한 번 받은 칸은 고정**한다. 단어장 키(fieldKey)별로 {단어id: 칸}을 메모리·localStorage 에
 *     기억해, 단어가 추가·삭제·썩음·학습 시작으로 목록이 달라져도 기존 작물은 그 자리 그대로다.
 *     (목록에서 잠시 빠진 단어의 칸은 비어 있는 것으로 보고 새 단어가 쓸 수 있다. 쓰기 전까지는
 *      돌아오면 옛 자리를 되찾는다.)
 *  5. 성장 단계·건강이 바뀌어도 칸은 그대로 — 그림만 바뀐다.
 *  6. 그림 크기는 작물 수 구간(SIZE_TIERS)으로만 바뀐다. 자리(좌표)는 구간이 바뀌어도 그대로다.
 *
 * 서버에는 칸 정보가 없어(farm_v2 에도 slot 개념 없음) 기기별 기억 + 결정적 규칙으로 처리한다.
 * 같은 기기의 모든 화면은 같은 기억을 보므로 항상 같은 배치다.
 */
import { healthToVariant, stageToCrop } from './crop';
import {
  cells, SIGN_UV, ISL_X0, ISL_Y0, ISL_H, CROP_BOX, Y_WEIGHT, FIELD_W, FIELD_H,
} from './farmField';

const G = 12;
// 바깥 칸 중심이 심는 영역 경계에 닿는 정도 — 팻말 자리(SIGN_ANCHORS, 기본 심는 영역)와 겹치도록 맞춘다
const REACH = 0.9 * (G - 1) / G;
export const FIELD_DISPLAY_CAP = 96;
const SIZE_TIERS = [[12, 1.0], [24, 0.85], [40, 0.7], [64, 0.58], [Infinity, 0.5]];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const SIGN_CELLS = SIGN_UV.map(([u, v]) => [
  clamp(Math.round(u * G - 0.5), 0, G - 1),
  clamp(Math.round(v * G - 0.5), 0, G - 1),
]);

const cellHash = (i, j) => {
  const h = Math.imul(i + 1, 73856093) ^ Math.imul(j + 1, 19349663);
  return ((h >>> 0) % 100000) / 100000;
};

/* 칸 목록 + 채우는 순서 — 모듈 로드 때 한 번 계산(결정적) */
const POOL = cells(G, REACH).filter(
  (c) => !SIGN_CELLS.some(([si, sj]) => si === c.i && sj === c.j),
);

const SLOT_ORDER = (() => {
  const left = POOL.slice();
  // 경계 근처는 작물이 흙 밖으로 나가 보이므로 경계 거리도 간격처럼 취급한다
  const edge = (c) => Math.min(c.i + 0.5, G - c.i - 0.5, c.j + 0.5, G - c.j - 0.5);
  const EDGE_K = 62; // 칸 반 개(≈) → 캔버스 px
  const d = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * Y_WEIGHT);
  const out = [];
  // 시작점: 밭 중앙에 가장 가까운 칸(해시로 동률 해소)
  left.sort((a, b) => (Math.abs(a.i - 5.5) + Math.abs(a.j - 5.5)) - (Math.abs(b.i - 5.5) + Math.abs(b.j - 5.5))
    || cellHash(a.i, a.j) - cellHash(b.i, b.j));
  out.push(left.shift());
  while (left.length) {
    let best = -1;
    let bestScore = -1;
    left.forEach((c, idx) => {
      let m = Infinity;
      out.forEach((p) => { m = Math.min(m, d(c, p)); });
      const score = Math.min(m, edge(c) * EDGE_K * 2) + cellHash(c.i, c.j) * 6;
      if (score > bestScore) { bestScore = score; best = idx; }
    });
    out.push(left.splice(best, 1)[0]);
  }
  return out;
})();

/* ── 칸 기억 ── */
const STORE_KEY = 'hv_field_slots_v1';
let memory = null;
const load = () => {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
  } catch { memory = {}; }
  return memory;
};
const save = () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(memory)); } catch { /* 저장 불가 — 메모리만 */ }
};
/** 로그아웃 등에서 기억을 비운다 */
export const resetFieldSlots = () => { memory = {}; save(); };

const byPlantOrder = (a, b) => {
  const ta = a.at ? new Date(a.at).getTime() : 0;
  const tb = b.at ? new Date(b.at).getTime() : 0;
  if (ta !== tb) return ta - tb;
  const na = Number(a.id);
  const nb = Number(b.id);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
};

const sizeScale = (n) => SIZE_TIERS.find(([max]) => n <= max)[1];

/**
 * @param {Array<{id, stage, health, at?}>} words 밭에 심길 단어(미학습 제외는 호출부)
 * @param {{ fieldKey?: string|number }} opts 단어장 키 — 있으면 칸을 기억해 고정한다
 */
export const plantBookField = (words, { fieldKey = null } = {}) => {
  const list = (words || []).filter((w) => w && w.id != null).sort(byPlantOrder);
  const cap = Math.min(FIELD_DISPLAY_CAP, SLOT_ORDER.length);
  const store = load();
  const k = fieldKey != null ? String(fieldKey) : null;
  const pins = k ? (store[k] = store[k] || {}) : {};
  const ids = new Set(list.map((w) => String(w.id)));

  const used = new Map(); // 칸 → 단어 id
  let dirty = false;
  // 1) 현재 목록에 있는 단어의 기억된 칸을 먼저 확정
  list.forEach((w) => {
    const id = String(w.id);
    const s = pins[id];
    if (s != null && s < cap && !used.has(s)) used.set(s, id);
  });
  // 2) 새 단어는 심은 순서대로 가장 앞의 빈 칸
  let cursor = 0;
  const slotOf = {};
  list.forEach((w) => {
    const id = String(w.id);
    if (used.get(pins[id]) === id) { slotOf[id] = pins[id]; return; }
    while (cursor < cap && used.has(cursor)) cursor += 1;
    if (cursor >= cap) return; // 밭이 가득 — 표시 상한을 넘은 단어
    used.set(cursor, id);
    slotOf[id] = cursor;
    if (pins[id] !== cursor) { pins[id] = cursor; dirty = true; }
  });
  // 3) 빠진 단어의 기억이 새로 쓰인 칸과 겹치면 지운다
  if (k) {
    Object.keys(pins).forEach((id) => {
      if (!ids.has(id) && used.has(pins[id])) { delete pins[id]; dirty = true; }
    });
    if (dirty) save();
  }

  const placed = list.filter((w) => slotOf[String(w.id)] != null);
  const scale = sizeScale(placed.length);
  const items = placed.map((w) => {
    const cell = SLOT_ORDER[slotOf[String(w.id)]];
    const box = CROP_BOX * (0.8 + 0.34 * cell.y / ISL_H) * scale;
    const x = ISL_X0 + cell.x;
    const y = ISL_Y0 + cell.y;
    return {
      key: `w-${w.id}`,
      kind: 'crop',
      stage: stageToCrop(w.stage),
      variant: healthToVariant(w.health),
      y,
      leftPct: x / FIELD_W * 100,
      topPct: y / FIELD_H * 100,
      boxPct: box / FIELD_W * 100,
    };
  });
  items.sort((a, b) => a.y - b.y);
  return { items, grid: G, planted: items.length };
};
