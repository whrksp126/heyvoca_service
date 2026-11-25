// 울타리 — 3D 저폴리 기둥+가로대. rot 로 진짜 회전, 같은 축 이웃과 이어진다(끝 기둥 생략).
import Entity, { orientFlat } from './Entity';
import { part, cellSize, COLORS } from '../farmArt';

export default class FenceEntity extends Entity {
  constructor(ctx, data) {
    super(ctx, data);
    this.neigh = [false, false];
    this.body = null;
    this.flat = true;
  }

  axisX() { return this.rot === 0 || this.rot === 180; }

  setNeighbors(a, b) {
    if (this.neigh[0] === a && this.neigh[1] === b) return;
    this.neigh = [a, b];
    this.build();
  }

  build() {
    const { art } = this.ctx;
    if (this.body) { this.group.remove(this.body); }
    const cs = cellSize(this.y + 0.5, this.ctx.gw, this.ctx.gh);
    const L = (this.axisX() ? cs.cw : cs.ch) * 1.0;
    const body = new (this.group.constructor)();
    const post = (x) => body.add(part(art, 'cyl', COLORS.woodLight, [0.055, 0.5, 0.055], [x, 0.25, 0]));
    const cap = (x) => body.add(part(art, 'sph', COLORS.woodLight, [0.075, 0.07, 0.075], [x, 0.52, 0]));
    post(0); cap(0);
    if (!this.neigh[0]) { post(-L / 2); cap(-L / 2); }
    if (!this.neigh[1]) { post(L / 2); cap(L / 2); }
    [0.18, 0.36].forEach((y) => body.add(part(art, 'box', COLORS.wood, [L, 0.06, 0.05], [0, y, 0])));
    this.body = body;
    this.group.add(body);
  }

  render() {
    this.place();
    orientFlat(this.group, this.frame, this.rot);
    this.build();
  }
}
