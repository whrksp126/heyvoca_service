// 농장 v5 아이소메트릭 평면 대지(three.js, OrthographicCamera) — 동적 import 로만 불러온다. React 와는 콜백/메서드로만 통신한다.
import * as THREE from 'three';
import { GRID_W, GRID_H, loadArt, createDisposer, surfaceFrame } from './farmArt';
import FieldEntity from './entities/FieldEntity';
import DecorEntity from './entities/DecorEntity';
import FenceEntity from './entities/FenceEntity';
import AnimalEntity from './entities/AnimalEntity';

const PAD_TOP = 120;
const PAD_BOTTOM = 200;
const TAP_SLOP = 8;
const BASE_PX = 34; // 확대 1.0 = 월드 1 → 34px (타일 마름모 폭 약 48px)
const PX_MIN = 12;
const PX_MAX = 90;
const PITCH = (35 * Math.PI) / 180;
const DIST = 80;
const WALKABLE_GROUND = new Set(['path_tile']);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const cssColor = (name, fb) => {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return new THREE.Color(v || fb);
  } catch (e) { return new THREE.Color(fb); }
};

export const createFarmScene = async (host, callbacks = {}) => {
  const disposer = createDisposer();
  const art = await loadArt(disposer);
  art.disposer = disposer;

  let viewW = host.clientWidth || 360;
  let viewH = host.clientHeight || 480;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(viewW, viewH);
  const canvas = renderer.domElement;
  canvas.className = 'block w-full h-full';
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
  const skyTop = cssColor('--farm-sky-200', '#bfe3f4');
  const skyBottom = cssColor('--farm-sky-100', '#eef8ee');
  {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${skyTop.getHexString()}`);
    grad.addColorStop(1, `#${skyBottom.getHexString()}`);
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    disposer.track(tex);
    scene.background = tex;
  }
  scene.fog = new THREE.Fog(skyBottom, DIST + 40, DIST + 130);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe6b0, 1.9));
  const sun = new THREE.DirectionalLight(0xfff4dc, 1.2);
  sun.position.set(-6, 12, 8);
  scene.add(sun);

  const root = new THREE.Group();
  scene.add(root);

  const ctx = {
    root, art, disposer, camera, catalog: new Map(), books: new Map(), gw: GRID_W, gh: GRID_H,
    uniforms: { uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 } },
    camDir: new THREE.Vector3(), isBlocked: null,
  };
  const entities = new Map();
  let editMode = false;
  let selectedUid = null;
  let bottomInset = 0;
  let sPx = BASE_PX;
  const target = new THREE.Vector3(0, 0, 0);
  let vx = 0; let vz = 0;
  let destroyed = false;
  let raf = 0; let last = 0; let timeSec = 0;
  let yc = viewH / 2;
  const timers = new Set();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const camBack = new THREE.Vector3(Math.cos(PITCH) * Math.SQRT1_2, Math.sin(PITCH), Math.cos(PITCH) * Math.SQRT1_2);
  ctx.camDir.copy(camBack);
  const RIGHT = new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2);
  const FWD = new THREE.Vector3(-Math.SQRT1_2, 0, -Math.SQRT1_2);

  // ── 대지 — 흙 마당(조작 영역) + 돌·풀 경계 띠 + 채도 낮은 들판·듬성한 나무·먼 숲 ──
  let area = null;
  let gridLines = null;
  const buildArea = () => {
    if (area) { area.traverse((o) => { o.geometry?.dispose?.(); if (o.isInstancedMesh) o.dispose(); }); scene.remove(area); }
    area = new THREE.Group();
    scene.add(area);
    const { gw, gh } = ctx;
    const mk = (p) => disposer.track(new THREE.MeshBasicMaterial(p));
    // 영역 밖 들판 — 바랜 연두(형광 금지) + 정점색 얼룩
    const SIZE = 500; const SEG = 50;
    const og = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    og.rotateX(-Math.PI / 2);
    const pos = og.attributes.position; const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i); const z = pos.getZ(i);
      const v = 0.92 + 0.08 * (Math.sin(x * 0.11) * Math.cos(z * 0.09) + Math.sin((x + z) * 0.23) * 0.5);
      col.set([v, v, v], i * 3);
    }
    og.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const outside = new THREE.Mesh(og, mk({ color: 0xa9b78c, vertexColors: true, depthWrite: false }));
    outside.renderOrder = -2;
    area.add(outside);
    // 흙 마당
    const dirt = art.textures['dirt_tile.png'];
    if (dirt) { dirt.wrapS = THREE.RepeatWrapping; dirt.wrapT = THREE.RepeatWrapping; dirt.repeat.set(gw / 4, gh / 4); }
    const dg = new THREE.PlaneGeometry(gw, gh);
    dg.rotateX(-Math.PI / 2);
    const yard = new THREE.Mesh(dg, mk({ map: dirt || null, color: dirt ? 0xfff0e0 : 0xc9a27a, depthWrite: false }));
    yard.position.y = 0.01; yard.renderOrder = -1;
    area.add(yard);

    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const sc = new THREE.Vector3(); const v3 = new THREE.Vector3();
    // 경계 돌·풀 띠
    const per = 2 * (gw + gh);
    const NS = Math.floor(per / 0.75);
    const stones = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), disposer.track(new THREE.MeshLambertMaterial({ color: 0xbdb7aa })), NS);
    const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), disposer.track(new THREE.MeshLambertMaterial({ color: 0x7fa064 })), NS);
    for (let i = 0; i < NS; i += 1) {
      let t = (i / NS) * per; let x; let z;
      if (t < gw) { x = t; z = 0; } else if (t < gw + gh) { x = gw; z = t - gw; } else if (t < 2 * gw + gh) { x = gw - (t - gw - gh); z = gh; } else { x = 0; z = gh - (t - 2 * gw - gh); }
      t = rnd();
      const ox = x - gw / 2 + (rnd() - 0.5) * 0.3; const oz = z - gh / 2 + (rnd() - 0.5) * 0.3;
      const r = 0.2 + rnd() * 0.15;
      m4.compose(v3.set(ox, 0.08, oz), q, sc.set(r * 1.3, r * 0.7, r * 1.3)); stones.setMatrixAt(i, m4);
      const h = 0.25 + rnd() * 0.3;
      m4.compose(v3.set(ox + (rnd() - 0.5) * 0.5, h / 2, oz + (rnd() - 0.5) * 0.5), q, sc.set(0.1, h, 0.1)); tufts.setMatrixAt(i, m4);
    }
    stones.frustumCulled = false; tufts.frustumCulled = false;
    area.add(stones, tufts);
    // 듬성한 나무(가까이) + 먼 숲
    const trunkMat = disposer.track(new THREE.MeshLambertMaterial({ color: 0x6b8a52 }));
    const ballMat = disposer.track(new THREE.MeshLambertMaterial({ color: 0x7c9a62 }));
    const N = 260;
    const cone = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.2, 8), trunkMat, N);
    const ball = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), ballMat, N);
    let k = 0;
    while (k < N) {
      const x = (rnd() - 0.5) * 140; const z = (rnd() - 0.5) * 140;
      const dx = Math.abs(x) - gw / 2; const dz = Math.abs(z) - gh / 2;
      const d = Math.max(dx, dz);
      if (d < 2.5) continue;
      if (d < 16 && rnd() > 0.06) continue; // 가까운 곳은 듬성하게
      const s = d < 16 ? 0.9 + rnd() * 0.5 : 1.3 + rnd() * 1.5;
      m4.compose(v3.set(x, 1.1 * s, z), q, sc.set(s, s, s)); cone.setMatrixAt(k, m4);
      m4.compose(v3.set(x + 1.8, 0.9 * s, z + 1.2), q, sc.set(s * 0.9, s * 0.8, s * 0.9)); ball.setMatrixAt(k, m4);
      k += 1;
    }
    cone.frustumCulled = false; ball.frustumCulled = false;
    area.add(cone, ball);
    // 꾸미기 모드 격자선
    const lp = [];
    for (let i = 0; i <= gw; i += 1) lp.push(i - gw / 2, 0.05, -gh / 2, i - gw / 2, 0.05, gh / 2);
    for (let j = 0; j <= gh; j += 1) lp.push(-gw / 2, 0.05, j - gh / 2, gw / 2, 0.05, j - gh / 2);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    gridLines = new THREE.LineSegments(lg, disposer.track(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthTest: false })));
    gridLines.renderOrder = 3; gridLines.frustumCulled = false; gridLines.visible = editMode;
    area.add(gridLines);
  };
  buildArea();

  const catOf = (id) => ctx.catalog.get(id)?.category || 'deco';
  const entCat = (e) => catOf(e.itemId);

  const applyCamera = () => {
    sPx = clamp(sPx, PX_MIN, PX_MAX);
    target.x = clamp(target.x, -ctx.gw / 2 - 6, ctx.gw / 2 + 6);
    target.z = clamp(target.z, -ctx.gh / 2 - 6, ctx.gh / 2 + 6);
    const usable = viewH - (editMode ? bottomInset : 0);
    yc = editMode ? (PAD_TOP + usable) / 2 : (PAD_TOP + viewH - PAD_BOTTOM) / 2 + 20;
    camera.left = -viewW / 2 / sPx; camera.right = viewW / 2 / sPx;
    camera.top = viewH / 2 / sPx; camera.bottom = -viewH / 2 / sPx;
    camera.position.copy(target).addScaledVector(camBack, DIST);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    camera.setViewOffset(viewW, viewH, 0, -(yc - viewH / 2), viewW, viewH);
    camera.updateProjectionMatrix();
    ctx.uniforms.uRight.value.set(1, 0, 0).applyQuaternion(camera.quaternion);
    ctx.uniforms.uUp.value.set(0, 1, 0).applyQuaternion(camera.quaternion);
  };

  // ── 점유/유효성 ─────────────────────────────────────────────
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const validAt = (e, x, y) => {
    const fp = e.footprint();
    const me = { x, y, w: fp.w, h: fp.h };
    if (x < 0 || y < 0 || x + fp.w > ctx.gw || y + fp.h > ctx.gh) return false;
    for (const o of entities.values()) if (o !== e && overlap(me, o.footprint())) return false;
    return true;
  };
  ctx.isBlocked = (cx, cy, self) => {
    if (cx < 0 || cy < 0 || cx >= ctx.gw || cy >= ctx.gh) return true;
    const me = { x: cx, y: cy, w: 1, h: 1 };
    for (const o of entities.values()) {
      if (o === self) continue;
      const c = entCat(o);
      if (c === 'animal') { if (Math.abs(o.fx - 0.5 - cx) < 1 && Math.abs(o.fy - 0.5 - cy) < 1) return true; continue; }
      if (c === 'ground' && WALKABLE_GROUND.has(o.itemId)) continue;
      if (overlap(me, o.footprint())) return true;
    }
    return false;
  };
  const nearestValid = (e, gx, gy) => {
    for (let r = 0; r < 16; r += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && validAt(e, gx + dx, gy + dy)) return { x: gx + dx, y: gy + dy };
        }
      }
    }
    return null;
  };

  // ── 엔티티 ──────────────────────────────────────────────────
  const refreshFences = () => {
    const fences = [...entities.values()].filter((e) => e instanceof FenceEntity);
    fences.forEach((f) => {
      const has = (dx, dy) => fences.some((o) => o !== f && o.x === f.x + dx && o.y === f.y + dy);
      f.setNeighbors(has(0, -1), has(0, 1), has(-1, 0), has(1, 0));
    });
  };
  const getLayout = () => [...entities.values()].map((e) => ({
    uid: e.uid, item_id: e.itemId, x: e.x, y: e.y, rot: e.rot, flip: e.rot !== 0, book_id: e.bookId ?? null,
  }));
  const emitLayout = () => callbacks.onLayoutChange?.(getLayout());
  const emitSelect = () => {
    const e = entities.get(selectedUid);
    callbacks.onSelect?.(e ? { uid: e.uid, item_id: e.itemId, book_id: e.bookId, category: entCat(e), valid: e.valid !== false } : null);
  };

  let fpMesh = null;
  let occMesh = null;
  const fpBase = { transparent: true, depthWrite: false, depthTest: false };
  const fpMats = {
    ok: disposer.track(new THREE.MeshBasicMaterial({ ...fpBase, color: 0x4cc26a, opacity: 0.5 })),
    bad: disposer.track(new THREE.MeshBasicMaterial({ ...fpBase, color: 0xe0533d, opacity: 0.55 })),
    occ: disposer.track(new THREE.MeshBasicMaterial({ ...fpBase, color: 0x8c8c8c, opacity: 0.35 })),
  };
  const quadMesh = (rects, mat, order) => {
    const pos = []; const idx = [];
    const P = (gx, gy) => { const v = surfaceFrame(gx, gy, ctx.gw, ctx.gh).pos; return [v.x, 0.06, v.z]; };
    rects.forEach((fp) => {
      for (let i = 0; i < fp.w; i += 1) {
        for (let j = 0; j < fp.h; j += 1) {
          const x0 = fp.x + i; const y0 = fp.y + j; const b = pos.length / 3;
          [P(x0 + 0.04, y0 + 0.04), P(x0 + 0.96, y0 + 0.04), P(x0 + 0.96, y0 + 0.96), P(x0 + 0.04, y0 + 0.96)].forEach((v) => pos.push(...v));
          idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; m.renderOrder = order;
    root.add(m);
    return m;
  };
  const drawFootprint = () => {
    [fpMesh, occMesh].forEach((m) => { if (m) { root.remove(m); m.geometry.dispose(); } });
    fpMesh = null; occMesh = null;
    if (!editMode) return;
    const e = entities.get(selectedUid);
    const occ = [...entities.values()].filter((o) => o !== e && entCat(o) !== 'animal').map((o) => o.footprint());
    if (occ.length) occMesh = quadMesh(occ, fpMats.occ, 4);
    if (e) fpMesh = quadMesh([e.footprint()], e.valid === false ? fpMats.bad : fpMats.ok, 5);
  };
  const setValidity = (e) => { e.valid = validAt(e, e.x, e.y); };

  const makeEntity = (data) => {
    const cat = catOf(data.item_id);
    if (cat === 'field') return new FieldEntity(ctx, data);
    if (cat === 'fence') return new FenceEntity(ctx, data);
    if (cat === 'animal') return new AnimalEntity(ctx, data);
    return new DecorEntity(ctx, data);
  };
  const buildEntry = (data) => { const e = makeEntity(data); entities.set(data.uid, e); e.render(); return e; };
  const removeEntry = (uid) => {
    const e = entities.get(uid);
    if (!e) return;
    e.destroy(); entities.delete(uid);
    if (selectedUid === uid) selectedUid = null;
    refreshFences();
  };
  const clearEntries = () => { [...entities.keys()].forEach(removeEntry); selectedUid = null; };
  const setLayout = (layout) => {
    clearEntries();
    (layout || []).forEach((it) => {
      if (!ctx.catalog.has(it.item_id)) return;
      buildEntry({ uid: it.uid, item_id: it.item_id, x: it.x, y: it.y, rot: it.rot ?? (it.flip ? 90 : 0), book_id: it.book_id ?? null });
    });
    refreshFences(); drawFootprint(); emitSelect(); emitLayout();
  };

  // ── 레이캐스트 ──────────────────────────────────────────────
  const setRay = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    root.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, camera);
  };
  const cellAt = (clientX, clientY) => {
    setRay(clientX, clientY);
    const { origin: o, direction: d } = raycaster.ray;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = -o.y / d.y;
    const gx = o.x + d.x * t + ctx.gw / 2; const gy = o.z + d.z * t + ctx.gh / 2;
    return { gx, gy, x: Math.floor(gx), y: Math.floor(gy) };
  };
  const pick = (clientX, clientY) => {
    const cell = cellAt(clientX, clientY);
    let best = null; let bd = Infinity;
    for (const e of entities.values()) {
      if (!e.facing) continue;
      const d = e.hitTest(raycaster, cell);
      if (d != null && d < bd) { best = e; bd = d; }
    }
    return { hit: best, cell };
  };

  // ── 입력 ────────────────────────────────────────────────────
  const pointers = new Map();
  let mode = 'none'; // pan | pinch | drag | ext
  let moved = false;
  let dragEntry = null;
  let grab = { dx: 0, dy: 0 };
  let pinch = null;

  const moveDragTo = (clientX, clientY) => {
    if (!dragEntry) return;
    const c = cellAt(clientX, clientY);
    if (!c) return;
    const fp = dragEntry.footprint();
    dragEntry.x = clamp(c.x - grab.dx, -2, ctx.gw - fp.w + 2);
    dragEntry.y = clamp(c.y - grab.dy, -2, ctx.gh - fp.h + 2);
    setValidity(dragEntry);
    dragEntry.render(); refreshFences(); drawFootprint(); emitSelect();
  };
  const revertLater = (e) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (destroyed || !entities.has(e.uid)) return;
      e.x = e.last.x; e.y = e.last.y;
      setValidity(e); e.render(); refreshFences(); drawFootprint(); emitSelect(); emitLayout();
    }, 380);
    timers.add(t);
  };
  const finishDrag = (outside = false) => {
    const e = dragEntry;
    dragEntry = null;
    if (!e) return;
    if (outside && e.isNew) { removeEntry(e.uid); drawFootprint(); emitSelect(); emitLayout(); return; }
    setValidity(e);
    if (e.valid) { e.last = { x: e.x, y: e.y }; e.isNew = false; } else if (e.isNew) {
      const nv = nearestValid(e, clamp(e.x, 0, ctx.gw - 1), clamp(e.y, 0, ctx.gh - 1));
      if (nv) { e.x = nv.x; e.y = nv.y; setValidity(e); e.render(); e.last = nv; e.isNew = false; } else removeEntry(e.uid);
    } else revertLater(e);
    refreshFences(); drawFootprint(); emitSelect(); emitLayout();
  };

  const onDown = (ev) => {
    canvas.setPointerCapture?.(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY });
    vx = 0; vz = 0;
    if (pointers.size === 2) {
      if (dragEntry) { dragEntry.x = dragEntry.last.x; dragEntry.y = dragEntry.last.y; dragEntry.render(); finishDrag(true); }
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: sPx };
      mode = 'pinch'; moved = true;
      return;
    }
    moved = false; mode = 'pan';
    if (editMode) {
      const { hit, cell } = pick(ev.clientX, ev.clientY);
      if (hit) {
        selectedUid = hit.uid; dragEntry = hit; hit.isNew = false;
        hit.last = { x: hit.x, y: hit.y };
        grab = cell ? { dx: cell.x - hit.x, dy: cell.y - hit.y } : { dx: 0, dy: 0 };
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
      sPx = pinch.s * ((Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.d);
      applyCamera();
      return;
    }
    if (!moved) return;
    if (mode === 'drag' && dragEntry) moveDragTo(ev.clientX, ev.clientY);
    else if (mode === 'pan') {
      const mx = -dx / sPx; const mz = dy / (sPx * Math.sin(PITCH));
      target.addScaledVector(RIGHT, mx).addScaledVector(FWD, mz);
      vx = (RIGHT.x * mx + FWD.x * mz) * 60; vz = (RIGHT.z * mx + FWD.z * mz) * 60;
      applyCamera();
    }
  };
  const onUp = (ev) => {
    if (!pointers.delete(ev.pointerId)) return;
    canvas.releasePointerCapture?.(ev.pointerId);
    if (mode === 'pinch') { if (pointers.size < 2) { mode = 'none'; pinch = null; pointers.clear(); } return; }
    if (mode === 'drag') {
      if (moved) finishDrag(false); else { dragEntry = null; emitSelect(); }
    } else if (!moved) {
      if (editMode) { selectedUid = null; drawFootprint(); emitSelect(); } else {
        const { hit } = pick(ev.clientX, ev.clientY);
        if (hit) { if (entCat(hit) === 'field') callbacks.onTapField?.(hit.bookId); else hit.tap?.(); }
      }
    }
    mode = 'none';
  };
  const onWheel = (ev) => { ev.preventDefault(); sPx *= ev.deltaY < 0 ? 1.08 : 0.92; applyCamera(); };
  const onCtx = (ev) => ev.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onCtx);

  // ── 루프 ────────────────────────────────────────────────────
  const frame = (now) => {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000 || 0.016, 0.064);
    last = now; timeSec += dt;
    if (mode !== 'pan' && (Math.abs(vx) > 0.01 || Math.abs(vz) > 0.01)) {
      target.x += vx * dt; target.z += vz * dt;
      const f = Math.exp(-dt * 4); vx *= f; vz *= f;
      applyCamera();
    }
    ctx.uniforms.uTime.value = timeSec;
    const visR = (viewW / sPx) * 0.9 + 8; // 화면 밖 엔티티는 update 생략
    for (const e of entities.values()) {
      const p = e.group.position;
      e.facing = e instanceof FieldEntity || Math.hypot(p.x - target.x, p.z - target.z) < visR;
      if (e.facing) e.update(dt, timeSec, editMode);
    }
    renderer.render(scene, camera);
  };
  const start = () => { if (!raf && !destroyed) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  const onVis = () => { if (document.hidden) stop(); else start(); };
  document.addEventListener('visibilitychange', onVis);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    const w = host.clientWidth; const h = host.clientHeight;
    if (!w || !h || destroyed) return;
    viewW = w; viewH = h;
    renderer.setSize(w, h);
    applyCamera();
  }) : null;
  ro?.observe(host);
  applyCamera(); start();

  // ── 공개 API ────────────────────────────────────────────────
  // 밭들의 경계 상자 중심 + 화면을 채우는 확대
  const centerOnFields = () => {
    const fs = [...entities.values()].filter((e) => e instanceof FieldEntity);
    if (!fs.length) { target.set(0, 0, 0); sPx = BASE_PX; applyCamera(); return; }
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    fs.forEach((f) => { const p = f.footprint(); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h); });
    const c = surfaceFrame((x0 + x1) / 2, (y0 + y1) / 2, ctx.gw, ctx.gh).pos;
    target.set(c.x, 0, c.z);
    const span = (x1 - x0) + (y1 - y0);
    const sx = (viewW * 0.94) / (span * Math.SQRT1_2);
    const sy = (viewH - PAD_TOP - PAD_BOTTOM) / (span * Math.SQRT1_2 * Math.sin(PITCH) + 2.5);
    sPx = Math.min(sx, sy);
    applyCamera();
  };
  const startNew = (itemId, bookId) => {
    const uid = `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    const e = buildEntry({ uid, item_id: itemId, x: 0, y: 0, rot: 0, book_id: bookId ?? null });
    e.isNew = true; e.last = { x: 0, y: 0 };
    selectedUid = uid;
    return e;
  };

  return {
    setData({ catalog, layout, books, grid }) {
      ctx.catalog = new Map((catalog || []).map((c) => [c.id, c]));
      ctx.books = new Map((books || []).map((b) => [b.id, b]));
      if (grid?.w && grid?.h && (grid.w !== ctx.gw || grid.h !== ctx.gh)) { ctx.gw = grid.w; ctx.gh = grid.h; buildArea(); }
      setLayout(layout);
      centerOnFields();
    },
    resetLayout(layout) { setLayout(layout); },
    setBooks(bs) {
      ctx.books = new Map((bs || []).map((b) => [b.id, b]));
      entities.forEach((e) => { if (e.bookId) { setValidity(e); e.render(); } });
      drawFootprint(); emitSelect();
    },
    setBookCrop(bookId, crop) {
      const b = ctx.books.get(bookId);
      if (b) b.crop_type = crop;
      entities.forEach((e) => { if (e.bookId === bookId) e.render(); });
    },
    setEditMode(on) {
      editMode = !!on;
      if (gridLines) gridLines.visible = editMode;
      if (!editMode) { selectedUid = null; emitSelect(); }
      applyCamera(); drawFootprint();
    },
    setBottomInset(px) { bottomInset = px; applyCamera(); },
    addAtCenter(itemId, bookId) {
      const e = startNew(itemId, bookId);
      const c = cellAt(viewW / 2, yc) || { x: Math.floor(ctx.gw / 2), y: Math.floor(ctx.gh / 2) };
      const fp = e.footprint();
      const nv = nearestValid(e, clamp(c.x - Math.floor(fp.w / 2), 0, ctx.gw - fp.w), clamp(c.y - Math.floor(fp.h / 2), 0, ctx.gh - fp.h));
      if (!nv) { removeEntry(e.uid); return false; }
      e.x = nv.x; e.y = nv.y; e.last = nv; e.isNew = false;
      setValidity(e); e.render(); refreshFences(); drawFootprint(); emitSelect(); emitLayout();
      return true;
    },
    beginExternalDrag(itemId, bookId, clientX, clientY) {
      const e = startNew(itemId, bookId);
      dragEntry = e; mode = 'ext'; grab = { dx: 0, dy: 0 };
      moveDragTo(clientX, clientY); emitSelect();
    },
    moveExternalDrag(clientX, clientY) { if (mode === 'ext') moveDragTo(clientX, clientY); },
    endExternalDrag(clientX, clientY) {
      if (mode !== 'ext') return;
      mode = 'none';
      const r = canvas.getBoundingClientRect();
      finishDrag(clientY > r.bottom - bottomInset || clientY < r.top || clientX < r.left || clientX > r.right);
    },
    rotateSelected() {
      const e = entities.get(selectedUid);
      if (!e || e instanceof FieldEntity) return;
      e.rot = (e.rot + 90) % 360;
      setValidity(e); e.render(); refreshFences(); drawFootprint(); emitSelect(); emitLayout();
    },
    flipSelected() { this.rotateSelected(); },
    storeSelected() {
      if (!selectedUid) return;
      removeEntry(selectedUid);
      drawFootprint(); emitSelect(); emitLayout();
    },
    getLayout,
    hasInvalid() { return [...entities.values()].some((e) => e.valid === false); },
    destroy() {
      destroyed = true;
      stop();
      timers.forEach((t) => clearTimeout(t)); timers.clear();
      document.removeEventListener('visibilitychange', onVis);
      ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx);
      clearEntries();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.isInstancedMesh) o.dispose();
        const m = o.material;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((x) => { x.map?.dispose?.(); x.dispose(); });
      });
      disposer.disposeAll();
      renderer.dispose();
      renderer.forceContextLoss?.();
      canvas.remove();
    },
  };
};
