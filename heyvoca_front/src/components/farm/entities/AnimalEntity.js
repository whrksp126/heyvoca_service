// 동물 — 프레임 애니 상태 기계(idle·walk·peck·happy·sad), 지표면 이동, 화면상 이동 방향에 따라 좌우 뒤집기.
import * as THREE from 'three';
import Entity, { orientBillboard, UNIT } from './Entity';
import { billboardGeo, spriteSize, buildFallback } from '../farmArt';

export default class AnimalEntity extends Entity {
  constructor(ctx, data) {
    super(ctx, data);
    this.fx = data.x + 0.5; this.fy = data.y + 0.5;
    this.tx = null; this.ty = null;
    this.state = 'idle'; this.stateT = 0; this.wait = 1 + Math.random() * 3;
    this.lastTap = 0; this.age = 0; this.flip = 1; this.fi = 0; this.ft = 0;
    this.def = ctx.art.manifest.animals?.[this.itemId];
    const frames = (this.def?.frames || []).map((f) => ctx.art.textures[f]);
    this.hasFrames = frames.length > 0 && frames.every(Boolean);
    if (this.hasFrames) {
      this.frames = frames;
      const sz = spriteSize(frames[0], this.def, UNIT);
      this.sz = sz;
      this.mat = ctx.disposer.track(new THREE.MeshBasicMaterial({ map: frames[0], transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
      this.mesh = new THREE.Mesh(billboardGeo(ctx.art, sz.ax, sz.ay), this.mat);
      this.mesh.scale.set(sz.w, sz.h, 1);
    } else {
      this.mesh = buildFallback(ctx.art, this.itemId, 'animal');
      this.mesh.scale.setScalar(UNIT * 1.3);
    }
    this.group.add(this.mesh);
  }

  render() {
    this.fx = this.x + 0.5; this.fy = this.y + 0.5; this.tx = null;
    this.place(this.fx, this.fy);
  }

  tap() { this.setState('happy'); this.lastTap = this.age; }

  setState(s) { this.state = s; this.stateT = 0; this.fi = 0; this.ft = 0; }

  update(dt, t, edit) {
    this.age += dt; this.stateT += dt;
    const ctx = this.ctx;
    if (!edit) {
      if (this.state === 'walk') {
        const dx = this.tx - this.fx; const dy = this.ty - this.fy;
        const dist = Math.hypot(dx, dy); const step = 0.7 * dt;
        if (dist <= step) { this.fx = this.tx; this.fy = this.ty; this.setState('idle'); this.wait = 1.5 + Math.random() * 3; } else {
          const nx = this.fx + (dx / dist) * step; const ny = this.fy + (dy / dist) * step;
          if (ctx.isBlocked(Math.floor(nx), Math.floor(ny), this)) this.setState('idle'); else { this.fx = nx; this.fy = ny; }
          const sx = dx - dy; if (Math.abs(sx) > 0.01) this.flip = sx > 0 ? -1 : 1; // 원본은 왼쪽 아래를 봄
        }
      } else if (this.state === 'idle') {
        this.wait -= dt;
        if (this.age - this.lastTap > 150 && Math.random() < dt * 0.02) this.setState('sad');
        else if (this.wait <= 0) {
          this.wait = 1.5 + Math.random() * 3;
          if (Math.random() < 0.3) this.setState('peck');
          else {
            for (let i = 0; i < 6; i += 1) {
              const cx = Math.floor(this.fx) + Math.round((Math.random() - 0.5) * 6);
              const cy = Math.floor(this.fy) + Math.round((Math.random() - 0.5) * 6);
              if (Math.abs(cx - this.x) <= 4 && Math.abs(cy - this.y) <= 4 && !ctx.isBlocked(cx, cy, this)) { this.tx = cx + 0.5; this.ty = cy + 0.5; this.setState('walk'); break; }
            }
          }
        }
      } else if ((this.state === 'peck' && this.stateT > 1.2) || (this.state === 'happy' && this.stateT > 1.2) || (this.state === 'sad' && this.stateT > 4)) {
        this.setState('idle');
      }
      this.place(this.fx, this.fy);
    }
    // 프레임 애니
    if (this.hasFrames) {
      const seq = this.def.states?.[this.state] || [0];
      this.ft += dt;
      const fps = this.def.fps || 8;
      if (seq.length > 1 && this.ft > 1 / fps) { this.ft = 0; this.fi = (this.fi + 1) % seq.length; }
      this.mat.map = this.frames[seq[this.fi % seq.length]] || this.frames[0];
      this.mesh.scale.x = this.sz.w * this.flip;
    } else this.mesh.scale.x = Math.abs(this.mesh.scale.x) * this.flip;
    let hop = 0;
    if (this.state === 'walk') hop = Math.abs(Math.sin(t * 9)) * 0.08;
    if (this.state === 'happy') hop = Math.abs(Math.sin(this.stateT * 8)) * 0.25;
    this.mesh.position.y = hop;
    orientBillboard(this.group, ctx.camera.quaternion);
  }
}
