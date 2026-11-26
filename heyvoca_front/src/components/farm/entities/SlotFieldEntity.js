// 밭 터 한 칸 — 잠긴 터(구름)·빈 열린 터(빈 이랑 + "단어장 추가" 말풍선)·단어장이 있는 터(이랑 박스 + 작물 + 이름 팻말).
import * as THREE from 'three';
import Entity from './Entity';
import CropLayer from './CropLayer';
import { cellStages, part, COLORS } from '../farmArt';
import { SLOT_SIZES, toWorld } from '../villageMap';

const BASE_H = 0.3;

const roundedRect = (w, h, r0) => {
  const r = Math.min(r0, w / 2, h / 2);
  const x = -w / 2; const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
};
const hashStr = (str) => {
  let h = 2166136261;
  const t = String(str);
  for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 말풍선/팻말 스프라이트 — 아래 중앙이 기준점 */
export const textSprite = (ctx, text, { lock = false, dot = null, dark = false } = {}) => {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 112;
  const g = c.getContext('2d');
  g.fillStyle = dark ? 'rgba(90,70,48,0.95)' : 'rgba(255,248,230,0.96)';
  g.beginPath(); g.roundRect(6, 6, 372, 72, 36); g.fill();
  g.beginPath(); g.moveTo(172, 76); g.lineTo(192, 104); g.lineTo(212, 76); g.closePath(); g.fill();
  const ink = dark ? '#fff8e6' : '#5a4630';
  let tx = 192;
  if (lock) {
    g.fillStyle = ink; g.beginPath(); g.roundRect(46, 38, 34, 28, 6); g.fill();
    g.strokeStyle = ink; g.lineWidth = 6; g.beginPath(); g.arc(63, 38, 11, Math.PI, 0); g.stroke();
    tx = 216;
  } else if (dot) {
    g.fillStyle = dot; g.beginPath(); g.arc(52, 42, 14, 0, Math.PI * 2); g.fill();
    tx = 214;
  }
  g.fillStyle = ink; g.font = '700 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(Array.from(text || '').slice(0, 10).join(''), tx, 43);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  ctx.disposer.track(tex);
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false });
  ctx.disposer.track(mat);
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0.06);
  s.scale.set(3.4, 0.99, 1);
  s.renderOrder = 20;
  return s;
};

export default class SlotFieldEntity extends Entity {
  constructor(ctx, slot) {
    super(ctx, { uid: `slot_${slot.id}`, item_id: 'field', x: 0, y: 0 });
    this.slot = slot;
    const w = toWorld(slot.x, slot.y);
    this.cx = w.x; this.cz = w.z;
    this.dim = SLOT_SIZES[slot.size];
    this.crops = new CropLayer(ctx, ctx.root);
    this.content = null;
    this.geos = [];
    this.bobs = [];
    this.state = null;
  }

  contains(x, z, margin = 0.3) {
    return Math.abs(x - this.cx) <= this.dim.w / 2 + margin && Math.abs(z - this.cz) <= this.dim.d / 2 + margin;
  }

