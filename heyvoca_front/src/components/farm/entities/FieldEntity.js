// 밭 — 단어 1개 = 둔덕(plot_soil 데칼) 1개를 InstancedMesh 로, 작물은 CropLayer 로.
import * as THREE from 'three';
import Entity from './Entity';
import CropLayer from './CropLayer';
import { fieldDims, cellStages, surfaceFrame } from '../farmArt';


const labelSprite = (ctx, text) => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,248,230,0.94)';
  g.beginPath(); g.roundRect(4, 8, 248, 48, 24); g.fill();
  g.fillStyle = '#5a4630'; g.font = '700 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const t = Array.from(text || '').slice(0, 9).join('');
  g.fillText(t, 128, 33);
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
    this.label = null;
  }

  dims() {
    const c = this.ctx.catalog.get(this.itemId) || {};
    return fieldDims(this.ctx.books.get(this.bookId), c.w || 2, c.h || 2);
  }

  baseSize() { const d = this.dims(); return { w: d.fw, h: d.fh }; }

  setCrop() { this.render(); }

  render() {
    this.place();
    const { ctx } = this;
    const d = this.dims();
    const book = ctx.books.get(this.bookId);
    const stages = cellStages(book);
    const n = Math.min(Math.max(stages.length, 0), d.cols * d.rows);
    const sx = d.fw / d.cols; const sy = d.fh / d.rows;
    const avg = (sx + sy) / 2;
    const back = ctx.camDir; // 카메라 쪽 방향(단위벡터)
    const cells = []; const moundItems = [];
    for (let i = 0; i < n; i += 1) {
      const col = i % d.cols; const row = Math.floor(i / d.cols);
      const f = surfaceFrame(this.x + (col + 0.5) * sx, this.y + (row + 0.5) * sy, ctx.gw, ctx.gh);
      // 둔덕 스프라이트는 칸 중심, 작물은 같은 칸 둔덕보다 약간 카메라 쪽(깊이 우선)
      const mp = f.pos.clone(); mp.y = 0.02;
      moundItems.push({ pos: mp, w: avg * Math.SQRT2 * 1.04, h: avg * Math.SQRT2 * 1.04, phase: 0, sway: 0 });
      cells.push({ pos: mp.clone().addScaledVector(back, 0.15), size: avg });
    }
    // 둔덕은 뒤(멀리)에서 앞 순서로 정렬해 겹침이 자연스럽게
    const sorted = moundItems.map((it, i) => ({ it, k: it.pos.x + it.pos.z, i })).sort((p, q) => p.k - q.k);
    this.crops.clear();
    const tex = ctx.art.textures['plot_soil.png'] || this.fallbackSoil();
    this.crops.batch(tex, [0.5, 0.5], sorted.map((o) => o.it));
    this.crops.buildCrops(cells, stages, book?.crop_type || 'carrot');
    // 이름 팻말 — 밭 위에 떠 있는 라벨
    if (this.label) { this.group.remove(this.label); this.label.material.dispose(); }
    this.label = labelSprite(ctx, book?.name || '');
    const fp = this.footprint();
    const lf = surfaceFrame(fp.x + fp.w / 2, fp.y - 0.2, ctx.gw, ctx.gh);
    this.label.position.copy(lf.pos).setY(1.6);
    this.group.add(this.label);
  }

  place(gx, gy) {
    super.place(gx, gy);
    this.group.position.set(0, 0, 0);
  }

  fallbackSoil() {
    if (!this.ctx.art.soilFb) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d'); g.fillStyle = '#a8764a';
      g.beginPath(); g.moveTo(32, 6); g.lineTo(62, 32); g.lineTo(32, 58); g.lineTo(2, 32); g.closePath(); g.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      this.ctx.disposer.track(t);
      this.ctx.art.soilFb = t;
    }
    return this.ctx.art.soilFb;
  }

  update() {}

  hitTest(raycaster, cell) {
    if (!cell) return null;
    const fp = this.footprint();
    return cell.gx >= fp.x && cell.gx < fp.x + fp.w && cell.gy >= fp.y && cell.gy < fp.y + fp.h ? 1e6 : null;
  }

  destroy() {
    this.crops.destroy();
    this.label?.material.dispose();
    super.destroy();
  }
}
