// 밭 — 칸 구분 없는 이어진 흙밭 1덩어리(둥근 모서리로 살짝 솟은 박스 + 도톰한 테두리 띠) 위에 단어마다 작물 1개.
import * as THREE from 'three';
import Entity from './Entity';
import CropLayer from './CropLayer';
import { fieldDims, cellStages, surfaceFrame, part, COLORS } from '../farmArt';

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

const BASE_H = 0.3;

const labelSprite = (ctx, text) => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,248,230,0.94)';
  g.beginPath(); g.roundRect(4, 8, 248, 48, 24); g.fill();
  g.fillStyle = '#5a4630'; g.font = '700 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(Array.from(text || '').slice(0, 9).join(''), 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  ctx.disposer.track(tex);
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
  ctx.disposer.track(mat);
  const s = new THREE.Sprite(mat);
  s.scale.set(2.2, 0.55, 1);
  return s;
};

export default class FieldEntity extends Entity {
  constructor(ctx, data) {
    super(ctx, data);
    this.flat = true;
    this.rot = 0;
    this.crops = new CropLayer(ctx, ctx.root);
    this.block = null;
    this.geos = [];
    this.label = null;
  }

  dims() {
    const c = this.ctx.catalog.get(this.itemId) || {};
    return fieldDims(this.ctx.books.get(this.bookId), c.w || 2, c.h || 2);
  }

  baseSize() { const d = this.dims(); return { w: d.fw, h: d.fh }; }

  setCrop() { this.render(); }

  place(gx, gy) {
    super.place(gx, gy);
    this.group.position.set(0, 0, 0);
  }

  clearBlock() {
    if (this.block) this.group.remove(this.block);
    this.geos.forEach((g) => g.dispose());
    this.geos = [];
    this.block = null;
  }

  mats() {
    const a = this.ctx.art;
    if (!a.fieldMats) {
      const soil = a.textures['soil_cell.png'];
      if (soil) { soil.wrapS = THREE.RepeatWrapping; soil.wrapT = THREE.RepeatWrapping; soil.repeat.set(0.5, 0.5); }
      a.fieldMats = {
        rim: this.ctx.disposer.track(new THREE.MeshLambertMaterial({ color: 0x8a5e3a })),
        top: this.ctx.disposer.track(new THREE.MeshLambertMaterial({ map: soil || null, color: soil ? 0xffffff : 0xa8764a })),
      };
    }
    return a.fieldMats;
  }

  render() {
    this.place();
    const { ctx } = this;
    const d = this.dims();
    const fp = this.footprint();
    const book = ctx.books.get(this.bookId);
    const stages = cellStages(book);
    const center = surfaceFrame(fp.x + fp.w / 2, fp.y + fp.h / 2, ctx.gw, ctx.gh).pos;
    const m = this.mats();
    this.clearBlock();
    const block = new THREE.Group();
    block.position.copy(center);
    const baseG = new THREE.ExtrudeGeometry(roundedRect(fp.w, fp.h, 0.6), { depth: BASE_H, bevelEnabled: false, curveSegments: 6 });
    baseG.rotateX(-Math.PI / 2);
    const topG = new THREE.ShapeGeometry(roundedRect(fp.w - 0.7, fp.h - 0.7, 0.35), 6);
    topG.rotateX(-Math.PI / 2);
    topG.translate(0, BASE_H + 0.01, 0);
    this.geos.push(baseG, topG);
    block.add(new THREE.Mesh(baseG, m.rim), new THREE.Mesh(topG, m.top));
    // 모서리 풀 포기
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      block.add(part(ctx.art, 'cone', COLORS.leaf, [0.09, 0.28, 0.09], [sx * (fp.w / 2 - 0.2), BASE_H + 0.1, sz * (fp.h / 2 - 0.2)]));
      block.add(part(ctx.art, 'cone', COLORS.leafLight, [0.07, 0.2, 0.07], [sx * (fp.w / 2 - 0.3), BASE_H + 0.07, sz * (fp.h / 2 - 0.15)]));
    });
    this.block = block;
    this.group.add(block);

    // 작물 — 단어마다 1개, 안쪽 영역에 고르게 + 약간 무작위
    const n = Math.min(stages.length, d.cols * d.rows);
    const iw = Math.max(0.5, fp.w - 0.9); const ih = Math.max(0.5, fp.h - 0.9);
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * iw) / ih)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const sx = iw / cols; const sz = ih / rows;
    const rnd = rng(hashStr(this.bookId || this.uid));
    const cells = [];
    for (let i = 0; i < n; i += 1) {
      const c = i % cols; const r = Math.floor(i / cols);
      const px = center.x - iw / 2 + (c + 0.5) * sx + (rnd() - 0.5) * sx * 0.5;
      const pz = center.z - ih / 2 + (r + 0.5) * sz + (rnd() - 0.5) * sz * 0.5;
      cells.push({ pos: new THREE.Vector3(px, BASE_H + 0.02, pz).addScaledVector(ctx.camDir, 0.1), size: Math.min(Math.max((sx + sz) / 2, 0.5), 0.9) });
    }
    this.crops.clear();
    this.crops.buildCrops(cells, stages, book?.crop_type || 'carrot');

    if (this.label) { this.group.remove(this.label); this.label.material.dispose(); }
    this.label = labelSprite(ctx, book?.name || '');
    this.label.position.set(center.x, 1.8, center.z - fp.h / 2);
    this.group.add(this.label);
  }

  hitTest(raycaster, cell) {
    if (!cell) return null;
    const fp = this.footprint();
    return cell.gx >= fp.x && cell.gx < fp.x + fp.w && cell.gy >= fp.y && cell.gy < fp.y + fp.h ? 1e6 : null;
  }

  destroy() {
    this.crops.destroy();
    this.clearBlock();
    this.label?.material.dispose();
    super.destroy();
  }
}
