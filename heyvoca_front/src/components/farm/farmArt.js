// 농장 2.5D 자산 — manifest.json 의 src 가 있으면 PNG, 없으면 Pixi Graphics 도형 폴백.
// 나중에 AI 스프라이트 PNG 를 assets/farm2/ 에 넣고 manifest 의 src 만 채우면 코드 수정 없이 교체된다.
import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import manifest from '../../assets/farm2/manifest.json';

export const TILE_W = manifest.tile?.w || 64;
export const TILE_H = manifest.tile?.h || 32;
export const GRID = 24;

/** 격자 좌표(타일 윗꼭짓점) → 월드 좌표 */
export const toScreen = (gx, gy) => ({ x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) });
/** 월드 좌표 → 격자 실수 좌표 */
export const fromScreen = (sx, sy) => ({
  gx: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
  gy: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
});

// 헤이보카 색감 — 따뜻한 흙 · 연두
export const COLORS = {
  grass: 0xaad97f, grassDark: 0x94c76a, grassLight: 0xcdeeb2,
  soil: 0xc69465, soilDark: 0x845a34, soilMid: 0xa8764a,
  wood: 0x9a6b3f, woodLight: 0xc08d5a, leaf: 0x6fba5a, leafDark: 0x4f9a46, leafLight: 0xa6dd7d,
  stone: 0xb9b4aa, stoneDark: 0x8f8a80, water: 0x7cc7e8, waterLight: 0xb4e3f5,
  red: 0xe0533d, cream: 0xfff4dc, ink: 0x3a2e22,
};

export const CROP_COLORS = {
  carrot: 0xf28c38, corn: 0xf2c94c, rice: 0xc9d77a, cucumber: 0x4caf50,
  tomato: 0xe0533d, pumpkin: 0xf29b38, radish: 0xf3d4e4, strawberry: 0xe8506a,
};

const shade = (c, f) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

// ── 텍스처 로딩 ────────────────────────────────────────────────
const urlLoaders = import.meta.glob(
  ['../../assets/farm2/*.png', '../../assets/images/farm/**/*.png'],
  { query: '?url', import: 'default' },
);
const resolveKey = (src) => (src.startsWith('images/') ? `../../assets/${src}` : `../../assets/farm2/${src}`);

/** manifest 가 가리키는 PNG 를 모두 미리 불러온다(없거나 실패한 src 는 도형 폴백). */
export const loadArt = async () => {
  const srcs = new Set();
  Object.values(manifest.items || {}).forEach((it) => { if (it.src) srcs.add(it.src); });
  Object.values(manifest.crops || {}).forEach((c) => (c.stages || []).forEach((s) => s && srcs.add(s)));
  const textures = {};
  const urls = [];
  await Promise.all([...srcs].map(async (src) => {
    try {
      const loader = urlLoaders[resolveKey(src)];
      if (!loader) return;
      const url = await loader();
      textures[src] = await Assets.load(url);
      urls.push(url);
    } catch (e) { /* 도형 폴백 */ }
  }));
  return { manifest, textures, urls };
};

export const destroyArt = (art) => {
  // Assets 캐시에서 내려 메모리를 돌려준다(캐시에 죽은 텍스처가 남지 않게 destroy 직접 호출은 하지 않는다)
  (art?.urls || []).forEach((u) => { try { Assets.unload(u); } catch (e) { /* noop */ } });
};

// ── 도형 헬퍼 (원점 = 발 아래 바닥점, 위쪽이 -y) ─────────────────
const shadow = (g, rx = 18, ry = 8, alpha = 0.18) => { g.ellipse(0, 2, rx, ry).fill({ color: 0x3a2e22, alpha }); };

const isoBox = (g, cx, baseY, hw, height, top, left, right) => {
  const hd = hw / 2;
  const L = [cx - hw, baseY], R = [cx + hw, baseY], B = [cx, baseY + hd], K = [cx, baseY - hd];
  const up = (p) => [p[0], p[1] - height];
  g.poly([...L, ...B, ...up(B), ...up(L)]).fill(left);
  g.poly([...B, ...R, ...up(R), ...up(B)]).fill(right);
  g.poly([...up(L), ...up(K), ...up(R), ...up(B)]).fill(top);
};

