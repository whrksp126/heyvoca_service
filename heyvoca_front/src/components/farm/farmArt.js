// 농장 v4 자산 — manifest.json 의 src 가 있으면 PNG 텍스처, 없으면 저폴리 3D 도형 폴백(three.js).
import * as THREE from 'three';
import manifest from '../../assets/farm2/manifest.json';

export const GRID_W = manifest.grid?.w || 40;
export const GRID_H = manifest.grid?.h || 40;
const STAGE_KEYS = ['seed', 'sprout', 'leaf', 'carrot', 'golden'];
const evenUp = (n) => (n % 2 === 0 ? n : n + 1);

export const COLORS = {
  grass: 0xaad97f, soil: 0xa8764a, soilDark: 0x845a34, wood: 0x9a6b3f, woodLight: 0xc08d5a,
  leaf: 0x6fba5a, leafDark: 0x4f9a46, leafLight: 0xa6dd7d, red: 0xe0533d, cream: 0xfff4dc,
  stone: 0xb9b4aa, yellow: 0xf2c94c, ink: 0x3a2e22, ok: 0x4cc26a,
};
export const CROP_COLORS = {
  carrot: 0xf28c38, corn: 0xf2c94c, rice: 0xc9d77a, cucumber: 0x4caf50,
  tomato: 0xe0533d, pumpkin: 0xf29b38, radish: 0xf3d4e4, strawberry: 0xe8506a,
};

export const fieldDims = (book, fallbackW = 2, fallbackH = 2) => {
  if (!book) return { cols: fallbackW * 2, rows: fallbackH * 2, fw: fallbackW, fh: fallbackH, n: 0 };
  const stageSum = STAGE_KEYS.reduce((a, k) => a + Math.max(0, Number(book.stages?.[k]) || 0), 0);
  const n = Array.isArray(book.cells) ? book.cells.length : Math.max(0, Number(book.word_count ?? stageSum) || 0);
  const cols = Number(book.cols) || Math.min(16, Math.max(4, evenUp(Math.ceil(Math.sqrt(n)))));
  const rows = Number(book.rows) || Math.max(4, evenUp(Math.ceil(n / cols)));
  const fw = Number(book.fw) || Math.min(8, Math.max(2, Math.ceil(cols / 2)));
  const fh = Number(book.fh) || Math.max(2, Math.ceil(rows / 2));
  return { cols, rows, fw, fh, n };
};

export const cellStages = (book) => {
  if (!book) return [];
  if (Array.isArray(book.cells)) return book.cells.map((c) => Math.max(0, STAGE_KEYS.indexOf(c)));
  const list = [];
  STAGE_KEYS.forEach((k, i) => { for (let n = 0; n < (Number(book.stages?.[k]) || 0); n += 1) list.push(i); });
  return list;
};

// ── 평면 격자 (v5) ─────────────────────────────────────────────
// 칸 1 = 월드 1, 맵 중심이 원점. x → +동(오른쪽), y → +남(앞쪽)
export const surfaceFrame = (gx, gy, gw = GRID_W, gh = GRID_H) => ({
  n: new THREE.Vector3(0, 1, 0),
  east: new THREE.Vector3(1, 0, 0),
  south: new THREE.Vector3(0, 0, 1),
  pos: new THREE.Vector3(gx - gw / 2, 0, gy - gh / 2),
});
export const cellSize = () => ({ cw: 1, ch: 1 });
export const wrapX = (x) => x;

// ── 리소스 추적(언마운트 시 dispose) ───────────────────────────
export const createDisposer = () => {
  const list = new Set();
  return {
    track(o) { if (o) list.add(o); return o; },
    disposeAll() { list.forEach((o) => { try { o.dispose?.(); } catch (e) { /* noop */ } }); list.clear(); },
  };
};

