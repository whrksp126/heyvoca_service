// 울타리 — 칸 중앙 기둥 + 4방향 이웃 울타리 쪽 가로대(직선·직각·T·십자 자동). 3D 저폴리 메시.
import Entity, { orientFlat } from './Entity';
import { part, COLORS } from '../farmArt';

export default class FenceEntity extends Entity {
  constructor(ctx, data) {
    super(ctx, data);
    this.neigh = [false, false, false, false]; // 북, 남, 서, 동
    this.body = null;
    this.flat = true;
  }

  setNeighbors(n, s, w, e) {
    const next = [n, s, w, e];
    if (next.every((v, i) => v === this.neigh[i])) return;
    this.neigh = next;
    this.build();
  }

  build() {
    const { art } = this.ctx;
    if (this.body) this.group.remove(this.body);
    const body = new this.group.constructor();
    body.add(part(art, 'cyl', COLORS.woodLight, [0.08, 0.55, 0.08], [0, 0.275, 0]));
    body.add(part(art, 'sph', COLORS.woodLight, [0.11, 0.1, 0.11], [0, 0.57, 0]));
    const [n, s, w, e] = this.neigh;
    [0.2, 0.4].forEach((y) => {
      if (e) body.add(part(art, 'box', COLORS.wood, [0.5, 0.07, 0.06], [0.25, y, 0]));
      if (w) body.add(part(art, 'box', COLORS.wood, [0.5, 0.07, 0.06], [-0.25, y, 0]));
      if (s) body.add(part(art, 'box', COLORS.wood, [0.06, 0.07, 0.5], [0, y, 0.25]));
      if (n) body.add(part(art, 'box', COLORS.wood, [0.06, 0.07, 0.5], [0, y, -0.25]));
    });
    this.body = body;
    this.group.add(body);
  }

  render() {
    this.place();
    orientFlat(this.group, this.frame, 0);
    this.build();
  }
}