const diamond = (g, cx, cy, hw, hh, color, alpha = 1) => {
  g.poly([cx, cy - hh, cx + hw, cy, cx, cy + hh, cx - hw, cy]).fill({ color, alpha });
};

const blob = (g, x, y, r, color, hi = true) => {
  g.circle(x, y, r).fill(color);
  if (hi) g.circle(x - r * 0.3, y - r * 0.35, r * 0.5).fill({ color: 0xffffff, alpha: 0.22 });
};

const drawers = {
  tree_round: (g) => {
    shadow(g, 20, 9);
    isoBox(g, 0, 2, 5, 16, COLORS.woodLight, COLORS.wood, shade(COLORS.wood, 0.8));
    blob(g, -9, -26, 13, COLORS.leafDark, false); blob(g, 9, -27, 13, COLORS.leafDark, false);
    blob(g, 0, -36, 16, COLORS.leaf);
  },
  tree_pine: (g) => {
    shadow(g, 18, 8);
    isoBox(g, 0, 2, 4, 12, COLORS.woodLight, COLORS.wood, shade(COLORS.wood, 0.8));
    [[-8, 22, 20], [-22, 18, 17], [-34, 13, 14]].forEach(([y, hw, h], i) => {
      g.poly([-hw, y, 0, y - h - 4, hw, y]).fill(i % 2 ? COLORS.leaf : COLORS.leafDark);
      g.poly([0, y - h - 4, hw, y, 2, y]).fill({ color: 0x000000, alpha: 0.1 });
    });
  },
  tree_apple: (g) => {
    drawers.tree_round(g);
    [[-12, -28], [6, -38], [12, -24], [-3, -26]].forEach(([x, y]) => blob(g, x, y, 3, COLORS.red));
  },
  fence_wood: (g, w, h, c = { post: COLORS.woodLight, rail: COLORS.wood }) => {
    shadow(g, 26, 7, 0.12);
    const A = [-24, -12], B = [24, 12];
    [8, 15].forEach((hh) => g.moveTo(A[0], A[1] - hh).lineTo(B[0], B[1] - hh).stroke({ width: 3, color: c.rail }));
    [A, B, [0, 0]].forEach(([x, y]) => isoBox(g, x, y, 3, 20, c.post, shade(c.post, 0.8), shade(c.post, 0.65)));
  },
  fence_stone: (g) => {
    shadow(g, 26, 7, 0.12);
    const A = [-24, -12], B = [24, 12];
    g.poly([A[0], A[1], B[0], B[1], B[0], B[1] - 12, A[0], A[1] - 12]).fill(COLORS.stone);
    g.poly([A[0], A[1] - 12, B[0], B[1] - 12, B[0], B[1] - 14, A[0], A[1] - 14]).fill(COLORS.cream);
    for (let i = 0; i < 4; i += 1) g.moveTo(A[0] + 12 * i + 6, A[1] + 6 * i + 3).lineTo(A[0] + 12 * i + 6, A[1] + 6 * i - 9).stroke({ width: 1, color: COLORS.stoneDark, alpha: 0.6 });
  },
  scarecrow: (g) => {
    shadow(g, 14, 6);
    g.rect(-2, -34, 4, 36).fill(COLORS.wood);
    g.rect(-16, -26, 32, 4).fill(COLORS.woodLight);
    g.poly([-8, -22, 8, -22, 6, -8, -6, -8]).fill(0xe8a33d);
    blob(g, 0, -40, 7, 0xf3d9a0);
    g.poly([-10, -44, 10, -44, 5, -56, -5, -56]).fill(COLORS.soilDark);
    g.circle(-2.5, -41, 1).fill(COLORS.ink); g.circle(2.5, -41, 1).fill(COLORS.ink);
  },
  mailbox: (g) => {
    shadow(g, 12, 5);
    g.rect(-2, -22, 4, 24).fill(COLORS.wood);
    g.roundRect(-9, -36, 18, 14, 5).fill(COLORS.red);
    g.rect(-3, -43, 2, 10).fill(COLORS.cream);
  },
  bench: (g) => {
    shadow(g, 22, 7);
    isoBox(g, 0, 0, 16, 8, COLORS.woodLight, COLORS.wood, shade(COLORS.wood, 0.8));
    isoBox(g, 0, -8, 16, 8, COLORS.woodLight, COLORS.wood, shade(COLORS.wood, 0.8));
  },
  well: (g) => {
    shadow(g, 22, 9);
    isoBox(g, 0, 2, 16, 16, COLORS.stone, COLORS.stoneDark, shade(COLORS.stoneDark, 0.85));
    diamond(g, 0, -16, 11, 5.5, COLORS.water);
    g.rect(-14, -40, 3, 26).fill(COLORS.wood); g.rect(11, -40, 3, 22).fill(COLORS.wood);
    g.poly([-18, -38, 0, -50, 18, -38, 0, -34]).fill(COLORS.red);
  },
  flower_bed: (g) => {
    diamond(g, 0, 0, 24, 12, COLORS.soilDark);
    diamond(g, 0, -1, 20, 10, COLORS.soilMid);
    [[-10, -3, 0xff8fb1], [0, 1, 0xffd166], [9, -2, 0xf4f1ff], [-3, -6, 0xffd166], [5, 4, 0xff8fb1]].forEach(([x, y, c]) => {
      g.rect(x - 0.5, y - 6, 1, 6).fill(COLORS.leafDark); g.circle(x, y - 7, 3).fill(c);
    });
  },
  lamp: (g) => {
    shadow(g, 10, 4);
    g.rect(-2, -38, 4, 40).fill(COLORS.ink);
    g.circle(0, -42, 12).fill({ color: 0xffe08a, alpha: 0.35 });
    g.roundRect(-6, -48, 12, 12, 3).fill(0xffd166);
  },
  signboard: (g) => {
    shadow(g, 14, 5);
    g.rect(-2, -22, 4, 24).fill(COLORS.wood);
    g.roundRect(-14, -38, 28, 16, 3).fill(COLORS.woodLight);
    g.moveTo(-8, -33).lineTo(8, -33).stroke({ width: 2, color: COLORS.wood });
    g.moveTo(-8, -27).lineTo(4, -27).stroke({ width: 2, color: COLORS.wood });
  },
  windmill: (g) => {
    shadow(g, 40, 16);
    g.poly([-20, 6, 20, 6, 12, -56, -12, -56]).fill(COLORS.cream);
    g.poly([0, 6, 20, 6, 12, -56, 0, -56]).fill({ color: 0x000000, alpha: 0.1 });
    g.poly([-16, -54, 16, -54, 0, -76]).fill(COLORS.red);
    g.roundRect(-5, -14, 10, 20, 3).fill(COLORS.wood);
  },
  windmillBlades: (g) => {
    for (let i = 0; i < 4; i += 1) {
      const a = (Math.PI / 2) * i;
      g.poly([0, 0, Math.cos(a) * 30 - Math.sin(a) * 4, Math.sin(a) * 30 + Math.cos(a) * 4, Math.cos(a) * 30 + Math.sin(a) * 4, Math.sin(a) * 30 - Math.cos(a) * 4]).fill(COLORS.woodLight);
    }
    g.circle(0, 0, 4).fill(COLORS.wood);
  },
  path_tile: (g) => {
    diamond(g, 0, 0, 31, 15.5, COLORS.soilMid);
    diamond(g, 0, -1, 28, 14, 0xe6cfa6);
    [[-8, 2], [6, -3], [10, 4], [-2, -6]].forEach(([x, y]) => g.ellipse(x, y, 3, 1.5).fill({ color: 0xffffff, alpha: 0.35 }));
  },
  pond: (g) => {
    diamond(g, 0, 0, 62, 31, COLORS.stoneDark);
    diamond(g, 0, -1, 58, 29, COLORS.stone);
    diamond(g, 0, -1, 52, 26, COLORS.water);
    diamond(g, -6, -4, 28, 13, COLORS.waterLight, 0.5);
    g.ellipse(14, 6, 7, 3).fill({ color: 0xffffff, alpha: 0.5 });
  },
  // 동물 — 공통 몸통
  chicken: (g) => {
    shadow(g, 12, 5);
    g.ellipse(0, -10, 11, 9).fill(0xffffff); g.ellipse(-4, -9, 6, 5).fill({ color: 0xe9e4dc });
    blob(g, 8, -19, 6, 0xffffff);
    g.poly([13, -19, 19, -17, 13, -15]).fill(0xf2a93b);
    g.circle(10, -21, 1.2).fill(COLORS.ink);
    g.poly([5, -25, 8, -29, 10, -25]).fill(COLORS.red);
    g.rect(-3, -2, 1.5, 4).fill(0xf2a93b); g.rect(2, -2, 1.5, 4).fill(0xf2a93b);
  },
  sheep: (g) => {
    shadow(g, 15, 6);
    [[-8, -12, 8], [0, -15, 9], [8, -12, 8], [0, -9, 9]].forEach(([x, y, r]) => g.circle(x, y, r).fill(0xfffaf0));
    g.ellipse(12, -14, 5, 6).fill(0x4a3b32);
    g.circle(13, -16, 1).fill(0xffffff);
    g.rect(-6, -3, 2, 5).fill(0x4a3b32); g.rect(5, -3, 2, 5).fill(0x4a3b32);
  },
  cat: (g) => {
    shadow(g, 12, 5);
    g.ellipse(0, -9, 10, 8).fill(0xf0a15a);
    blob(g, 8, -17, 6.5, 0xf0a15a);
    g.poly([3, -21, 5, -28, 8, -22]).fill(0xf0a15a); g.poly([9, -22, 13, -28, 14, -20]).fill(0xf0a15a);
    g.circle(9, -18, 1).fill(COLORS.ink); g.circle(12.5, -18, 1).fill(COLORS.ink);
    g.moveTo(-9, -8).quadraticCurveTo(-18, -16, -12, -22).stroke({ width: 3, color: 0xf0a15a });
  },
  dog: (g) => {
    shadow(g, 14, 5);
    g.ellipse(0, -10, 12, 8).fill(0xd9a066);
    blob(g, 10, -18, 7, 0xd9a066);
    g.ellipse(6, -19, 3, 6).fill(0x8a5a33);
    g.circle(12, -19, 1.2).fill(COLORS.ink); g.circle(16, -16, 1.6).fill(COLORS.ink);
    g.rect(-6, -3, 2.5, 5).fill(0xb98450); g.rect(5, -3, 2.5, 5).fill(0xb98450);
    g.moveTo(-11, -12).lineTo(-16, -18).stroke({ width: 3, color: 0xd9a066 });
  },
  cow: (g) => {
    shadow(g, 18, 7);
    g.ellipse(0, -13, 15, 10).fill(0xffffff);
    g.ellipse(-5, -15, 5, 4).fill(0x4a3b32); g.ellipse(6, -10, 4, 3).fill(0x4a3b32);
    g.roundRect(10, -26, 12, 11, 4).fill(0xffffff);
    g.ellipse(19, -17, 4, 3).fill(0xf3b5b5);
    g.circle(14, -22, 1.2).fill(COLORS.ink);
    g.poly([11, -26, 10, -31, 14, -27]).fill(COLORS.cream);
    g.rect(-8, -4, 3, 6).fill(0xe9e4dc); g.rect(6, -4, 3, 6).fill(0xe9e4dc);
  },
};

