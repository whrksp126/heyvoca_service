// 스프라이트 InstancedMesh 배치 — 단계별 작물과 밭 둔덕. 셰이더에서 카메라 평면 빌보드 + 바닥 고정 바람 흔들림.
import * as THREE from 'three';
import { billboardGeo, getCropTex, spriteSize, cropStageCount } from '../farmArt';

const VERT = `
uniform vec3 uRight; uniform vec3 uUp; uniform float uTime;
attribute vec4 aInfo; // w, h, phase, 흔들림 세기
varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 o = (instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
  float sway = sin(uTime * 1.8 + aInfo.z) * 0.07 * aInfo.w * max(position.y, 0.0);
  vec3 p = o + uRight * (position.x * aInfo.x + sway * aInfo.y) + uUp * (position.y * aInfo.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = `
uniform sampler2D uMap; varying vec2 vUv;
void main(){
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.4) discard;
  gl_FragColor = vec4(c.rgb, 1.0);
  #include <colorspace_fragment>
}`;

export const spriteMat = (ctx, tex) => {
  const a = ctx.art;
  a.spriteMats = a.spriteMats || new Map();
  if (!a.spriteMats.has(tex)) {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...ctx.uniforms, uMap: { value: tex } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    });
    ctx.disposer.track(m);
    a.spriteMats.set(tex, m);
  }
  return a.spriteMats.get(tex);
};

export default class CropLayer {
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.meshes = [];
  }

  /** items: [{pos, w, h, phase, sway}] 를 한 텍스처로 인스턴싱 */
  batch(tex, anchor, items) {
    const geom = billboardGeo(this.ctx.art, anchor[0], anchor[1]).clone();
    const mesh = new THREE.InstancedMesh(geom, spriteMat(this.ctx, tex), items.length);
    const info = new Float32Array(items.length * 4);
    const m4 = new THREE.Matrix4();
    items.forEach((it, k) => {
      m4.makeTranslation(it.pos.x, it.pos.y, it.pos.z);
      mesh.setMatrixAt(k, m4);
      info.set([it.w, it.h, it.phase, it.sway], k * 4);
    });
    geom.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
    this.meshes.push(mesh);
  }

  /** cells: [{pos, size}], stages: 단계 인덱스(셀 순서) */
  buildCrops(cells, stages, crop) {
    const art = this.ctx.art;
    const nStage = cropStageCount(art, crop);
    const by = new Map();
    const count = Math.min(cells.length, stages.length);
    for (let i = 0; i < count; i += 1) {
      const s = Math.min(stages[i], nStage - 1);
      if (!by.has(s)) by.set(s, []);
      by.get(s).push(i);
    }
    by.forEach((idxs, s) => {
      const { tex, def } = getCropTex(art, crop, s);
      const items = idxs.map((ci) => {
        const c = cells[ci];
        const sz = def._fb ? { w: c.size * 1.1, h: c.size * 1.1 } : spriteSize(tex, def, c.size, 32);
        return { pos: c.pos, w: sz.w, h: sz.h, phase: (ci * 2.399) % 6.28, sway: 1 };
      });
      this.batch(tex, def.anchor || [0.5, 1], items);
    });
  }

  clear() {
    this.meshes.forEach((m) => { this.group.remove(m); m.geometry.dispose(); m.dispose(); });
    this.meshes = [];
  }

  destroy() { this.clear(); this.group.parent?.remove(this.group); }
}
