// 농장 v9 마을 지도 씬(three.js, PerspectiveCamera 약 50° 비스듬히) — 동적 import 로만 불러온다.
// React 와는 콜백/메서드로만 통신한다. 밭은 정해진 터(villageMap.js)에만 놓인다.
import * as THREE from 'three';
import { loadArt, createDisposer, cellStages } from './farmArt';
import CropLayer from './entities/CropLayer';
import SlotFieldEntity from './entities/SlotFieldEntity';
import {
  VILLAGE_SLOTS, ROADS, TREES, HALL, WORLD, MAP_H, toWorld, slotSizeFor,
} from './villageMap';

const PAD_TOP = 120;
const PAD_BOTTOM = 200;
const TAP_SLOP = 8;
const LONG_MS = 550;
const FOV = 45;
const ELEV = (50 * Math.PI) / 180;
const DMIN = 15; // 가장 가까이(이전 첫 화면 정도)
const DMAX = 64;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
  scene.background = new THREE.Color(0x5f9a52);
  const camera = new THREE.PerspectiveCamera(FOV, viewW / viewH, 0.5, 150);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe6b0, 1.9));
  const sun = new THREE.DirectionalLight(0xfff4dc, 1.2);
  sun.position.set(-6, 12, 8);
  scene.add(sun);
  const root = new THREE.Group();
  scene.add(root);

  const camBack = new THREE.Vector3(0, Math.sin(ELEV), Math.cos(ELEV));
  const ctx = {
    root, art, disposer, camera, catalog: new Map(), books: new Map(),
    uniforms: { uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 } },
    camDir: camBack.clone(),
  };

  // ── 지면 · 흙길 · 회관 · 나무 ───────────────────────────────
  {
    const tex = art.textures['village_ground.png'];
    if (tex) tex.anisotropy = 4;
    const g = disposer.track(new THREE.PlaneGeometry(WORLD, WORLD * MAP_H));
    g.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, disposer.track(new THREE.MeshBasicMaterial({ map: tex || null, color: tex ? 0xffffff : 0x8fc060, depthWrite: false })));
    ground.renderOrder = -3;
    scene.add(ground);
  }
  const ribbon = (road, widthAdd, mat, order, y) => {
    const pts = road.points; const w = (road.width + widthAdd) / 2;
    const pos = []; const uv = []; const idx = [];
    let along = 0;
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0]; let tz = b[1] - a[1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      if (i > 0) along += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      pos.push(p[0] - tz * w, y, p[1] + tx * w, p[0] + tz * w, y, p[1] - tx * w);
      uv.push(along / 4, -w / 4, along / 4, w / 4);
      if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    disposer.track(g);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = order; m.frustumCulled = false;
    scene.add(m);
  };
  {
    const dirt = art.textures['dirt_tile.png'];
    if (dirt) { dirt.wrapS = THREE.RepeatWrapping; dirt.wrapT = THREE.RepeatWrapping; }
    const edge = disposer.track(new THREE.MeshBasicMaterial({ color: 0xa9884f, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    const main = disposer.track(new THREE.MeshBasicMaterial({ map: dirt || null, color: dirt ? 0xfff0e0 : 0xc9a27a, depthWrite: false, side: THREE.DoubleSide }));
    ROADS.forEach((r) => { ribbon(r, 0.5, edge, -2, 0.02); ribbon(r, 0, main, -1, 0.03); });
  }
  const decor = new CropLayer(ctx, root);
  {
    const sh = disposer.track(new THREE.CircleGeometry(1, 16));
    sh.rotateX(-Math.PI / 2);
    const shm = disposer.track(new THREE.MeshBasicMaterial({ color: 0x1f3a14, transparent: true, opacity: 0.22, depthWrite: false }));
    const items = art.manifest.items || {};
    const treeTex = art.textures['tree_round.png'];
    const hallTex = art.textures['farmhouse.png'];
    const hw = toWorld(HALL.x, HALL.y);
    const shadows = new THREE.InstancedMesh(sh, shm, TREES.length + 1);
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion();
    TREES.forEach((t, i) => { m4.compose(new THREE.Vector3(t.x, 0.04, t.z), q, new THREE.Vector3(t.h * 0.42, 1, t.h * 0.3)); shadows.setMatrixAt(i, m4); });
    m4.compose(new THREE.Vector3(hw.x, 0.04, hw.z), q, new THREE.Vector3(HALL.size * 0.4, 1, HALL.size * 0.25));
    shadows.setMatrixAt(TREES.length, m4);
    shadows.frustumCulled = false; shadows.renderOrder = 0;
    root.add(shadows);
    if (treeTex) {
      const def = items.tree_round || { anchor: [0.5, 0.97] };
      const ar = treeTex.image.width / treeTex.image.height;
      decor.batch(treeTex, def.anchor, TREES.map((t, i) => ({ pos: new THREE.Vector3(t.x, 0, t.z), w: t.h * ar, h: t.h, phase: i * 1.7, sway: 0.4 })));
    }
    if (hallTex) {
      const def = items.house || { anchor: [0.5, 0.8] };
      const ar = hallTex.image.width / hallTex.image.height;
      decor.batch(hallTex, def.anchor, [{ pos: new THREE.Vector3(hw.x, 0, hw.z), w: HALL.size, h: HALL.size / ar, phase: 0, sway: 0 }]);
    }
  }

  // ── 터 상태 ─────────────────────────────────────────────────
  const slotEnt = new Map(VILLAGE_SLOTS.map((s) => [s.id, new SlotFieldEntity(ctx, s)]));
  let assign = new Map(); // slotId -> bookId
  let openCount = 3;
  let others = []; // 밭이 아닌 layout 항목(보존)
  const meta = new Map(); // bookId -> {uid, x, y}
  let savedAssign = null;
  let moveSel = null;
  let destroyed = false;

  const isOpen = (s) => s.order <= openCount || assign.has(s.id);
  const refreshSlot = (id) => {
    const s = VILLAGE_SLOTS.find((v) => v.id === id);
    const bid = assign.get(id);
    slotEnt.get(id).setState({ locked: !isOpen(s), book: bid != null ? ctx.books.get(String(bid)) || null : null });
  };
  const refreshAll = () => VILLAGE_SLOTS.forEach((s) => refreshSlot(s.id));

  // 이동 모드 하이라이트 — 선택 터는 초록, 바꿀 수 있는 열린 터는 흰색
  const hl = new Map();
  const hlBase = { transparent: true, depthWrite: false, depthTest: false };
  const hlMats = {
    sel: disposer.track(new THREE.MeshBasicMaterial({ ...hlBase, color: 0x4cc26a, opacity: 0.5 })),
    cand: disposer.track(new THREE.MeshBasicMaterial({ ...hlBase, color: 0xffffff, opacity: 0.32 })),
  };
  const hlGeo = disposer.track(new THREE.PlaneGeometry(1, 1));
  hlGeo.rotateX(-Math.PI / 2);
  VILLAGE_SLOTS.forEach((s) => {
    const e = slotEnt.get(s.id);
    const m = new THREE.Mesh(hlGeo, hlMats.cand);
    m.scale.set(e.dim.w + 0.4, 1, e.dim.d + 0.4);
    m.position.set(e.cx, 0.45, e.cz);
    m.renderOrder = 15; m.visible = false;
    root.add(m);
    hl.set(s.id, m);
  });
  const drawHl = () => {
    VILLAGE_SLOTS.forEach((s) => {
      const m = hl.get(s.id);
      m.visible = moveSel != null && isOpen(s);
      m.material = s.id === moveSel ? hlMats.sel : hlMats.cand;
    });
  };

  const getLayout = () => {
    const fields = [];
    assign.forEach((bid, slot) => {
      const mt = meta.get(bid) || { uid: `b${bid}`, x: 0, y: 0 };
      fields.push({ uid: mt.uid, item_id: 'field', x: mt.x, y: mt.y, rot: 0, book_id: bid, slot });
    });
    return [...others, ...fields];
  };
  const emitLayout = () => callbacks.onLayoutChange?.(getLayout());

  const applyData = ({ layout, books, open_slot_count: osc }) => {
    ctx.books = new Map((books || []).map((b) => [String(b.id), b]));
    const idOf = new Map((books || []).map((b) => [String(b.id), b.id]));
    assign = new Map(); meta.clear(); others = [];
    const placed = new Set();
    (layout || []).forEach((it) => {
      if (it.item_id !== 'field') { others.push(it); return; }
      const key = String(it.book_id);
      if (!ctx.books.has(key)) return;
      meta.set(idOf.get(key), { uid: it.uid, x: it.x ?? 0, y: it.y ?? 0 });
      if (it.slot && slotEnt.has(it.slot) && !assign.has(it.slot)) { assign.set(it.slot, idOf.get(key)); placed.add(key); }
    });
    openCount = Number.isFinite(osc) ? osc : clamp(Math.max(3, ctx.books.size + 1), 3, 12);
    // 슬롯 없는 단어장은 크기에 맞는 빈 열린 터(order 순)에 자동 배정, 없으면 아무 빈 열린 터
    (books || []).forEach((b) => {
      if (placed.has(String(b.id))) return;
      const need = slotSizeFor(b.word_count ?? cellStages(b).length);
      const free = VILLAGE_SLOTS.filter((s) => s.order <= Math.max(openCount, assign.size + 1) && !assign.has(s.id));
      const pick = free.find((s) => s.size === need) || free[0];
      if (pick) { assign.set(pick.id, b.id); if (!meta.has(b.id)) meta.set(b.id, { uid: `b${b.id}`, x: 0, y: 0 }); }
    });
    refreshAll();
  };

  // ── 카메라 ──────────────────────────────────────────────────
  const target = new THREE.Vector3(0, 0, 0);
  // 첫 시점 — 지도 가로 폭 전체가 화면 너비에 들어오게
  let dist = 15;
  let vx = 0; let vz = 0;
  let yc = viewH / 2;
  const applyCamera = () => {
    dist = clamp(dist, DMIN, DMAX);
    const aspect = viewW / viewH;
    const hwid = dist * Math.tan((FOV * Math.PI) / 360) * aspect;
    const hdep = (dist * Math.tan((FOV * Math.PI) / 360)) / Math.sin(ELEV);
    const xl = Math.max(0, 11 - hwid);
    target.x = clamp(target.x, -xl, xl);
    const zl = Math.max(0, 13 - hdep * 0.8);
    target.z = clamp(target.z, -zl, zl);
    yc = (PAD_TOP + viewH - PAD_BOTTOM) / 2 + 10;
    camera.aspect = aspect;
    camera.position.copy(target).addScaledVector(camBack, dist);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    camera.setViewOffset(viewW, viewH, 0, -(yc - viewH / 2), viewW, viewH);
    camera.updateProjectionMatrix();
    ctx.uniforms.uRight.value.set(1, 0, 0).applyQuaternion(camera.quaternion);
    ctx.uniforms.uUp.value.set(0, 1, 0).applyQuaternion(camera.quaternion);
  };

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundAt = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const { origin: o, direction: d } = raycaster.ray;
    if (d.y > -1e-4) return null;
    const t = -o.y / d.y;
    return new THREE.Vector3(o.x + d.x * t, 0, o.z + d.z * t);
  };
  const slotAt = (clientX, clientY) => {
    const p = groundAt(clientX, clientY);
    if (!p) return null;
    for (const e of slotEnt.values()) if (e.contains(p.x, p.z, 0.3)) return e.slot;
    // 말풍선·구름이 터 위로 솟아 있으니 위쪽 여유를 조금 더 준다
    for (const e of slotEnt.values()) if (e.contains(p.x, p.z + 1.2, 0.2)) return e.slot;
    return null;
  };

  // ── 입력 ────────────────────────────────────────────────────
  const pointers = new Map();
  let mode = 'none'; // pan | pinch
  let moved = false;
  let pinch = null;
  let longTimer = 0;
  const cancelLong = () => { if (longTimer) { clearTimeout(longTimer); longTimer = 0; } };

  const startMove = (slotId) => {
    savedAssign = new Map(assign);
    moveSel = slotId;
    drawHl();
    callbacks.onMoveStart?.({ book_id: assign.get(slotId) });
  };
  const trySwap = (targetId) => {
    const t = VILLAGE_SLOTS.find((s) => s.id === targetId);
    if (!t || !isOpen(t) || targetId === moveSel) return;
    const a = assign.get(moveSel); const b = assign.get(targetId);
    assign.set(targetId, a);
    if (b !== undefined) assign.set(moveSel, b); else assign.delete(moveSel);
    const prev = moveSel;
    moveSel = targetId;
    refreshSlot(prev); refreshSlot(targetId);
    drawHl(); emitLayout();
  };

  const onDown = (ev) => {
    canvas.setPointerCapture?.(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY });
    vx = 0; vz = 0;
    if (pointers.size === 2) {
      cancelLong();
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist };
      mode = 'pinch'; moved = true;
      return;
    }
    moved = false; mode = 'pan';
    cancelLong();
    if (moveSel == null) {
      const sx = ev.clientX; const sy = ev.clientY;
      longTimer = setTimeout(() => {
        longTimer = 0;
        if (moved || destroyed) return;
        const s = slotAt(sx, sy);
        if (s && assign.has(s.id)) { moved = true; startMove(s.id); }
      }, LONG_MS);
    }
  };
  const onMove = (ev) => {
    const p = pointers.get(ev.pointerId);
    if (!p) return;
    const prevX = p.x; const prevY = p.y;
    p.x = ev.clientX; p.y = ev.clientY;
    if (!moved && Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy) > TAP_SLOP) { moved = true; cancelLong(); }
    if (mode === 'pinch' && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      dist = pinch.dist / ((Math.hypot(a.x - b.x, a.y - b.y) || 1) / pinch.d);
      applyCamera();
      return;
    }
    if (!moved || mode !== 'pan') return;
    const p0 = groundAt(prevX, prevY); const p1 = groundAt(ev.clientX, ev.clientY);
    if (!p0 || !p1) return;
    target.x += p0.x - p1.x; target.z += p0.z - p1.z;
    vx = (p0.x - p1.x) * 60; vz = (p0.z - p1.z) * 60;
    applyCamera();
  };
  const onUp = (ev) => {
    if (!pointers.delete(ev.pointerId)) return;
    canvas.releasePointerCapture?.(ev.pointerId);
    cancelLong();
    if (mode === 'pinch') { if (pointers.size < 2) { mode = 'none'; pinch = null; pointers.clear(); } return; }
    if (!moved) {
      const s = slotAt(ev.clientX, ev.clientY);
      if (s) {
        if (moveSel != null) trySwap(s.id);
        else if (!isOpen(s)) callbacks.onLockedTap?.();
        else if (assign.has(s.id)) callbacks.onTapField?.(assign.get(s.id));
        else callbacks.onAddBook?.();
      }
    }
    mode = 'none';
  };
  const onWheel = (ev) => { ev.preventDefault(); dist *= ev.deltaY < 0 ? 0.92 : 1.08; applyCamera(); };
  const onCtx = (ev) => ev.preventDefault();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onCtx);

  // ── 루프 ────────────────────────────────────────────────────
  let raf = 0; let last = 0; let timeSec = 0;
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
    for (const e of slotEnt.values()) {
      // 화면에서 멀리 벗어난 터는 update 생략
      if (Math.hypot(e.cx - target.x, e.cz - target.z) < dist * 1.4 + 6) e.update(dt, timeSec);
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
  dist = (WORLD / 2 / (Math.tan((FOV * Math.PI) / 360) * (viewW / viewH))) * 1.02;
  applyCamera(); start();

  return {
    setData(data) {
      applyData(data);
      moveSel = null; drawHl();
      applyCamera();
    },
    setBooks(bs) {
      ctx.books = new Map((bs || []).map((b) => [String(b.id), b]));
      refreshAll();
    },
    setBookCrop(bookId, crop) {
      const b = ctx.books.get(String(bookId));
      if (b) b.crop_type = crop;
      assign.forEach((bid, slot) => { if (String(bid) === String(bookId)) refreshSlot(slot); });
    },
    cancelMove() {
      if (savedAssign) { assign = new Map(savedAssign); refreshAll(); }
      savedAssign = null; moveSel = null; drawHl();
    },
    endMove() { savedAssign = null; moveSel = null; drawHl(); },
    getLayout,
    destroy() {
      destroyed = true;
      stop(); cancelLong();
      document.removeEventListener('visibilitychange', onVis);
      ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onCtx);
      slotEnt.forEach((e) => e.destroy());
      decor.destroy();
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