// ── 텍스처 로딩 ────────────────────────────────────────────────
const urlLoaders = import.meta.glob(
  ['../../assets/farm2/*.png', '../../assets/images/farm/**/*.png'],
  { query: '?url', import: 'default' },
);
const resolveKey = (src) => (src.startsWith('images/') ? `../../assets/${src}` : `../../assets/farm2/${src}`);

export const loadArt = async (disposer) => {
  const srcs = new Set(['dirt_tile.png', 'soil_cell.png', 'path_tile.png']);
  Object.values(manifest.items || {}).forEach((it) => { if (it.src) srcs.add(it.src); });
  Object.values(manifest.crops || {}).forEach((c) => (c.stages || []).forEach((s) => s && srcs.add(s)));
  Object.values(manifest.animals || {}).forEach((a) => (a.frames || []).forEach((s) => srcs.add(s)));
  const loader = new THREE.TextureLoader();
  const textures = {};
  await Promise.all([...srcs].map(async (src) => {
    try {
      const l = urlLoaders[resolveKey(src)];
      if (!l) return;
      const tex = await loader.loadAsync(await l());
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 2;
      disposer.track(tex);
      textures[src] = tex;
    } catch (e) { /* 도형 폴백 */ }
  }));
  return { manifest, textures };
};

// ── 도형 폴백 헬퍼 ─────────────────────────────────────────────
const matCache = new WeakMap();
const toon = (art, color) => {
  let m = matCache.get(art);
  if (!m) { m = new Map(); matCache.set(art, m); }
  if (!m.has(color)) {
    const mat = new THREE.MeshLambertMaterial({ color });
    art.disposer.track(mat);
    m.set(color, mat);
  }
  return m.get(color);
};
const geoCache = new WeakMap();
const geo = (art, key, make) => {
  let m = geoCache.get(art);
  if (!m) { m = new Map(); geoCache.set(art, m); }
  if (!m.has(key)) m.set(key, art.disposer.track(make()));
  return m.get(key);
};
export const sphereGeo = (art) => geo(art, 'sph', () => new THREE.SphereGeometry(1, 10, 8));
export const cylGeo = (art) => geo(art, 'cyl', () => new THREE.CylinderGeometry(1, 1, 1, 8));
export const coneGeo = (art) => geo(art, 'cone', () => new THREE.ConeGeometry(1, 1, 8));
export const boxGeo = (art) => geo(art, 'box', () => new THREE.BoxGeometry(1, 1, 1));
export const planeGeo = (art) => geo(art, 'plane', () => new THREE.PlaneGeometry(1, 1));

