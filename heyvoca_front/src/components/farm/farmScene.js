// 농장 v4 작은 행성 씬(three.js) — 동적 import 로만 불러온다(초기 번들 제외). React 와는 콜백/메서드로만 통신한다.
import * as THREE from 'three';
import {
  R, GRID_W, GRID_H, loadArt, createDisposer, surfaceFrame, normalToGrid, wrapX, LAT_MAX,
} from './farmArt';
import FieldEntity from './entities/FieldEntity';
import DecorEntity from './entities/DecorEntity';
import FenceEntity from './entities/FenceEntity';
import AnimalEntity from './entities/AnimalEntity';

const PAD_TOP = 120;
const TAP_SLOP = 8;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.8;
const FOV = 40;
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
  const camera = new THREE.PerspectiveCamera(FOV, viewW / viewH, 0.5, 200);

  // 하늘 그라데이션 배경
  {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, `#${cssColor('--farm-sky-200', '#bfe3f4').getHexString()}`);
    grad.addColorStop(1, `#${cssColor('--farm-sky-100', '#eef8ee').getHexString()}`);
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    disposer.track(tex);
    scene.background = tex;
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c9a0, 1.5));
  const sun = new THREE.DirectionalLight(0xfff4dc, 1.6);
  sun.position.set(6, 9, 12);
  scene.add(sun);

  // 행성
  const root = new THREE.Group();
  scene.add(root);
  const grass = art.textures['grass_tile.png'];
  if (grass) { grass.wrapS = THREE.RepeatWrapping; grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(16, 8); }
  const planetGeo = disposer.track(new THREE.SphereGeometry(R, 64, 48));
  const planetMat = disposer.track(new THREE.MeshLambertMaterial({ map: grass || null, color: grass ? 0xd2d8a2 : 0xaad97f }));
  root.add(new THREE.Mesh(planetGeo, planetMat));
  // 대기 림 글로우
  const glowGeo = disposer.track(new THREE.SphereGeometry(R * 1.1, 32, 24));
  const glowMat = disposer.track(new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vN; void main(){ float i = pow(max(0.0, 0.62 - dot(vN, vec3(0.,0.,1.))), 3.0); gl_FragColor = vec4(0.78, 0.93, 0.85, 1.0) * i; }',
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  scene.add(new THREE.Mesh(glowGeo, glowMat));

  // ── 상태 ────────────────────────────────────────────────────
  const ctx = {
    root, art, disposer, catalog: new Map(), books: new Map(), gw: GRID_W, gh: GRID_H,
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 } },
    camLocal: new THREE.Vector3(0, 0, 30), camRight: new THREE.Vector3(1, 0, 0),
    isBlocked: null,
  };
  const entities = new Map();
  let editMode = false;
  let selectedUid = null;
  let bottomInset = 0;
  let zoom = 1;
  let yaw = 0; let pitch = 0.45;
  let vYaw = 0; let vPitch = 0;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  let timeSec = 0;
  const timers = new Set();
  const qX = new THREE.Quaternion(); const qY = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0); const AY = new THREE.Vector3(0, 1, 0);
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const catOf = (id) => ctx.catalog.get(id)?.category || 'deco';
  const entCat = (e) => catOf(e.itemId);

  const applyRotation = () => {
    pitch = clamp(pitch, -1.2, 1.2);
    root.quaternion.copy(qX.setFromAxisAngle(AX, pitch)).multiply(qY.setFromAxisAngle(AY, yaw));
  };

  const applyCamera = () => {
    camera.aspect = viewW / viewH;
    const tanH = Math.tan((FOV * Math.PI) / 360);
    let rpx = Math.min(viewW * 0.46, viewH * 0.4) * zoom;
    const usable = viewH - bottomInset;
    if (editMode) rpx = Math.min(rpx, (usable - PAD_TOP) / 2.1);
    const D = R / Math.sin(Math.atan((rpx * tanH) / (viewH / 2)));
    camera.position.set(0, 0, D);
    camera.lookAt(0, 0, 0);
    const yc = editMode ? (PAD_TOP + usable) / 2 : Math.min(viewH * 0.6, viewH - rpx * 0.4 - 190 + rpx * 0.4);
    camera.setViewOffset(viewW, viewH, 0, -(yc - viewH / 2), viewW, viewH);
    camera.updateProjectionMatrix();
  };

  // ── 점유/유효성 ─────────────────────────────────────────────
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const validAt = (e, x, y) => {
    const fp = e.footprint();
    const me = { x, y, w: fp.w, h: fp.h };
    if (x < 0 || y < 0 || x + fp.w > ctx.gw || y + fp.h > ctx.gh) return false;
    for (const o of entities.values()) {
      if (o !== e && overlap(me, o.footprint())) return false;
    }
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
    for (let r = 0; r < 14; r += 1) {
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
      const ax = f.axisX();
      const find = (dx, dy) => fences.some((o) => o !== f && o.axisX() === ax && o.x === wrapX(f.x + dx, ctx.gw) && o.y === f.y + dy);
      f.setNeighbors(ax ? find(-1, 0) : find(0, -1), ax ? find(1, 0) : find(0, 1));
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

  // 발판 칸 표시 — 초록/빨강
  let fpMesh = null;
  const fpMats = {
    ok: disposer.track(new THREE.MeshBasicMaterial({ color: 0x4cc26a, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
    bad: disposer.track(new THREE.MeshBasicMaterial({ color: 0xe0533d, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })),
  };
  const drawFootprint = () => {
    if (fpMesh) { root.remove(fpMesh); fpMesh.geometry.dispose(); fpMesh = null; }
    const e = entities.get(selectedUid);
    if (!e || !editMode) return;
    const fp = e.footprint();
    const pos = []; const idx = [];
    const P = (gx, gy) => surfaceFrame(gx, gy, ctx.gw, ctx.gh, R + 0.07).pos;
    for (let i = 0; i < fp.w; i += 1) {
      for (let j = 0; j < fp.h; j += 1) {
        const x0 = fp.x + i; const y0 = fp.y + j;
        const b = pos.length / 3;
        [P(x0 + 0.04, y0 + 0.04), P(x0 + 0.96, y0 + 0.04), P(x0 + 0.96, y0 + 0.96), P(x0 + 0.04, y0 + 0.96)].forEach((v) => pos.push(v.x, v.y, v.z));
        idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    fpMesh = new THREE.Mesh(g, e.valid === false ? fpMats.bad : fpMats.ok);
    fpMesh.frustumCulled = false;
    root.add(fpMesh);
  };

  const setValidity = (e) => { e.valid = validAt(e, e.x, e.y); };

  const makeEntity = (data) => {
    const cat = catOf(data.item_id);
    if (cat === 'field') return new FieldEntity(ctx, data);
    if (cat === 'fence') return new FenceEntity(ctx, data);
    if (cat === 'animal') return new AnimalEntity(ctx, data);
    return new DecorEntity(ctx, data);
  };
  const buildEntry = (data) => {
    const e = makeEntity(data);
    entities.set(data.uid, e);
    e.render();
    return e;
  };
  const removeEntry = (uid) => {
    const e = entities.get(uid);
    if (!e) return;
    e.destroy();
    entities.delete(uid);
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
    refreshFences();
    drawFootprint(); emitSelect(); emitLayout();
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
    const inv = root.quaternion.clone().invert();
    const o = raycaster.ray.origin.clone().applyQuaternion(inv);
    const d = raycaster.ray.direction.clone().applyQuaternion(inv);
    const b = o.dot(d); const c = o.dot(o) - R * R; const disc = b * b - c;
    if (disc < 0) return null;
    const p = o.addScaledVector(d, -b - Math.sqrt(disc));
    const g = normalToGrid(p.normalize(), ctx.gw, ctx.gh);
    return g ? { ...g, x: Math.floor(g.gx), y: Math.floor(g.gy) } : null;
  };
  const pick = (clientX, clientY) => {
    const cell = cellAt(clientX, clientY); // setRay 포함
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
  let mode = 'none'; // rotate | pinch | drag | ext
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
    dragEntry.render();
    refreshFences();
    drawFootprint(); emitSelect();
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
    vYaw = 0; vPitch = 0;
    if (pointers.size === 2) {
      if (dragEntry) { dragEntry.x = dragEntry.last.x; dragEntry.y = dragEntry.last.y; dragEntry.render(); finishDrag(true); }
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: zoom };
      mode = 'pinch'; moved = true;
      return;
    }
    moved = false; mode = 'rotate';
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
      zoom = clamp(pinch.z * ((Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.d), ZOOM_MIN, ZOOM_MAX);
      applyCamera();
      return;
    }
    if (!moved) return;
    if (mode === 'drag' && dragEntry) moveDragTo(ev.clientX, ev.clientY);
    else if (mode === 'rotate') {
      const k = 0.0075 / zoom;
      yaw += dx * k; pitch += dy * k;
      vYaw = dx * k * 60; vPitch = dy * k * 60;
      applyRotation();
    }
  };

  const onUp = (ev) => {
    if (!pointers.delete(ev.pointerId)) return;
    canvas.releasePointerCapture?.(ev.pointerId);
    if (mode === 'pinch') { if (pointers.size < 2) { mode = 'none'; pinch = null; pointers.clear(); } return; }
    const wasMoved = moved;
    if (mode === 'drag') {
      if (wasMoved) finishDrag(false); else { dragEntry = null; emitSelect(); }
    } else if (!wasMoved) {
      if (editMode) { selectedUid = null; drawFootprint(); emitSelect(); } else {
        const { hit } = pick(ev.clientX, ev.clientY);
        if (hit) {
          if (entCat(hit) === 'field') callbacks.onTapField?.(hit.bookId);
          else hit.tap?.();
        }
      }
    } else if (mode === 'rotate') { /* 관성은 틱에서 */ } 
    mode = 'none';
  };

  const onWheel = (ev) => {
    ev.preventDefault();
    zoom = clamp(zoom * (ev.deltaY < 0 ? 1.08 : 0.92), ZOOM_MIN, ZOOM_MAX);
    applyCamera();
  };
  const onCtx = (ev) => ev.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onCtx);

  // ── 루프 ────────────────────────────────────────────────────
  const camDir = new THREE.Vector3();
  const inv = new THREE.Quaternion();
  const frame = (now) => {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000 || 0.016, 0.064);
    last = now;
    timeSec += dt;
    if (mode !== 'rotate' && (Math.abs(vYaw) > 0.001 || Math.abs(vPitch) > 0.001)) {
      yaw += vYaw * dt; pitch += vPitch * dt;
      const f = Math.exp(-dt * 3.2); vYaw *= f; vPitch *= f;
      applyRotation();
    }
    root.updateMatrixWorld(true);
    inv.copy(root.quaternion).invert();
    ctx.camLocal.copy(camera.position).applyQuaternion(inv);
    ctx.camRight.set(1, 0, 0).applyQuaternion(inv);
    ctx.uniforms.uCam.value.copy(ctx.camLocal);
    ctx.uniforms.uTime.value = timeSec;
    camDir.copy(ctx.camLocal).normalize();
    for (const e of entities.values()) {
      e.facing = !e.frame || e.frame.n.dot(camDir) > -0.2; // 반대편 반구는 update 생략
      e.group.visible = e.facing;
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

  applyRotation(); applyCamera(); start();

  // ── 공개 API ────────────────────────────────────────────────
  const centerOnFields = () => {
    const fs = [...entities.values()].filter((e) => e instanceof FieldEntity);
    if (!fs.length) return;
    let sx = 0; let sz = 0; let ly = 0;
    fs.forEach((f) => { const fr = f.frame; sx += fr.n.x; sz += fr.n.z; ly += fr.lat; });
    yaw = -Math.atan2(sx, sz);
    pitch = clamp(ly / fs.length, -LAT_MAX, LAT_MAX);
    applyRotation();
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
      if (grid?.w && grid?.h) { ctx.gw = grid.w; ctx.gh = grid.h; }
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
      if (editMode) entities.forEach((e) => e.render()); else { selectedUid = null; emitSelect(); }
      applyCamera(); drawFootprint();
    },
    setBottomInset(px) { bottomInset = px; applyCamera(); },
    addAtCenter(itemId, bookId) {
      const e = startNew(itemId, bookId);
      const c = cellAt(viewW / 2, viewH * 0.5) || { x: Math.floor(ctx.gw / 2), y: Math.floor(ctx.gh / 2) };
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
      moveDragTo(clientX, clientY);
      emitSelect();
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
      if (fpMesh) { fpMesh.geometry.dispose(); fpMesh = null; }
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
