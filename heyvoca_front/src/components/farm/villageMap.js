// 마을 지도 데이터 v10 — 밭 터는 단어장 수만큼만, 회관 중심으로 바깥을 향해 결정적으로 생성한다.
// 월드 좌표(x, z) 단위. 회관은 원점. 터 번호(slot)는 0부터 정수 인덱스이고, 인덱스가 곧 회관에서 가까운 순서다.

// 크기별 밭(월드 단위)과 작물 최대 개수·이랑 줄 수
export const SLOT_SIZES = {
  S: { w: 3.6, d: 2.8, max: 14, rows: 3 },
  M: { w: 5.4, d: 3.6, max: 28, rows: 4 },
  L: { w: 7.0, d: 4.4, max: 48, rows: 5 },
};
export const slotSizeFor = (wordCount) => (wordCount <= 40 ? 'S' : wordCount <= 150 ? 'M' : 'L');

export const CELL_W = 9.2; // 블록(칸) 한 변 — 길 중심선 간격
export const CELL_D = 6.8;
export const HALL_SIZE = 5.2;
export const ROAD_W = 1.0;
export const MAX_SLOTS = 300;

const hash2 = (a, b) => {
  let h = (Math.imul(a + 1013, 374761393) ^ Math.imul(b + 7919, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};
const rngOf = (seed) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// 슬롯 번호(문자열 "p3" 등)가 오면 숫자 부분 - 1 로 폴백
export const slotIndexOf = (slot) => {
  if (slot == null || slot === '') return null;
  if (typeof slot === 'number' && Number.isInteger(slot) && slot >= 0) return slot;
  const m = String(slot).match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return /^\d+$/.test(String(slot)) ? n : Math.max(0, n - 1);
};

/** sizes: 터 인덱스 -> 'S'|'M'|'L' (빈 인덱스는 undefined). 반환: 터 목록·길·나무·경계·닭 길 그래프 */
export const planVillage = (sizes) => {
  const n = Math.min(sizes.length, MAX_SLOTS * 2);
  // 후보 칸 — 회관(0,0) 제외, 월드 거리순(같으면 각도순)
  const R = Math.ceil(Math.sqrt(n + 1)) + 2;
  const cand = [];
  for (let j = -R; j <= R; j += 1) {
    for (let i = -R; i <= R; i += 1) {
      if (i === 0 && j === 0) continue;
      const dist = Math.hypot(i * CELL_W, j * CELL_D);
      let ang = Math.atan2(i, -j); if (ang < 0) ang += Math.PI * 2;
      cand.push({ i, j, dist, ang });
    }
  }
  cand.sort((a, b) => (Math.abs(a.dist - b.dist) > 0.01 ? a.dist - b.dist : a.ang - b.ang));
  const cells = cand.slice(0, n);
  const occ = new Set(['0,0']);
  cells.forEach((c) => occ.add(`${c.i},${c.j}`));
  const slots = [];
  cells.forEach((c, idx) => {
    if (!sizes[idx]) return;
    slots.push({ idx, size: sizes[idx], cx: c.i * CELL_W, cz: c.j * CELL_D, ci: c.i, cj: c.j });
  });

  // 길 — 칸 둘레 변(중복 제거). 회관 칸 둘레도 포함
  const edges = new Map();
  const addEdge = (x0, z0, x1, z1) => {
    const k = `${Math.min(x0, x1)},${Math.min(z0, z1)},${Math.max(x0, x1)},${Math.max(z0, z1)}`;
    if (!edges.has(k)) edges.set(k, [x0, z0, x1, z1]);
  };
  const hw = CELL_W / 2; const hd = CELL_D / 2;
  let minI = 0; let maxI = 0; let minJ = 0; let maxJ = 0;
  occ.forEach((k) => {
    const [i, j] = k.split(',').map(Number);
    minI = Math.min(minI, i); maxI = Math.max(maxI, i); minJ = Math.min(minJ, j); maxJ = Math.max(maxJ, j);
    const x = i * CELL_W; const z = j * CELL_D;
    addEdge(x - hw, z - hd, x + hw, z - hd);
    addEdge(x - hw, z + hd, x + hw, z + hd);
    addEdge(x - hw, z - hd, x - hw, z + hd);
    addEdge(x + hw, z - hd, x + hw, z + hd);
  });
  const edgeList = [...edges.values()];

  // 닭이 걷는 길 그래프(교차점 → 이웃)
  const adj = new Map();
  const nk = (x, z) => `${x},${z}`;
  edgeList.forEach(([x0, z0, x1, z1]) => {
    const a = nk(x0, z0); const b = nk(x1, z1);
    if (!adj.has(a)) adj.set(a, { x: x0, z: z0, to: [] });
    if (!adj.has(b)) adj.set(b, { x: x1, z: z1, to: [] });
    adj.get(a).to.push(b); adj.get(b).to.push(a);
  });

  // 나무 — 밭 영역 바깥 테두리(점유 칸에 이웃한 빈 칸)에 무리로
  const trees = [];
  const seen = new Set();
  occ.forEach((k) => {
    const [i, j] = k.split(',').map(Number);
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        const ni = i + di; const nj = j + dj; const key = `${ni},${nj}`;
        if (occ.has(key) || seen.has(key)) continue;
        seen.add(key);
        const r = rngOf(hash2(ni, nj));
        const cnt = 2 + Math.floor(r() * 3);
        for (let t = 0; t < cnt; t += 1) {
          trees.push({
            x: ni * CELL_W + (r() - 0.5) * (CELL_W - 2.4),
            z: nj * CELL_D + (r() - 0.5) * (CELL_D - 2.4),
            h: 2.4 + r() * 1.2,
          });
        }
      }
    }
  });

  const bounds = {
    minX: (minI - 0.5) * CELL_W, maxX: (maxI + 0.5) * CELL_W,
    minZ: (minJ - 0.5) * CELL_D, maxZ: (maxJ + 0.5) * CELL_D,
  };
  return { slots, edges: edgeList, adj, trees, bounds, hall: { x: 0, z: 0.5, size: HALL_SIZE } };
};