const fallbackByCategory = (g, category, w, h) => {
  const hw = (Math.max(w, h) * TILE_W) / 4;
  shadow(g, hw + 4, hw / 2);
  isoBox(g, 0, 0, hw, 14, COLORS.woodLight, COLORS.wood, shade(COLORS.wood, 0.8));
};

const fieldFallback = (g, w, h) => {
  const hw = ((w + h) * TILE_W) / 4;
  const hh = hw / 2;
  g.ellipse(0, hh + 4, hw * 0.95, hh * 0.55).fill({ color: 0x3a2e22, alpha: 0.12 });
  g.poly([-hw, 6, 0, hh + 6, 0, hh + 14, -hw, 14]).fill(COLORS.grassDark);
  g.poly([0, hh + 6, hw, 6, hw, 14, 0, hh + 14]).fill(shade(COLORS.grassDark, 0.9));
  diamond(g, 0, 0, hw, hh, COLORS.grassLight);
  diamond(g, 0, 1, hw - 8, hh - 4, COLORS.soilDark);
  diamond(g, 0, 2, hw - 12, hh - 6, COLORS.soil);
  [-1, 0, 1].forEach((k) => {
    const ox = k * 32, oy = -k * 16 + 2;
    g.moveTo(ox - 40, oy - 20).lineTo(ox + 40, oy + 20).stroke({ width: 1, color: COLORS.soilDark, alpha: 0.35 });
  });
};

