// 농장 Pixi 씬 — 동적 import 로만 불러온다(초기 번들 제외). React 와는 콜백/메서드로만 통신한다.
import { Application, Container, Graphics } from 'pixi.js';
import {
  GRID, TILE_W, TILE_H, COLORS, toScreen, fromScreen,
  loadArt, destroyArt, createItemArt, createCropArt, cropStageCount,
} from './farmArt';

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.0;
const TAP_SLOP = 8;
const STAGE_KEYS = ['seed', 'sprout', 'leaf', 'carrot', 'golden'];
const WALKABLE_GROUND = new Set(['path_tile']);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const hashStr = (s) => {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/** stages 분포대로 9칸(3×3)에 작물 단계 인덱스를 나눈다. 단어가 없으면 빈 밭. */
export const stageSlots = (stages, bookId) => {
  const counts = STAGE_KEYS.map((k) => Math.max(0, Number(stages?.[k]) || 0));
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const raw = counts.map((c) => (c * 9) / total);
  const quota = raw.map((r) => Math.floor(r));
  let left = 9 - quota.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
    if (left > 0) { quota[i] += 1; left -= 1; }
  });
  // 단어가 있는 단계는 최소 1칸
  counts.forEach((c, i) => {
    if (c > 0 && quota[i] === 0) {
      const big = quota.indexOf(Math.max(...quota));
      if (quota[big] > 1) { quota[big] -= 1; quota[i] += 1; }
    }
  });
  const list = [];
  quota.forEach((q, i) => { for (let n = 0; n < q; n += 1) list.push(i); });
  const rnd = mulberry32(hashStr(bookId));
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