export const part = (art, kind, color, [sx, sy, sz], [x, y, z]) => {
  const g = { sph: sphereGeo, cyl: cylGeo, cone: coneGeo, box: boxGeo }[kind](art);
  const m = new THREE.Mesh(g, toon(art, color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
};

/** 원점 = 바닥, +y = 위. 둥글고 귀여운 저폴리 폴백 */
export const buildFallback = (art, itemId, category) => {
  const g = new THREE.Group();
  const P = (...a) => g.add(part(art, ...a));
  if (category === 'tree' || itemId.startsWith('tree')) {
    const leaf = itemId === 'tree_apple' ? COLORS.leafLight : COLORS.leaf;
    P('cyl', COLORS.wood, [0.09, 0.5, 0.09], [0, 0.25, 0]);
    if (itemId === 'tree_pine') {
      P('cone', COLORS.leafDark, [0.4, 0.6, 0.4], [0, 0.65, 0]);
      P('cone', COLORS.leaf, [0.3, 0.5, 0.3], [0, 1.0, 0]);
    } else {
      P('sph', leaf, [0.42, 0.4, 0.42], [0, 0.78, 0]);
      P('sph', COLORS.leafDark, [0.28, 0.26, 0.28], [0.18, 0.62, 0.1]);
    }
    if (itemId === 'tree_apple') P('sph', COLORS.red, [0.07, 0.07, 0.07], [0.22, 0.8, 0.28]);
  } else if (category === 'animal') {
    P('sph', COLORS.cream, [0.2, 0.17, 0.22], [0, 0.2, 0]);
    P('sph', COLORS.cream, [0.12, 0.12, 0.12], [0, 0.38, 0.16]);
    P('cone', COLORS.yellow, [0.04, 0.08, 0.04], [0, 0.37, 0.3]);
  } else if (itemId === 'scarecrow') {
    P('cyl', COLORS.wood, [0.04, 0.7, 0.04], [0, 0.35, 0]);
    P('box', COLORS.wood, [0.5, 0.05, 0.05], [0, 0.55, 0]);
    P('sph', COLORS.yellow, [0.12, 0.12, 0.12], [0, 0.8, 0]);
  } else {
    P('cyl', COLORS.stone, [0.2, 0.08, 0.2], [0, 0.04, 0]);
    P('sph', COLORS.red, [0.12, 0.12, 0.12], [0.06, 0.2, 0]);
    P('sph', COLORS.yellow, [0.1, 0.1, 0.1], [-0.08, 0.18, 0.05]);
  }
  return g;
};

/** 작물 폴백 텍스처(PNG 없는 작물 종류용) — 단계별 둥근 새싹/열매 */
export const cropFallbackTexture = (art, crop, stage, stageCount = 5) => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  const t = stage / Math.max(1, stageCount - 1);
  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  if (stage <= 0) {
    x.fillStyle = '#e8d3a0'; x.beginPath(); x.ellipse(32, 56, 7, 5, 0, 0, 7); x.fill();
  } else {
    x.strokeStyle = hex(COLORS.leafDark); x.lineWidth = 4; x.lineCap = 'round';
    x.beginPath(); x.moveTo(32, 60); x.lineTo(32, 60 - (14 + t * 30)); x.stroke();
    x.fillStyle = hex(COLORS.leaf);
    x.beginPath(); x.ellipse(24, 52 - t * 22, 9 + t * 4, 5, -0.4, 0, 7); x.fill();
    x.beginPath(); x.ellipse(40, 46 - t * 22, 9 + t * 4, 5, 0.4, 0, 7); x.fill();
    if (stage >= stageCount - 2) {
      x.fillStyle = hex(CROP_COLORS[crop] || CROP_COLORS.carrot);
      x.beginPath(); x.arc(32, 58 - (14 + t * 30), 7 + t * 4, 0, 7); x.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  art.disposer.track(tex);
  return tex;
};

/** manifest 정의 → 월드 높이/앵커 (격자 1칸 = unit) */
export const spriteSize = (tex, def, unit, px = 64) => {
  const h = (tex.image.height * (def.scale || 1)) / px * unit;
  const w = (tex.image.width * (def.scale || 1)) / px * unit;
  return { w, h, ay: def.anchor?.[1] ?? 1, ax: def.anchor?.[0] ?? 0.5 };
};

export const cropStageCount = (art, crop) => art.manifest.crops?.[crop]?.stages?.length || 5;
export const getCropTex = (art, crop, stage) => {
  const def = art.manifest.crops?.[crop];
  const file = def?.stages?.[Math.min(stage, (def.stages?.length || 1) - 1)];
  const tex = file && art.textures[file];
  if (tex) return { tex, def };
  const key = `${crop}:${stage}`;
  art.fb = art.fb || {};
  if (!art.fb[key]) art.fb[key] = cropFallbackTexture(art, crop, stage, cropStageCount(art, crop));
  return { tex: art.fb[key], def: { scale: 1, anchor: [0.5, 1], _fb: true } };
};

/** 빌보드용 평면 지오메트리(바닥 앵커) */
export const billboardGeo = (art, ax = 0.5, ay = 1) => {
  const key = `bb${ax}:${ay}`;
  return geo(art, key, () => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0.5 - ax, ay - 0.5, 0); return g; });
};
