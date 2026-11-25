// 농장 엔티티 기본 클래스 — 격자 위치(x,y)·회전(rot)·발판(footprint)과 구면 배치 공통 처리.
import * as THREE from 'three';
import { surfaceFrame } from '../farmArt';

const _m = new THREE.Matrix4();
export const UNIT = Math.SQRT2; // 타일 한 칸 화면 폭(마름모 대각) = 월드 √2

/** 카메라를 향한 세운 스프라이트 자세 */
export const orientBillboard = (obj, camQuat) => { obj.quaternion.copy(camQuat); };

/** 표면 기준 자세(동·법선·남) 후 법선축 회전 */
export const orientFlat = (obj, frame, rotDeg) => {
  obj.quaternion.setFromRotationMatrix(_m.makeBasis(frame.east, frame.n, frame.south));
  obj.rotateY(-(rotDeg * Math.PI) / 180);
};

export default class Entity {
  constructor(ctx, data) {
    this.ctx = ctx;
    this.uid = data.uid;
    this.itemId = data.item_id;
    this.bookId = data.book_id ?? null;
    this.x = data.x;
    this.y = data.y;
    this.rot = data.rot || 0;
    this.valid = true;
    this.facing = true; // 카메라 쪽 반구인지
    this.group = new THREE.Group();
    this.frame = null;
    ctx.root.add(this.group);
  }

  get category() { return this.ctx.catalog.get(this.itemId)?.category || 'deco'; }

  baseSize() { const c = this.ctx.catalog.get(this.itemId) || {}; return { w: c.w || 1, h: c.h || 1 }; }

  footprint() {
    const { w, h } = this.baseSize();
    const swap = this.rot === 90 || this.rot === 270;
    return { x: this.x, y: this.y, w: swap ? h : w, h: swap ? w : h };
  }

  /** 위치가 바뀔 때 호출 — 중심 칸의 표면 프레임 갱신 */
  place(gx, gy) {
    const fp = this.footprint();
    this.frame = surfaceFrame(gx ?? fp.x + fp.w / 2, gy ?? fp.y + fp.h / 2, this.ctx.gw, this.ctx.gh);
    this.group.position.copy(this.frame.pos);
  }

  render() { this.place(); }

  update() {}

  /** 선택·탭 판정 — 그림이 있으면 레이캐스트, 없으면 발판 칸 포함 여부 */
  hitTest(raycaster, cell) {
    const hits = raycaster.intersectObject(this.group, true);
    if (hits.length) return hits[0].distance;
    if (cell && this.flat) {
      const fp = this.footprint();
      if (cell.gx >= fp.x && cell.gx < fp.x + fp.w && cell.gy >= fp.y && cell.gy < fp.y + fp.h) return 1e6;
    }
    return null;
  }

  destroy() {
    this.ctx.root.remove(this.group);
    this.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  }
}