  mats() {
    const a = this.ctx.art;
    if (!a.slotMats) {
      const soil = a.textures['soil_cell.png'];
      if (soil) { soil.wrapS = THREE.RepeatWrapping; soil.wrapT = THREE.RepeatWrapping; soil.repeat.set(0.5, 0.5); }
      const d = this.ctx.disposer;
      a.slotMats = {
        rim: d.track(new THREE.MeshLambertMaterial({ color: 0x8a5e3a })),
        top: d.track(new THREE.MeshLambertMaterial({ map: soil || null, color: soil ? 0xffffff : 0xa8764a })),
        cloud: d.track(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xdfe9f2, emissiveIntensity: 0.55 })),
      };
    }
    return a.slotMats;
  }

  clearContent() {
    if (this.content) {
      this.group.remove(this.content);
      this.content.traverse((o) => { if (o.isSprite) o.material.dispose(); });
    }
    this.geos.forEach((g) => g.dispose());
    this.geos = []; this.bobs = []; this.content = null;
    this.crops.clear();
  }

  /** state: {locked, book|null} */
  setState(state) {
    this.state = state;
    const { ctx, cx, cz } = this;
    const { w, d } = this.dim;
    const m = this.mats();
    this.clearContent();
    const content = new THREE.Group();
    this.content = content;
    this.group.add(content);
    if (state.locked) {
      const rnd = rng(hashStr(this.slot.id));
      const n = this.slot.size === 'L' ? 11 : this.slot.size === 'M' ? 8 : 5;
      const sg = new THREE.SphereGeometry(1, 10, 8);
      this.geos.push(sg);
      for (let i = 0; i < n; i += 1) {
        const s = new THREE.Mesh(sg, m.cloud);
        const r = 0.9 + rnd() * 0.7;
        s.scale.set(r * 1.2, r * 0.8, r);
        s.position.set(cx + (rnd() - 0.5) * w * 0.85, 0.9 + rnd() * 0.5, cz + (rnd() - 0.5) * d * 0.85);
        content.add(s);
        this.bobs.push({ o: s, base: s.position.y, ph: rnd() * 6.28, amp: 0.12 });
      }
      const b = textSprite(ctx, '잠겨 있어요', { lock: true });
      b.position.set(cx, 2.1, cz);
      content.add(b);
      this.bobs.push({ o: b, base: 2.1, ph: 0, amp: 0.08 });
      return;
    }
    const baseG = new THREE.ExtrudeGeometry(roundedRect(w, d, 0.6), { depth: BASE_H, bevelEnabled: false, curveSegments: 6 });
    baseG.rotateX(-Math.PI / 2);
    const topG = new THREE.ShapeGeometry(roundedRect(w - 0.7, d - 0.7, 0.35), 6);
    topG.rotateX(-Math.PI / 2);
    topG.translate(0, BASE_H + 0.01, 0);
    this.geos.push(baseG, topG);
    const block = new THREE.Group();
    block.position.set(cx, 0.02, cz);
    block.add(new THREE.Mesh(baseG, m.rim), new THREE.Mesh(topG, m.top));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      block.add(part(ctx.art, 'cone', COLORS.leaf, [0.09, 0.28, 0.09], [sx * (w / 2 - 0.2), BASE_H + 0.1, sz * (d / 2 - 0.2)]));
    });
    content.add(block);
    const book = state.book;
    if (!book) {
      const b = textSprite(ctx, '단어장 추가');
      b.position.set(cx, 1.3, cz);
      content.add(b);
      this.bobs.push({ o: b, base: 1.3, ph: 0, amp: 0.1 });
      return;
    }
    // 작물 — 단어마다 1개(터 최대 개수까지 비율대로 표본), 고르게 + 약간 무작위
    const all = cellStages(book);
    const max = this.dim.max;
    const stages = all.length <= max ? all : Array.from({ length: max }, (_, i) => all[Math.floor((i * all.length) / max)]);
    const n = stages.length;
    const iw = w - 0.9; const ih = d - 0.9;
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * iw) / ih)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const sx = iw / cols; const sz = ih / rows;
    const rnd = rng(hashStr(book.id));
    const cells = [];
    for (let i = 0; i < n; i += 1) {
      const c = i % cols; const r = Math.floor(i / cols);
      const px = cx - iw / 2 + (c + 0.5) * sx + (rnd() - 0.5) * sx * 0.5;
      const pz = cz - ih / 2 + (r + 0.5) * sz + (rnd() - 0.5) * sz * 0.5;
      cells.push({ pos: new THREE.Vector3(px, BASE_H + 0.04, pz).addScaledVector(ctx.camDir, 0.1), size: Math.min(Math.max((sx + sz) / 2, 0.5), 0.9) });
    }
    this.crops.buildCrops(cells, stages, book.crop_type || 'carrot');
    const color = /^#[0-9a-f]{3,8}$/i.test(book.color || '') ? book.color : '#6fba5a';
    const lab = textSprite(ctx, book.name || '', { dot: color });
    lab.position.set(cx, 1.5, cz - d / 2 + 0.2);
    content.add(lab);
  }

  update(dt, t) {
    this.bobs.forEach((b) => { b.o.position.y = b.base + Math.sin(t * 1.2 + b.ph) * b.amp; });
  }

  destroy() {
    this.clearContent();
    this.crops.destroy();
    super.destroy();
  }
}
