// 농장 v9 마을 지도 씬(three.js, PerspectiveCamera 약 50° 비스듬히) — 동적 import 로만 불러온다.
// React 와는 콜백/메서드로만 통신한다. 밭은 정해진 터(villageMap.js)에만 놓인다.
import * as THREE from 'three';
import { loadArt, createDisposer, cellStages, billboardGeo, spriteSize } from './farmArt';
import CropLayer from './entities/CropLayer';
import SlotFieldEntity from './entities/SlotFieldEntity';
import {
  planVillage, slotIndexOf, slotSizeFor, ROAD_W,
} from './villageMap';

const PAD_TOP = 120;
const PAD_BOTTOM = 200;
const TAP_SLOP = 8;
const LONG_MS = 550;
const FOV = 45;
const ELEV = (50 * Math.PI) / 180;
const DMIN = 15; // 가장 가까이(이전 첫 화면 정도)
const DMAX = 64;
const WORLD_PATCH_W = 17.8;
const WORLD_PATCH_D = 18;
const GROUND = 900; // 지면은 카메라 한도 밖까지 항상 화면을 덮는다
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
  scene.background = new THREE.Color(0x86b82e);
  const camera = new THREE.PerspectiveCamera(FOV, viewW / viewH, 0.5, 260);
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

  // ── 지면: 끝없는 들판(grass_tile + 색 얼룩 + 꽃·돌) + 중앙 village_ground 패치 ──
  {
    const SIZE = 1024; const PERIOD = 48;
    const cv = document.createElement('canvas'); cv.width = SIZE; cv.height = SIZE;
    const g = cv.getContext('2d');
    g.fillStyle = '#86b82e'; g.fillRect(0, 0, SIZE, SIZE);
    const gt = art.textures['grass_tile.png']?.image;
    if (gt) {
      const ts = 256;
      for (let y = 0; y < SIZE; y += ts) for (let x = 0; x < SIZE; x += ts) g.drawImage(gt, x, y, ts, ts);
    }
    let seed = 20261127;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const wrap = (fn, x, y, r) => {
      for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
        if (x + ox > -r && x + ox < SIZE + r && y + oy > -r && y + oy < SIZE + r) fn(x + ox, y + oy);
      }
    };
    for (let i = 0; i < 46; i += 1) {
      const x = rnd() * SIZE; const y = rnd() * SIZE; const r = 70 + rnd() * 110;
      const col = rnd() < 0.5 ? '156,203,58' : '116,164,38';
      wrap((px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, `rgba(${col},0.26)`); gr.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
      }, x, y, r);
    }
    const flowers = ['#fff6e0', '#f7b6c8', '#f7d44c', '#ffffff'];
    for (let i = 0; i < 70; i += 1) {
      const x = rnd() * SIZE; const y = rnd() * SIZE; const c = flowers[i % 4];
      wrap((px, py) => {
        g.fillStyle = c; g.beginPath(); g.arc(px, py, 3.2, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e8a93a'; g.beginPath(); g.arc(px, py, 1.1, 0, Math.PI * 2); g.fill();
      }, x, y, 6);
    }
    for (let i = 0; i < 16; i += 1) {
      const x = rnd() * SIZE; const y = rnd() * SIZE; const rr = 6 + rnd() * 6;
      wrap((px, py) => {
        g.fillStyle = 'rgba(70,60,40,0.25)'; g.beginPath(); g.ellipse(px + 2, py + 3, rr, rr * 0.6, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#b9b4aa'; g.beginPath(); g.ellipse(px, py, rr, rr * 0.65, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#d6d1c6'; g.beginPath(); g.ellipse(px - rr * 0.2, py - rr * 0.2, rr * 0.5, rr * 0.3, 0, 0, Math.PI * 2); g.fill();
      }, x, y, 14);
    }
    const gtex = new THREE.CanvasTexture(cv);
    gtex.colorSpace = THREE.SRGBColorSpace;
    gtex.wrapS = THREE.RepeatWrapping; gtex.wrapT = THREE.RepeatWrapping;
    gtex.repeat.set(GROUND / PERIOD, GROUND / PERIOD);
    gtex.anisotropy = 4;
    disposer.track(gtex);
    const gg = disposer.track(new THREE.PlaneGeometry(GROUND, GROUND));
    gg.rotateX(-Math.PI / 2);
    const field = new THREE.Mesh(gg, disposer.track(new THREE.MeshBasicMaterial({ map: gtex, depthWrite: false })));
    field.renderOrder = -5; field.frustumCulled = false;
    scene.add(field);

    // 중앙 패치 — village_ground.png 의 들판 가운데만, 가장자리는 부드럽게 섞는다
    const vt = art.textures['village_ground.png'];
    if (vt) {
      const t2 = vt.clone(); t2.needsUpdate = true;
      t2.repeat.set(0.74, 0.5); t2.offset.set(0.13, 0.3);
      disposer.track(t2);
      const ac = document.createElement('canvas'); ac.width = 128; ac.height = 128;
      const ag = ac.getContext('2d');
      const gr = ag.createRadialGradient(64, 64, 22, 64, 64, 64);
      gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
      ag.fillStyle = gr; ag.fillRect(0, 0, 128, 128);
      const am = new THREE.CanvasTexture(ac); disposer.track(am);
      const pg = disposer.track(new THREE.PlaneGeometry(WORLD_PATCH_W, WORLD_PATCH_D));
      pg.rotateX(-Math.PI / 2);
      const patch = new THREE.Mesh(pg, disposer.track(new THREE.MeshBasicMaterial({ map: t2, alphaMap: am, transparent: true, depthWrite: false })));
      patch.position.y = 0.005; patch.renderOrder = -4; patch.frustumCulled = false;
      scene.add(patch);
    }
  }
  const dirt = art.textures['dirt_tile.png'];
  if (dirt) { dirt.wrapS = THREE.RepeatWrapping; dirt.wrapT = THREE.RepeatWrapping; }
  const roadMats = {
    edge: disposer.track(new THREE.MeshBasicMaterial({ color: 0xa9884f, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })),
    main: disposer.track(new THREE.MeshBasicMaterial({ map: dirt || null, color: dirt ? 0xfff0e0 : 0xc9a27a, depthWrite: false, side: THREE.DoubleSide })),
  };
  // 길 — 모든 선분을 지오메트리 하나로 합친다(축 정렬 선분이라 uv = 월드 좌표/4)
  const roadMesh = (edges, width, mat, order, y) => {
    const h = width / 2; const pos = []; const uv = []; const idx = [];
    edges.forEach(([x0, z0, x1, z1]) => {
      const xa = Math.min(x0, x1) - h; const xb = Math.max(x0, x1) + h;
      const za = Math.min(z0, z1) - h; const zb = Math.max(z0, z1) + h;
      const k = pos.length / 3;
      pos.push(xa, y, za, xb, y, za, xb, y, zb, xa, y, zb);
      uv.push(xa / 4, za / 4, xb / 4, za / 4, xb / 4, zb / 4, xa / 4, zb / 4);
      idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = order; m.frustumCulled = false;
    return m;
  };

  // ── 월드(터 수에 따라 다시 짓는다) ───────────────────────────
  let world = null; // {group, plan, ents, decor, hl, chickens}
  let worldSig = '';
  let assign = new Map(); // 터 인덱스 -> bookId
  const others = []; // 밭이 아닌 layout 항목(보존)
  const meta = new Map(); // bookId -> {uid, x, y}
  let savedAssign = null;
  let moveSel = null;
  let destroyed = false;
  let lim = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };

  const hlBase = { transparent: true, depthWrite: false, depthTest: false };
  const hlMats = {
    sel: disposer.track(new THREE.MeshBasicMaterial({ ...hlBase, color: 0x4cc26a, opacity: 0.5 })),
    cand: disposer.track(new THREE.MeshBasicMaterial({ ...hlBase, color: 0xffffff, opacity: 0.32 })),
  };
  const hlGeo = disposer.track(new THREE.PlaneGeometry(1, 1));
  hlGeo.rotateX(-Math.PI / 2);
  const shGeo = disposer.track(new THREE.CircleGeometry(1, 16));
  shGeo.rotateX(-Math.PI / 2);
  const shMat = disposer.track(new THREE.MeshBasicMaterial({ color: 0x1f3a14, transparent: true, opacity: 0.22, depthWrite: false }));

  const destroyWorld = () => {
    if (!world) return;
    world.ents.forEach((e) => e.destroy());
    world.decor.destroy();
    world.chickens.forEach((c) => c.mat.dispose());
    scene.remove(world.group);
    world.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    world = null;
  };

  const buildWorld = (sizes) => {
    destroyWorld();
    const plan = planVillage(sizes);
    const group = new THREE.Group();
    scene.add(group);
    ctx.root = group;
    const decor = new CropLayer(ctx, group);
    group.add(roadMesh(plan.edges, ROAD_W + 0.5, roadMats.edge, -2, 0.02));
    group.add(roadMesh(plan.edges, ROAD_W, roadMats.main, -1, 0.03));
    const items = art.manifest.items || {};
    const treeTex = art.textures['tree_round.png'];
    const hallTex = art.textures['farmhouse.png'];
    const { hall, trees } = plan;
    const shadows = new THREE.InstancedMesh(shGeo, shMat, trees.length + 1);
    shadows.userData.shared = true;
    const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion();
    trees.forEach((t, i) => { m4.compose(new THREE.Vector3(t.x, 0.04, t.z), q, new THREE.Vector3(t.h * 0.42, 1, t.h * 0.3)); shadows.setMatrixAt(i, m4); });
    m4.compose(new THREE.Vector3(hall.x, 0.04, hall.z), q, new THREE.Vector3(hall.size * 0.4, 1, hall.size * 0.25));
    shadows.setMatrixAt(trees.length, m4);
    shadows.frustumCulled = false; shadows.renderOrder = 0;
    group.add(shadows);
    if (treeTex && trees.length) {
      const def = items.tree_round || { anchor: [0.5, 0.97] };
      const ar = treeTex.image.width / treeTex.image.height;
      decor.batch(treeTex, def.anchor, trees.map((t, i) => ({ pos: new THREE.Vector3(t.x, 0, t.z), w: t.h * ar, h: t.h, phase: i * 1.7, sway: 0.4 })));
    }
    if (hallTex) {
      const def = items.house || { anchor: [0.5, 0.8] };
      const ar = hallTex.image.width / hallTex.image.height;
      decor.batch(hallTex, def.anchor, [{ pos: new THREE.Vector3(hall.x, 0, hall.z), w: hall.size, h: hall.size / ar, phase: 0, sway: 0 }]);
    }
    const ents = new Map();
    const hl = new Map();
    plan.slots.forEach((s) => {
      const e = new SlotFieldEntity(ctx, s);
      ents.set(s.idx, e);
      const m = new THREE.Mesh(hlGeo, hlMats.cand);
      m.userData.shared = true;
      m.scale.set(e.dim.w + 0.4, 1, e.dim.d + 0.4);
      m.position.set(e.cx, 0.45, e.cz);
      m.renderOrder = 15; m.visible = false;
      group.add(m);
      hl.set(s.idx, m);
    });
    // 닭 — 길 위를 걷는다
    const chickens = [];
    const def = art.manifest.animals?.chicken;
    const frames = (def?.frames || []).map((f) => art.textures[f]);
    if (def && frames.length && frames.every(Boolean) && plan.adj.size) {
      const nodes = [...plan.adj.entries()].sort((a, b) => Math.hypot(a[1].x, a[1].z) - Math.hypot(b[1].x, b[1].z)).slice(0, 40);
      const cnt = Math.min(6, 2 + Math.floor(plan.slots.length / 6));
      const sz = spriteSize(frames[0], def, 1, 64);
      const geo = billboardGeo(art, sz.ax, sz.ay);
      for (let i = 0; i < cnt; i += 1) {
        const [key, nd] = nodes[(i * 7) % nodes.length];
        const mat = disposer.track(new THREE.MeshBasicMaterial({ map: frames[0], transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.scale.set(sz.w, sz.h, 1);
        mesh.userData.shared = true;
        group.add(mesh);
        chickens.push({ mesh, mat, sz, from: nd, fromKey: key, to: null, prevKey: null, t: 0, len: 1, flip: 1, fi: i, ft: 0, speed: 0.9 + (i % 3) * 0.25, ox: (i % 2 ? 0.25 : -0.25) });
      }
    }
    world = { group, plan, ents, decor, hl, chickens, frames, def };
    const b = plan.bounds;
    lim = { minX: Math.min(b.minX, -8), maxX: Math.max(b.maxX, 8), minZ: Math.min(b.minZ, -8), maxZ: Math.max(b.maxZ, 8) };
  };

  const isOpen = (idx) => !!world?.ents.has(idx);
  const refreshSlot = (idx) => {
    const e = world?.ents.get(idx);
    if (!e) return;
    const bid = assign.get(idx);
    e.setState({ book: bid != null ? ctx.books.get(String(bid)) || null : null });
  };
  const refreshAll = () => world?.ents.forEach((_, idx) => refreshSlot(idx));
  const drawHl = () => {
    world?.hl.forEach((m, idx) => {
      m.visible = moveSel != null;
      m.material = idx === moveSel ? hlMats.sel : hlMats.cand;
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

  const applyData = ({ layout, books }) => {
    ctx.books = new Map((books || []).map((b) => [String(b.id), b]));
    const idOf = new Map((books || []).map((b) => [String(b.id), b.id]));
    assign = new Map(); meta.clear(); others.length = 0;
    const placed = new Set();
    (layout || []).forEach((it) => {
      if (it.item_id !== 'field') { others.push(it); return; }
      const key = String(it.book_id);
      if (!ctx.books.has(key)) return;
      meta.set(idOf.get(key), { uid: it.uid, x: it.x ?? 0, y: it.y ?? 0 });
      const si = slotIndexOf(it.slot);
      if (si != null && !assign.has(si) && !placed.has(key)) { assign.set(si, idOf.get(key)); placed.add(key); }
    });
    // 슬롯 없는 단어장은 비어 있는 가장 작은 인덱스에 배정
    let next = 0;
    (books || []).forEach((b) => {
      if (placed.has(String(b.id))) return;
      while (assign.has(next)) next += 1;
      assign.set(next, b.id);
      if (!meta.has(b.id)) meta.set(b.id, { uid: `b${b.id}`, x: 0, y: 0 });
    });
    const sizes = [];
    assign.forEach((bid, idx) => {
      const b = ctx.books.get(String(bid));
      sizes[idx] = slotSizeFor(b?.word_count ?? cellStages(b).length);
    });
    for (let i = 0; i < sizes.length; i += 1) if (!sizes[i]) sizes[i] = undefined;
    const sig = Array.from(sizes, (v) => v || '-').join('');
    if (sig !== worldSig || !world) { buildWorld(sizes); worldSig = sig; }
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
    target.x = clamp(target.x, lim.minX, lim.maxX);
    target.z = clamp(target.z, lim.minZ, lim.maxZ);
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
    if (!world) return null;
    for (const e of world.ents.values()) if (e.contains(p.x, p.z, 0.3)) return e.slot.idx;
    // 이름 팻말이 터 위로 솟아 있으니 위쪽 여유를 조금 더 준다
    for (const e of world.ents.values()) if (e.contains(p.x, p.z + 1.2, 0.2)) return e.slot.idx;
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
    if (!isOpen(targetId) || targetId === moveSel) return;
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
        if (s != null && assign.has(s)) { moved = true; startMove(s); }
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
      if (s != null) {
        if (moveSel != null) trySwap(s);
        else if (assign.has(s)) callbacks.onTapField?.(assign.get(s));
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
    if (world) {
      const reach = dist * 1.5 + 8;
      world.ents.forEach((e) => {
        // 화면에서 멀리 벗어난 터는 그리기·update 모두 생략
        const near = Math.hypot(e.cx - target.x, e.cz - target.z) < reach;
        e.group.visible = near; e.crops.group.visible = near;
        if (near) e.update(dt, timeSec);
      });
      world.chickens.forEach((c) => stepChicken(c, dt, timeSec));
    }
    renderer.render(scene, camera);
  };
  const stepChicken = (c, dt) => {
    const adj = world.plan.adj;
    if (!c.to) {
      const nd = adj.get(c.fromKey);
      const opts = nd.to.filter((k) => k !== c.prevKey);
      const pick = (opts.length ? opts : nd.to);
      const k = pick[Math.floor(Math.random() * pick.length)];
      const t = adj.get(k);
      c.to = { key: k, x: t.x, z: t.z };
      c.len = Math.hypot(t.x - c.from.x, t.z - c.from.z) || 1; c.t = 0;
      const dx = t.x - c.from.x;
      if (Math.abs(dx) > 0.01) c.flip = dx > 0 ? -1 : 1; // 원본은 왼쪽 아래를 봄
    }
    c.t += (c.speed * dt) / c.len;
    if (c.t >= 1) { c.prevKey = c.fromKey; c.fromKey = c.to.key; c.from = adj.get(c.to.key); c.to = null; }
    const k = c.to ? c.t : 0; const a = c.from; const b = c.to || a;
    const x = a.x + (b.x - a.x) * k; const z = a.z + (b.z - a.z) * k;
    // 길 폭 안에서 닭마다 조금 비켜 걷는다
    const horiz = c.to ? Math.abs(b.x - a.x) > Math.abs(b.z - a.z) : true;
    const near = Math.hypot(x - target.x, z - target.z) < dist * 1.5 + 8;
    c.mesh.visible = near;
    if (!near) return;
    c.mesh.position.set(x + (horiz ? 0 : c.ox), 0.05, z + (horiz ? c.ox : 0));
    c.mesh.quaternion.copy(camera.quaternion);
    c.ft += dt;
    if (c.ft > 1 / (world.def.fps || 8)) { c.ft = 0; c.fi = (c.fi + 1) % 4; }
    c.mat.map = world.frames[(world.def.states?.walk || [0, 1, 2, 3])[c.fi % 4]] || world.frames[0];
    c.mesh.scale.x = c.sz.w * c.flip;
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
  dist = (11 / (Math.tan((FOV * Math.PI) / 360) * (viewW / viewH))) * 1.02;
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
      destroyWorld();
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
