// 밭 — 단어 1개 = 둔덕(plot_soil 데칼) 1개를 InstancedMesh 로, 작물은 CropLayer 로.
import * as THREE from 'three';
import Entity from './Entity';
import CropLayer from './CropLayer';
import {
  fieldDims, cellStages, surfaceFrame, cellSize, wrapX, planeGeo, COLORS, R,
} from '../farmArt';

const _m = new THREE.Matrix4();

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
    this.mounds = null;
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
    const cells = [];
    for (let i = 0; i < n; i += 1) {
      const col = i % d.cols; const row = Math.floor(i / d.cols);
      const gx = wrapX(this.x + (col + 0.5) * sx, ctx.gw); const gy = this.y + (row + 0.5) * sy;
      const f = surfaceFrame(gx, gy, ctx.gw, ctx.gh);
      const cs = cellSize(gy, ctx.gw, ctx.gh);
      cells.push({ f, mw: cs.cw * sx, mh: cs.ch * sy, pos: f.n.clone().multiplyScalar(R + 0.03), size: Math.min(cs.cw * sx, cs.ch * sy * 1.4) });
    }
    // 둔덕
    if (this.mounds) { this.group.remove(this.mounds); this.mounds.dispose(); this.mounds = null; }
    if (n > 0) {
      const tex = ctx.art.textures['plot_soil.png'];
      let geom = ctx.art.flatPlane;
      if (!geom) { geom = planeGeo(ctx.art).clone(); geom.rotateX(-Math.PI / 2); ctx.disposer.track(geom); ctx.art.flatPlane = geom; }
      const mat = ctx.art.moundMat || (ctx.art.moundMat = ctx.disposer.track(new THREE.MeshBasicMaterial({
        map: tex || null, color: tex ? 0xffffff : COLORS.soil, transparent: true, alphaTest: 0.3,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })));
      const mesh = new THREE.InstancedMesh(geom, mat, n);
      cells.forEach((c, i) => {
        _m.makeBasis(c.f.east.clone().multiplyScalar(c.mw * 1.05), c.f.n, c.f.south.clone().multiplyScalar(c.mh * 1.05));
        _m.setPosition(c.f.n.clone().multiplyScalar(R + 0.025));
        mesh.setMatrixAt(i, _m);
      });
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      this.mounds = mesh;
      // 밭 그룹은 구 중심 기준 월드 좌표를 쓰므로 그룹 위치를 원점으로 둔다
      this.group.position.set(0, 0, 0);
      ctx.root.add(mesh);
      this.moundHost = mesh;
    }
    this.crops.build(cells, stages, book?.crop_type || 'carrot');
    // 이름 팻말 — 밭 위에 떠 있는 라벨
    if (this.label) { this.group.remove(this.label); this.label.material.dispose(); }
    this.label = labelSprite(ctx, book?.name || '');
    const fp = this.footprint();
    const lf = surfaceFrame(fp.x + fp.w / 2, fp.y - 0.2, ctx.gw, ctx.gh);
    this.label.position.copy(lf.n.clone().multiplyScalar(R + 1.3));
    this.group.add(this.label);
    this.n = this.frame.n;
  }

  place(gx, gy) {
    super.place(gx, gy);
    this.group.position.set(0, 0, 0);
  }

  update() {}

  hitTest(raycaster, cell) {
    if (!cell) return null;
    const fp = this.footprint();
    return cell.gx >= fp.x && cell.gx < fp.x + fp.w && cell.gy >= fp.y && cell.gy < fp.y + fp.h ? 1e6 : null;
  }

  destroy() {
    this.crops.destroy();
    if (this.mounds) { this.ctx.root.remove(this.mounds); this.mounds.dispose(); }
    this.label?.material.dispose();
    super.destroy();
  }
}