const spriteFrom = (tex, def) => {
  const s = new Sprite(tex);
  const a = def.anchor || [0.5, 1];
  s.anchor.set(a[0], a[1]);
  s.scale.set(def.scale || 1);
  return s;
};

/** 배치 아이템 하나의 그림. 원점 = 풋프린트 중심(입체물은 발이 원점 근처). */
export const createItemArt = (art, itemId, category, w = 1, h = 1) => {
  const root = new Container();
  const def = art.manifest.items?.[itemId];
  if (def?.src && art.textures[def.src]) {
    root.addChild(spriteFrom(art.textures[def.src], def));
    return root;
  }
  const g = new Graphics();
  if (itemId === 'field' || category === 'field') fieldFallback(g, w, h);
  else if (drawers[itemId]) drawers[itemId](g, w, h);
  else fallbackByCategory(g, category, w, h);
  root.addChild(g);
  if (itemId === 'windmill') {
    const blades = new Graphics();
    drawers.windmillBlades(blades);
    blades.position.set(0, -50);
    root.addChild(blades);
    root.spin = blades;
  }
  return root;
};

/** 밭 안 작물 하나. stageIdx 0.. (씨앗→수확). 원점 = 뿌리. */
export const createCropArt = (art, cropType, stageIdx, stageCount = 5) => {
  const root = new Container();
  const def = art.manifest.crops?.[cropType];
  const file = def?.stages?.[Math.min(stageIdx, (def.stages.length || 1) - 1)];
  if (def && file && art.textures[file]) {
    root.addChild(spriteFrom(art.textures[file], def));
    return root;
  }
  const g = new Graphics();
  const color = CROP_COLORS[cropType] || CROP_COLORS.carrot;
  const t = stageIdx / Math.max(1, stageCount - 1);
  g.ellipse(0, 0, 9, 4).fill({ color: COLORS.soilDark, alpha: 0.6 });
  if (stageIdx <= 0) {
    g.ellipse(0, -1, 3, 2).fill(0xe8d3a0);
  } else {
    const stem = 5 + t * 14;
    g.rect(-1, -stem, 2, stem).fill(COLORS.leafDark);
    g.ellipse(-4, -stem * 0.7, 4 + t * 3, 2 + t * 1.5).fill(COLORS.leaf);
    g.ellipse(4, -stem * 0.85, 4 + t * 3, 2 + t * 1.5).fill(COLORS.leafLight);
    if (stageIdx >= stageCount - 2) blob(g, 0, -stem - 2, 4 + t * 3, color);
  }
  root.addChild(g);
  return root;
};

export const cropStageCount = (art, cropType) => art.manifest.crops?.[cropType]?.stages?.length || 5;
