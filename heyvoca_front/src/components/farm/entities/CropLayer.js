// 단계별 InstancedMesh 빌보드 — 밭 한 개의 작물 전체. 셰이더에서 법선축 빌보드 + 바닥 고정 바람 흔들림.
import * as THREE from 'three';
import { billboardGeo, getCropTex, spriteSize, cropStageCount } from '../farmArt';

const VERT = `
uniform vec3 uCam; uniform float uTime;
attribute vec3 aInfo;
varying vec2 vUv;
void main(){
  vUv = uv;
  vec3 o = (instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
  vec3 up = normalize(o);
  vec3 t = uCam - o; t -= up * dot(t, up);
  t = normalize(t + vec3(1e-5));
  vec3 right = normalize(cross(up, t));
  float sway = sin(uTime * 1.8 + aInfo.z) * 0.07 * max(position.y, 0.0);
  vec3 p = o + right * (position.x * aInfo.x + sway * aInfo.y) + up * (position.y * aInfo.y);
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

const matFor = (ctx, tex) => {
  const a = ctx.art;
  a.cropMats = a.cropMats || new Map();
  if (!a.cropMats.has(tex)) {
    const m = new THREE.ShaderMaterial({
      uniforms: { ...ctx.uniforms, uMap: { value: tex } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    });
    ctx.disposer.track(m);
    a.cropMats.set(tex, m);
  }
  return a.cropMats.get(tex);
};

export default class CropLayer {
  constructor(ctx, parent) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.meshes = [];
  }

  /** cells: [{pos: Vector3, size}], stages: 단계 인덱스 배열(셀 순서), crop: 작물 종류 */
  build(cells, stages, crop) {
    this.clear();
    const art = this.ctx.art;
    const nStage = cropStageCount(art, crop);
    const byStage = new Map();
    const count = Math.min(cells.length, stages.length);
    for (let i = 0; i < count; i += 1) {
      const s = Math.min(stages[i], nStage - 1);
      if (!byStage.has(s)) byStage.set(s, []);
      byStage.get(s).push(i);
    }
    const m4 = new THREE.Matrix4();
    byStage.forEach((idxs, s) => {
      const { tex, def } = getCropTex(art, crop, s);
      const geom = billboardGeo(art, def.anchor?.[0] ?? 0.5, def.anchor?.[1] ?? 1);
      const mesh = new THREE.InstancedMesh(geom, matFor(this.ctx, tex), idxs.length);
      const info = new Float32Array(idxs.length * 3);
      idxs.forEach((ci, k) => {
        const c = cells[ci];
        m4.makeTranslation(c.pos.x, c.pos.y, c.pos.z);
        mesh.setMatrixAt(k, m4);
        const sz = def._fb ? { w: c.size * 0.9, h: c.size * 0.9 } : spriteSize(tex, def, c.size, 32);
        info[k * 3] = sz.w; info[k * 3 + 1] = sz.h; info[k * 3 + 2] = (ci * 2.399) % 6.28;
      });
      mesh.geometry = geom.clone();
      mesh.geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 3));
      this.ctx.disposer.track(mesh.geometry);
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.meshes.push(mesh);
    });
  }

  clear() {
    this.meshes.forEach((m) => { this.group.remove(m); m.geometry.dispose(); m.dispose(); });
    this.meshes = [];
  }

  destroy() { this.clear(); this.group.parent?.remove(this.group); }
}