export const createFarmScene = async (host, callbacks = {}) => {
  const app = new Application();
  await app.init({
    width: host.clientWidth || 360,
    height: host.clientHeight || 480,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    powerPreference: 'low-power',
  });
  const art = await loadArt();
  const canvas = app.canvas;
  canvas.className = 'block w-full h-full';
  host.appendChild(canvas);

  const world = new Container();
  const groundG = new Graphics();
  const groundItems = new Container();
  const gridG = new Graphics();
  const footprintG = new Graphics();
  const objects = new Container();
  objects.sortableChildren = true;
  const cloudLayer = new Container();
  const fxLayer = new Container();
  world.addChild(groundG, groundItems, gridG, footprintG, objects, cloudLayer, fxLayer);
  app.stage.addChild(world);

  // 지면 — 체커 타일 + 옆면 + 잔디 포인트
  const drawGround = () => {
    const g = groundG;
    const edge = (GRID * TILE_W) / 2;
    const bottom = GRID * TILE_H;
    g.poly([-edge, edge / 2 * 0 + bottom / 2, 0, bottom, 0, bottom + 18, -edge, bottom / 2 + 18]).fill(COLORS.soilMid);
    g.poly([0, bottom, edge, bottom / 2, edge, bottom / 2 + 18, 0, bottom + 18]).fill(COLORS.soilDark);
    for (let x = 0; x < GRID; x += 1) {
      for (let y = 0; y < GRID; y += 1) {
        const p = toScreen(x, y);
        const c = (x + y) % 2 ? COLORS.grass : 0xa3d379;
        g.poly([p.x, p.y, p.x + TILE_W / 2, p.y + TILE_H / 2, p.x, p.y + TILE_H, p.x - TILE_W / 2, p.y + TILE_H / 2]).fill(c);
      }
    }
    const rnd = mulberry32(7);
    for (let i = 0; i < 90; i += 1) {
      const p = toScreen(rnd() * GRID, rnd() * GRID);
      g.moveTo(p.x, p.y).lineTo(p.x - 2, p.y - 5).moveTo(p.x, p.y).lineTo(p.x + 2, p.y - 5).stroke({ width: 1, color: COLORS.leafDark, alpha: 0.5 });
    }
  };
  drawGround();

  const drawGrid = () => {
    gridG.clear();
    for (let i = 0; i <= GRID; i += 1) {
      const a = toScreen(i, 0); const b = toScreen(i, GRID);
      gridG.moveTo(a.x, a.y).lineTo(b.x, b.y);
      const c = toScreen(0, i); const d = toScreen(GRID, i);
      gridG.moveTo(c.x, c.y).lineTo(d.x, d.y);
    }
    gridG.stroke({ width: 1, color: 0xffffff, alpha: 0.28 });
  };
  gridG.visible = false;

  // 구름 그림자
  const clouds = [];
  const crnd = mulberry32(21);
  for (let i = 0; i < 4; i += 1) {
    const g = new Graphics();
    const rx = 90 + crnd() * 90;
    g.ellipse(0, 0, rx, rx * 0.45).fill({ color: 0x2c4a2c, alpha: 0.07 });
    g.ellipse(rx * 0.5, rx * 0.1, rx * 0.6, rx * 0.3).fill({ color: 0x2c4a2c, alpha: 0.06 });
    g.position.set(-700 + crnd() * 1400, 80 + crnd() * 600);
    cloudLayer.addChild(g);
    clouds.push({ g, speed: 10 + crnd() * 10 });
  }

  // ── 상태 ────────────────────────────────────────────────────
  let catalog = new Map();
  let books = new Map();
  const entries = new Map(); // uid -> entry
  let editMode = false;
  let selectedUid = null;
  let bottomInset = 0;
  let timeSec = 0;
  let destroyed = false;
  const timers = new Set();
  const particles = [];
  let cam = { x: 0, y: GRID * TILE_H / 2, s: 1 };
  let viewW = host.clientWidth || 360;
  let viewH = host.clientHeight || 480;

  const catOf = (itemId) => catalog.get(itemId) || { id: itemId, category: 'deco', w: 1, h: 1 };
  const sizeOf = (e) => { const c = catOf(e.data.item_id); return { w: c.w || 1, h: c.h || 1 }; };

  const applyCamera = () => {
    const bx = (GRID * TILE_W) / 2;
    cam.s = clamp(cam.s, ZOOM_MIN, ZOOM_MAX);
    cam.x = clamp(cam.x, -bx, bx);
    cam.y = clamp(cam.y, 0, GRID * TILE_H);
    world.scale.set(cam.s);
    world.position.set(viewW / 2 - cam.x * cam.s, (viewH - bottomInset) / 2 - cam.y * cam.s);
  };
  const toWorld = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left - world.x) / world.scale.x, y: (clientY - r.top - world.y) / world.scale.y };
  };

  // ── 점유/유효성 ─────────────────────────────────────────────
  const rectOf = (e) => { const { w, h } = sizeOf(e); return { x: e.data.x, y: e.data.y, w, h }; };
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const validAt = (e, x, y) => {
    const { w, h } = sizeOf(e);
    if (x < 0 || y < 0 || x + w > GRID || y + h > GRID) return false;
    const me = { x, y, w, h };
    for (const o of entries.values()) {
      if (o === e) continue;
      if (overlap(me, rectOf(o))) return false;
    }
    return true;
  };
  const isBlockedForAnimal = (cx, cy, self) => {
    if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) return true;
    const me = { x: cx, y: cy, w: 1, h: 1 };
    for (const o of entries.values()) {
      if (o === self) continue;
      const c = catOf(o.data.item_id).category;
      if (c === 'animal') { if (Math.abs(o.fx - 0.5 - cx) < 1 && Math.abs(o.fy - 0.5 - cy) < 1) return true; continue; }
      if (c === 'ground' && WALKABLE_GROUND.has(o.data.item_id)) continue;
      if (overlap(me, rectOf(o))) return true;
    }
    return false;
  };
  const nearestValid = (e, gx, gy) => {
    for (let r = 0; r < 12; r += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (validAt(e, gx + dx, gy + dy)) return { x: gx + dx, y: gy + dy };
        }
      }
    }
    return null;
  };

  // ── 표시 갱신 ───────────────────────────────────────────────
  const emitLayout = () => callbacks.onLayoutChange?.(getLayout());
  const emitSelect = () => {
    const e = entries.get(selectedUid);
    callbacks.onSelect?.(e ? { uid: e.data.uid, item_id: e.data.item_id, book_id: e.data.book_id, category: catOf(e.data.item_id).category, valid: e.valid !== false } : null);
  };

  const placeNode = (e) => {
    const { w, h } = sizeOf(e);
    const cat = catOf(e.data.item_id).category;
    if (cat === 'animal') {
      const p = toScreen(e.fx, e.fy);
      e.node.position.set(p.x, p.y + 4);
      e.node.zIndex = e.fx + e.fy;
    } else {
      const p = toScreen(e.data.x + w / 2, e.data.y + h / 2);
      e.node.position.set(p.x, p.y + (cat === 'ground' || cat === 'field' ? 0 : 6));
      e.node.zIndex = e.data.x + e.data.y + w + h;
    }
  };

  const buildPlants = (e) => {
    if (e.plants) { e.plants.destroy({ children: true }); e.plants = null; }
    const book = books.get(e.data.book_id);
    if (!book) return;
    const slots = stageSlots(book.stages, e.data.book_id);
    if (!slots.length) return;
    const crop = book.crop_type || 'carrot';
    const n = cropStageCount(art, crop);
    const plants = new Container();
    plants.sortableChildren = true;
    const cells = [];
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) cells.push([i, j]);
    const rnd = mulberry32(hashStr(e.data.book_id) ^ 0x9e3779b9);
    for (let i = cells.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    e.sway = [];
    slots.forEach((stage, idx) => {
      const [ci, cj] = cells[idx];
      const c = createCropArt(art, crop, stage, n);
      c.position.set((ci - cj) * 32, (ci + cj - 2) * 16 + 4);
      c.zIndex = ci + cj;
      plants.addChild(c);
      e.sway.push({ node: c, phase: rnd() * 6.28 });
    });
    e.node.addChild(plants);
    e.plants = plants;
  };

  const buildEntry = (data) => {
    const cat = catOf(data.item_id);
    const { w, h } = { w: cat.w || 1, h: cat.h || 1 };
    const node = new Container();
    const flipC = new Container();
    const itemArt = createItemArt(art, data.item_id, cat.category, w, h);
    flipC.addChild(itemArt);
    flipC.scale.x = data.flip ? -1 : 1;
    node.addChild(flipC);
    const e = {
      data, node, flipC, art: itemArt, plants: null, sway: [], valid: true,
      fx: data.x + 0.5, fy: data.y + 0.5, tx: null, ty: null, wait: Math.random() * 3,
      jump: 0, shake: 0, phase: Math.random() * 6.28, last: { x: data.x, y: data.y },
    };
    (cat.category === 'ground' ? groundItems : objects).addChild(node);
    entries.set(data.uid, e);
    if (cat.category === 'field') buildPlants(e);
    placeNode(e);
    return e;
  };

  const removeEntry = (uid) => {
    const e = entries.get(uid);
    if (!e) return;
    e.node.destroy({ children: true });
    entries.delete(uid);
    if (selectedUid === uid) selectedUid = null;
  };

  const drawFootprint = () => {
    footprintG.clear();
    const e = entries.get(selectedUid);
    if (!e || !editMode) return;
    const { w, h } = sizeOf(e);
    const a = toScreen(e.data.x, e.data.y);
    const b = toScreen(e.data.x + w, e.data.y);
    const c = toScreen(e.data.x + w, e.data.y + h);
    const d = toScreen(e.data.x, e.data.y + h);
    const color = e.valid === false ? 0xe0533d : 0x4cc26a;
    footprintG.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color, alpha: 0.5 }).stroke({ width: 2, color, alpha: 0.9 });
  };

  const setValidity = (e) => { e.valid = validAt(e, e.data.x, e.data.y); };

  function getLayout() {
    return [...entries.values()].map((e) => ({
      uid: e.data.uid, item_id: e.data.item_id, x: e.data.x, y: e.data.y,
      flip: !!e.data.flip, book_id: e.data.book_id ?? null,
    }));
  }

  const clearEntries = () => {
    [...entries.keys()].forEach(removeEntry);
    selectedUid = null;
  };

  const setLayout = (layout) => {
    clearEntries();
    (layout || []).forEach((it) => {
      if (!catalog.has(it.item_id)) return;
      buildEntry({ uid: it.uid, item_id: it.item_id, x: it.x, y: it.y, flip: !!it.flip, book_id: it.book_id ?? null });
    });
    drawFootprint();
    emitSelect();
    emitLayout();
  };

  // ── 입력 ────────────────────────────────────────────────────
  const hitTest = (wp) => {
    const list = [...entries.values()].sort((a, b) => b.node.zIndex - a.node.zIndex);
    const find = (px, py, onlyStanding) => {
      const { gx, gy } = fromScreen(px, py);
      const cx = Math.floor(gx); const cy = Math.floor(gy);
      return list.find((e) => {
        const cat = catOf(e.data.item_id).category;
        if (onlyStanding && (cat === 'ground' || cat === 'field')) return false;
        if (cat === 'animal' && !editMode) return Math.floor(e.fx) === cx && Math.floor(e.fy) === cy;
        return overlap({ x: cx, y: cy, w: 1, h: 1 }, rectOf(e));
      });
    };
    return find(wp.x, wp.y + 26, true) || find(wp.x, wp.y, false);
  };

  const spawnSparkles = (wx, wy, n = 8) => {
    const colors = [0xffe08a, 0xffffff, 0xffd166, 0xcdeeb2];
    for (let i = 0; i < n; i += 1) {
      const g = new Graphics();
      const r = 1.5 + Math.random() * 2;
      g.star(0, 0, 4, r * 1.6, r * 0.6).fill(colors[i % colors.length]);
      g.position.set(wx, wy);
      fxLayer.addChild(g);
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 40 + Math.random() * 60;
      particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 0.7 + Math.random() * 0.4 });
    }
  };

  const pointers = new Map();
  let mode = 'none'; // pan | pinch | drag | ext
  let moved = false;
  let dragEntry = null;
  let grab = { dx: 0, dy: 0 };
  let pinch = null;

  const cellAt = (clientX, clientY) => {
    const wp = toWorld(clientX, clientY);
    const { gx, gy } = fromScreen(wp.x, wp.y);
    return { x: Math.floor(gx), y: Math.floor(gy), wp };
  };

  const moveDragTo = (clientX, clientY) => {
    if (!dragEntry) return;
    const c = cellAt(clientX, clientY);
    const { w, h } = sizeOf(dragEntry);
    // 큰 물건은 중심이 포인터 아래 오도록, 잡은 위치 오프셋 유지
    const nx = c.x - grab.dx; const ny = c.y - grab.dy;
    dragEntry.data.x = clamp(nx, -2, GRID + 1 - w + 1);
    dragEntry.data.y = clamp(ny, -2, GRID + 1 - h + 1);
    setValidity(dragEntry);
    placeNode(dragEntry);
    drawFootprint();
  };

  const revertLater = (e) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (destroyed || !entries.has(e.data.uid)) return;
      e.data.x = e.last.x; e.data.y = e.last.y;
      setValidity(e); placeNode(e); drawFootprint(); emitSelect(); emitLayout();
    }, 380);
    timers.add(t);
  };

  const finishDrag = (isExternalOutside = false) => {
    const e = dragEntry;
    dragEntry = null;
    if (!e) return;
    e.art.alpha = 1; e.flipC.y = 0;
    if (isExternalOutside && e.isNew) { removeEntry(e.data.uid); drawFootprint(); emitSelect(); emitLayout(); return; }
    setValidity(e);
    if (e.valid) { e.last = { x: e.data.x, y: e.data.y }; e.isNew = false; } else if (e.isNew) {
      const nv = nearestValid(e, clamp(e.data.x, 0, GRID - 1), clamp(e.data.y, 0, GRID - 1));
      if (nv) { e.data.x = nv.x; e.data.y = nv.y; setValidity(e); placeNode(e); e.last = nv; e.isNew = false; } else { removeEntry(e.data.uid); }
    } else { revertLater(e); }
    e.fx = e.data.x + 0.5; e.fy = e.data.y + 0.5;
    drawFootprint(); emitSelect(); emitLayout();
  };

  const onDown = (ev) => {
    canvas.setPointerCapture?.(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY });
    if (pointers.size === 2) {
      if (dragEntry) { // 핀치로 넘어가면 드래그는 취소
        dragEntry.data.x = dragEntry.last.x; dragEntry.data.y = dragEntry.last.y;
        const de = dragEntry; finishDrag(true); if (!entries.has(de.data.uid)) selectedUid = null;
      }
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: cam.s };
      mode = 'pinch'; moved = true;
      return;
    }
    moved = false;
    mode = 'pan';
    if (editMode) {
      const c = cellAt(ev.clientX, ev.clientY);
      const hit = hitTest(c.wp);
      if (hit) {
        selectedUid = hit.data.uid;
        dragEntry = hit; hit.isNew = false;
        hit.last = { x: hit.data.x, y: hit.data.y };
        grab = { dx: c.x - hit.data.x, dy: c.y - hit.data.y };
        mode = 'drag';
        drawFootprint(); emitSelect();
      }
    }
  };

  const onMove = (ev) => {
    const p = pointers.get(ev.pointerId);
    if (!p) return;
    const dx = ev.clientX - p.x; const dy = ev.clientY - p.y;
    p.x = ev.clientX; p.y = ev.clientY;
    if (!moved && Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy) > TAP_SLOP) moved = true;
    if (mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
      const before = toWorld(mx, my);
      cam.s = clamp(pinch.s * (d / pinch.d), ZOOM_MIN, ZOOM_MAX);
      applyCamera();
      const after = toWorld(mx, my);
      cam.x += before.x - after.x; cam.y += before.y - after.y;
      applyCamera();
      return;
    }
    if (!moved) return;
    if (mode === 'drag' && dragEntry) {
      dragEntry.art.alpha = 0.9; dragEntry.flipC.y = -6;
      moveDragTo(ev.clientX, ev.clientY);
    } else if (mode === 'pan') {
      cam.x -= dx / cam.s; cam.y -= dy / cam.s;
      applyCamera();
    }
  };

  const onUp = (ev) => {
    const had = pointers.delete(ev.pointerId);
    if (!had) return;
    canvas.releasePointerCapture?.(ev.pointerId);
    if (mode === 'pinch') { if (pointers.size < 2) { mode = 'none'; pinch = null; pointers.clear(); } return; }
    const wasMoved = moved;
    if (mode === 'drag') {
      if (wasMoved) finishDrag(false);
      else { dragEntry = null; emitSelect(); }
    } else if (!wasMoved) {
      const c = cellAt(ev.clientX, ev.clientY);
      if (editMode) {
        selectedUid = null; drawFootprint(); emitSelect();
      } else {
        const hit = hitTest(c.wp);
        spawnSparkles(c.wp.x, c.wp.y);
        if (hit) {
          const cat = catOf(hit.data.item_id).category;
          if (cat === 'field') callbacks.onTapField?.(hit.data.book_id);
          else if (cat === 'animal') hit.jump = 0.001;
          else hit.shake = 1;
        }
      }
    }
    mode = 'none';
  };

  const onWheel = (ev) => {
    ev.preventDefault();
    const before = toWorld(ev.clientX, ev.clientY);
    cam.s = clamp(cam.s * (ev.deltaY < 0 ? 1.1 : 0.9), ZOOM_MIN, ZOOM_MAX);
    applyCamera();
    const after = toWorld(ev.clientX, ev.clientY);
    cam.x += before.x - after.x; cam.y += before.y - after.y;
    applyCamera();
  };
  const onCtx = (ev) => ev.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onCtx);

  // ── 틱 ──────────────────────────────────────────────────────
  const tick = (ticker) => {
    const dt = Math.min(ticker.deltaMS, 64) / 1000;
    timeSec += dt;
    clouds.forEach((c) => {
      c.g.x += c.speed * dt; c.g.y += c.speed * 0.5 * dt;
      if (c.g.x > 1000 || c.g.y > 900) { c.g.x = -1000; c.g.y = -50 + Math.random() * 500; }
    });
    for (const e of entries.values()) {
      const cat = catOf(e.data.item_id).category;
      if (cat === 'animal') {
        let bounce = 0;
        if (!editMode) {
          if (e.tx === null) {
            e.wait -= dt;
            if (e.wait <= 0) {
              for (let tries = 0; tries < 6; tries += 1) {
                const cx = Math.floor(e.fx) + Math.round((Math.random() - 0.5) * 6);
                const cy = Math.floor(e.fy) + Math.round((Math.random() - 0.5) * 6);
                if (!isBlockedForAnimal(cx, cy, e) && Math.abs(cx - e.data.x) <= 4 && Math.abs(cy - e.data.y) <= 4) { e.tx = cx + 0.5; e.ty = cy + 0.5; break; }
              }
              e.wait = 1.5 + Math.random() * 3;
            }
          } else {
            const ddx = e.tx - e.fx; const ddy = e.ty - e.fy;
            const dist = Math.hypot(ddx, ddy);
            const step = 0.7 * dt;
            if (dist <= step) { e.fx = e.tx; e.fy = e.ty; e.tx = null; } else {
              const nfx = e.fx + (ddx / dist) * step; const nfy = e.fy + (ddy / dist) * step;
              if (isBlockedForAnimal(Math.floor(nfx), Math.floor(nfy), e)) e.tx = null; else { e.fx = nfx; e.fy = nfy; }
              const sdx = (ddx - ddy);
              if (Math.abs(sdx) > 0.01) e.flipC.scale.x = (sdx > 0 ? 1 : -1) * (e.data.flip ? -1 : 1);
              bounce = Math.abs(Math.sin(timeSec * 9 + e.phase)) * 3;
            }
          }
          placeNode(e);
        }
        let jumpY = 0;
        if (e.jump > 0) { e.jump += dt / 0.5; if (e.jump >= 1) e.jump = 0; else jumpY = Math.sin(Math.PI * e.jump) * 16; }
        if (!dragEntry || dragEntry !== e) e.flipC.y = -(bounce + jumpY);
      } else if (cat === 'tree' || e.data.item_id === 'scarecrow' || e.data.item_id === 'flower_bed') {
        if (e.shake > 0) e.shake = Math.max(0, e.shake - dt * 1.4);
        e.flipC.rotation = Math.sin(timeSec * 1.4 + e.phase) * 0.025 + Math.sin(timeSec * 30) * 0.05 * e.shake * e.shake;
      }
      if (e.sway) e.sway.forEach((s) => { s.node.rotation = Math.sin(timeSec * 1.8 + s.phase) * 0.07; });
      if (e.art.spin) e.art.spin.rotation += dt * 1.2;
    }
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life += dt;
      p.g.x += p.vx * dt; p.g.y += p.vy * dt; p.vy += 90 * dt;
      p.g.alpha = Math.max(0, 1 - p.life / p.max);
      p.g.rotation += dt * 4;
      if (p.life >= p.max) { p.g.destroy(); particles.splice(i, 1); }
    }
  };
  app.ticker.add(tick);

  // 백그라운드 탭이면 ticker 정지
  const onVis = () => { if (document.hidden) app.ticker.stop(); else app.ticker.start(); };
  document.addEventListener('visibilitychange', onVis);

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    const w = host.clientWidth; const h = host.clientHeight;
    if (!w || !h || destroyed) return;
    viewW = w; viewH = h;
    app.renderer.resize(w, h);
    applyCamera();
  }) : null;
  ro?.observe(host);

  applyCamera();

  // ── 공개 API ────────────────────────────────────────────────
  const centerOnFields = () => {
    const fields = [...entries.values()].filter((e) => catOf(e.data.item_id).category === 'field');
    if (fields.length) {
      const sum = fields.reduce((a, e) => { const p = toScreen(e.data.x + 1.5, e.data.y + 1.5); return { x: a.x + p.x, y: a.y + p.y }; }, { x: 0, y: 0 });
      cam.x = sum.x / fields.length; cam.y = sum.y / fields.length;
    } else { cam.x = 0; cam.y = GRID * TILE_H / 2; }
    applyCamera();
  };

  const startNew = (itemId, bookId) => {
    const uid = `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    const e = buildEntry({ uid, item_id: itemId, x: 0, y: 0, flip: false, book_id: bookId ?? null });
    e.isNew = true; e.last = { x: 0, y: 0 };
    selectedUid = uid;
    return e;
  };

  return {
    setData({ catalog: cat, layout, books: bs }) {
      catalog = new Map((cat || []).map((c) => [c.id, c]));
      books = new Map((bs || []).map((b) => [b.id, b]));
      setLayout(layout);
      centerOnFields();
    },
    resetLayout(layout) { setLayout(layout); },
    setBooks(bs) {
      books = new Map((bs || []).map((b) => [b.id, b]));
      entries.forEach((e) => { if (e.data.book_id) buildPlants(e); });
    },
    setBookCrop(bookId, crop) {
      const b = books.get(bookId);
      if (b) b.crop_type = crop;
      entries.forEach((e) => { if (e.data.book_id === bookId) buildPlants(e); });
    },
    setEditMode(on) {
      editMode = !!on;
      gridG.visible = editMode;
      if (editMode) {
        drawGrid();
        entries.forEach((e) => { e.fx = e.data.x + 0.5; e.fy = e.data.y + 0.5; e.tx = null; e.flipC.y = 0; placeNode(e); });
      } else { selectedUid = null; emitSelect(); }
      drawFootprint();
    },
    setBottomInset(px) { bottomInset = px; applyCamera(); },
    /** 서랍 칩을 눌렀을 때 — 화면 중앙 근처 빈 칸에 놓고 선택한다. 실패하면 false */
    addAtCenter(itemId, bookId) {
      const e = startNew(itemId, bookId);
      const { gx, gy } = fromScreen(cam.x, cam.y);
      const { w, h } = sizeOf(e);
      const nv = nearestValid(e, clamp(Math.floor(gx - w / 2), 0, GRID - w), clamp(Math.floor(gy - h / 2), 0, GRID - h));
      if (!nv) { removeEntry(e.data.uid); return false; }
      e.data.x = nv.x; e.data.y = nv.y; e.last = nv; e.isNew = false;
      e.fx = nv.x + 0.5; e.fy = nv.y + 0.5;
      setValidity(e); placeNode(e); drawFootprint(); emitSelect(); emitLayout();
      return true;
    },
    /** 서랍에서 끌어 올 때 */
    beginExternalDrag(itemId, bookId, clientX, clientY) {
      const e = startNew(itemId, bookId);
      dragEntry = e; mode = 'ext'; grab = { dx: 0, dy: 0 };
      e.art.alpha = 0.9;
      moveDragTo(clientX, clientY);
      emitSelect();
    },
    moveExternalDrag(clientX, clientY) { if (mode === 'ext') moveDragTo(clientX, clientY); },
    endExternalDrag(clientX, clientY) {
      if (mode !== 'ext') return;
      mode = 'none';
      const r = canvas.getBoundingClientRect();
      const outside = clientY > r.bottom - bottomInset || clientY < r.top || clientX < r.left || clientX > r.right;
      finishDrag(outside);
    },
    flipSelected() {
      const e = entries.get(selectedUid);
      if (!e) return;
      e.data.flip = !e.data.flip;
      e.flipC.scale.x = e.data.flip ? -1 : 1;
      emitLayout();
    },
    storeSelected() {
      if (!selectedUid) return;
      removeEntry(selectedUid);
      drawFootprint(); emitSelect(); emitLayout();
    },
    getLayout,
    hasInvalid() { return [...entries.values()].some((e) => e.valid === false); },
    destroy() {
      destroyed = true;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      document.removeEventListener('visibilitychange', onVis);
      ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx);
      app.ticker.remove(tick);
      app.destroy({ removeView: true }, { children: true, texture: false });
      destroyArt(art);
    },
  };
};
