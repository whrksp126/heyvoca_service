// 마을 지도 데이터 — 지면 좌표계(가로 0~1, 세로 0~1.5). 백엔드 farm_catalog.json 의 village_slots(id·size·order)와 같은 값.
// 월드 변환: 지면 한 변 1 = 월드 24 (village_ground.png 는 24×36).
export const MAP_W = 1;
export const MAP_H = 1.5;
export const WORLD = 24;
export const toWorld = (x, y) => ({ x: (x - 0.5) * WORLD, z: (y - 0.75) * WORLD });
export const fromWorld = (x, z) => ({ x: x / WORLD + 0.5, y: z / WORLD + 0.75 });

// 크기별 터(월드 단위)와 작물 최대 개수
export const SLOT_SIZES = {
  S: { w: 3.4, d: 2.6, max: 12 },
  M: { w: 5.1, d: 3.4, max: 24 },
  L: { w: 6.8, d: 4.3, max: 40 },
};

export const HALL = { ...fromWorld(0, -0.3), size: 6.4 };

const mk = (order, size, wx, wz) => ({ id: `p${order}`, order, size, rot: 0, ...fromWorld(wx, wz) });
// order = 열리는 순서(번호 순). 길가를 따라 회관 둘레에 배치
export const VILLAGE_SLOTS = [
  mk(1, 'M', -6.2, -3.3),
  mk(2, 'S', -6.6, -8.3),
  mk(3, 'S', 6.6, -8.3),
  mk(4, 'L', 0, -8.6),
  mk(5, 'M', 6.2, -3.3),
  mk(6, 'S', -7, 2.2),
  mk(7, 'M', 6.4, 2.2),
  mk(8, 'L', -5, 6.5),
  mk(9, 'S', 1.4, 5.2),
  mk(10, 'M', 6.4, 6.6),
  mk(11, 'S', -6.5, 10.3),
  mk(12, 'L', 2.5, 10.4),
];

export const slotSizeFor = (wordCount) => (wordCount <= 40 ? 'S' : wordCount <= 150 ? 'M' : 'L');

// 흙길 — 월드 좌표 폴리라인(고리 + 갈래), 폭은 월드 단위
const ring = [];
for (let i = 0; i <= 32; i += 1) {
  const a = (i / 32) * Math.PI * 2;
  ring.push([Math.cos(a) * 4.4, Math.sin(a) * 3.8]);
}
export const ROADS = [
  { width: 1.1, points: ring },
  { width: 0.9, points: [[0, -3.8], [0, -6.1]] },
  { width: 0.9, points: [[-4.4, 0], [-9.2, 0.4]] },
  { width: 0.9, points: [[4.4, 0], [9.2, 0.4]] },
  { width: 0.9, points: [[0, 3.8], [0, 5], [0.6, 8], [0.6, 12]] },
];

// 장식 나무 — 강가·절벽 아래·숲 앞에 무리로(고정 시드)
const rng = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
const slotRects = VILLAGE_SLOTS.map((p) => {
  const w = toWorld(p.x, p.y); const z = SLOT_SIZES[p.size];
  return { x: w.x, z: w.z, hw: z.w / 2 + 0.8, hd: z.d / 2 + 0.8 };
});
const nearSlot = (x, z) => slotRects.some((r) => Math.abs(x - r.x) < r.hw && Math.abs(z - r.z) < r.hd);
export const TREES = (() => {
  const r = rng(97);
  const out = [];
  const put = (n, xs, zs, hs) => {
    let tries = 0;
    while (n > 0 && tries < 400) {
      tries += 1;
      const x = xs[0] + r() * (xs[1] - xs[0]); const z = zs[0] + r() * (zs[1] - zs[0]);
      if (nearSlot(x, z) || Math.hypot(x, z) < 7) continue;
      out.push({ x, z, h: hs[0] + r() * (hs[1] - hs[0]) });
      n -= 1;
    }
  };
  put(8, [-9, 9], [-11.4, -10], [2.2, 3]); // 강가
  put(9, [-10, -8.6], [-9, 9], [2.4, 3.2]); // 왼쪽 절벽 아래
  put(9, [8.6, 10], [-9, 9], [2.4, 3.2]); // 오른쪽
  put(16, [-10, 10], [11.6, 12.6], [2.6, 3.6]); // 숲 앞
  return out;
})();
