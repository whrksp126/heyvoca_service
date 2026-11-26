// 나무·장식·땅 — PNG 가 있으면 법선축 빌보드, 없으면 저폴리 3D 도형. 땅(ground)은 표면 데칼.
import * as THREE from 'three';
import Entity, { orientBillboard, orientFlat, UNIT } from './Entity';
import {
  billboardGeo, spriteSize, buildFallback, planeGeo,
} from '../farmArt';

export default class DecorEntity extends Entity {
  constructor(ctx, data) {
    super(ctx, data);
    this.phase = Math.random() * 6.28;
    this.shake = 0;
    this.mode = 'fallback';
    this.flat = this.category === 'ground';
    this.build();
  }

  build() {
    const { art, disposer } = this.ctx;
    if (this.flat) {
      const g = planeGeo(art).clone(); g.rotateX(-Math.PI / 2); disposer.track(g);
      const pathTex = this.itemId === 'path_tile' && art.textures['path_tile.png'];
      if (pathTex) { this.pathTex = pathTex.clone(); this.pathTex.wrapS = THREE.RepeatWrapping; this.pathTex.wrapT = THREE.RepeatWrapping; this.pathTex.needsUpdate = true; disposer.track(this.pathTex); }
      const mat = disposer.track(new THREE.MeshBasicMaterial({ map: this.pathTex || null, color: this.pathTex ? 0xffffff : 0xd9c08f, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
      const m = new THREE.Mesh(g, mat);
      const fp = this.footprint(); m.scale.set(fp.w, 1, fp.h);
      this.mesh = m; this.group.add(m); this.mode = 'flat';
      return;
    }
    const def = art.manifest.items?.[this.itemId];
    const tex = def?.src && art.textures[def.src];
    if (tex) {
      const sz = spriteSize(tex, def, UNIT);
      const mat = disposer.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
      const m = new THREE.Mesh(billboardGeo(art, sz.ax, sz.ay), mat);
      m.scale.set(sz.w, sz.h, 1);
      this.mesh = m; this.group.add(m); this.mode = 'bill';
    } else {
      this.mesh = buildFallback(art, this.itemId, this.category);
      this.mesh.scale.setScalar(UNIT * 1.1);
      this.group.add(this.mesh);
    }
  }

  render() {
    this.place();
    if (this.flat) { const fp = this.footprint(); this.mesh.scale.set(fp.w, 1, fp.h); if (this.pathTex) { this.pathTex.repeat.set(fp.w / 2, fp.h / 2); this.pathTex.offset.set(fp.x / 2, -(fp.y + fp.h) / 2); } this.group.position.y = 0.02; }
    this.pose();
  }

  pose() {
    if (this.mode === 'bill') orientBillboard(this.group, this.ctx.camera.quaternion);
    else orientFlat(this.group, this.frame, this.rot);
  }

  tap() { this.shake = 1; }

  update(dt, t) {
    if (this.mode === 'bill') this.pose();
    if (this.mode === 'flat') return;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.4);
    const sw = Math.sin(t * 1.4 + this.phase) * 0.02 + Math.sin(t * 30) * 0.05 * this.shake * this.shake;
    this.mesh.rotation.z = sw;
  }
}
