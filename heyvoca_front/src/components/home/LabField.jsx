// src/components/home/LabField.jsx
//
// 실험실 farm_home — 홈 밭 지도의 밭 한 장. 서버 발판(w×h 칸)을 그대로 아이소 격자 위에 그린다.
// 좌표는 모두 '지도 px'(HomeFieldGrid 레이어 좌표)이고, 밭 한 장 안에서는 밭 중심 기준 상대값이다.
import { Sparkle } from '@phosphor-icons/react';
import { stageToCrop } from '../../utils/crop';
import fieldV2 from '../../assets/farm2/field_v2.png';
import carrotSeed from '../../assets/images/farm/crops/planted/healthy-seed.png';
import carrotSprout from '../../assets/images/farm/crops/planted/healthy-sprout.png';
import carrotLeaf from '../../assets/images/farm/crops/planted/healthy-leaf.png';
import carrotCarrot from '../../assets/images/farm/crops/planted/healthy-carrot.png';

const FARM2 = import.meta.glob('../../assets/farm2/*_[0-3].png', { eager: true, import: 'default' });
const CARROT = [carrotSeed, carrotSprout, carrotLeaf, carrotCarrot];

export const LAB_TW = 64; // 격자 한 칸의 마름모 폭(지도 px)
export const LAB_TH = 32; // 마름모 높이

/** 격자 좌표 → 지도 px */
export const gridPt = (gx, gy) => ({ x: (gx - gy) * (LAB_TW / 2), y: (gx + gy) * (LAB_TH / 2) });

const STAGE_INDEX = { seed: 0, sprout: 1, leaf: 2, carrot: 3, golden: 3 };
const MAX_PLANTS = 360;

const spriteSrc = (crop, idx) => {
  if (crop === 'carrot' || !crop) return CARROT[idx];
  return FARM2[`../../assets/farm2/${crop}_${idx}.png`] || CARROT[idx];
};

// field_v2.png(640×640) 안의 좌표 — 테두리 마름모 꼭짓점과 흙 윗면
const IMG = 640;
const RIM_T = [320, 165];
const RIM_R = [610, 300];
const RIM_L = [30, 300];
const SOIL_CLIP = 'polygon(80px 305px, 330px 198px, 562px 305px, 315px 412px)';
const RIM_HUE = 78; // 기본 풀색 테두리 색상각

const hash = (s) => {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
};

/** '#RRGGBB' → { h(0~360), s(0~1) } */
const hueSat = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
  if (d === 0) return { h: 0, s: 0 };
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx === 0 ? 0 : d / mx };
};

/** 밭 그림 → 발판(w×h 칸) 아핀 행렬(밭 중심 기준, 지도 px) */
const fieldMatrix = (w, h) => {
  const e1 = [RIM_R[0] - RIM_T[0], RIM_R[1] - RIM_T[1]];
  const e2 = [RIM_L[0] - RIM_T[0], RIM_L[1] - RIM_T[1]];
  const d1 = [w * LAB_TW / 2, w * LAB_TH / 2];
  const d2 = [-h * LAB_TW / 2, h * LAB_TH / 2];
  const det = e1[0] * e2[1] - e2[0] * e1[1];
  // M = D · E⁻¹, E = [e1 e2] (열 벡터)
  const a = (d1[0] * e2[1] - d2[0] * e1[1]) / det;
  const c = (-d1[0] * e2[0] + d2[0] * e1[0]) / det;
  const b = (d1[1] * e2[1] - d2[1] * e1[1]) / det;
  const d = (-d1[1] * e2[0] + d2[1] * e1[0]) / det;
  const top = gridPt(-w / 2, -h / 2);
  return { a, b, c, d, e: top.x - (a * RIM_T[0] + c * RIM_T[1]), f: top.y - (b * RIM_T[0] + d * RIM_T[1]) };
};

/** 밭 한 장의 작물 — 이랑(격자 y 방향)을 따라 촘촘히. 단어 수에 가깝게 심는다 */
export const labPlants = (row, item) => {
  const { w, h } = item;
  let list = (row.fieldWords || []).map((x) => ({ id: String(x.id), stage: stageToCrop(x.stage) }));
  if (list.length === 0) {
    const c = row.field?.counts || {};
    ['seed', 'sprout', 'leaf', 'carrot', 'golden'].forEach((st) => {
      for (let i = 0; i < (c[st] || 0); i += 1) list.push({ id: `${st}${i}`, stage: st });
    });
  }
  if (list.length > MAX_PLANTS) {
    const step = list.length / MAX_PLANTS;
    list = Array.from({ length: MAX_PLANTS }, (_, i) => list[Math.floor(i * step)]);
  }
  list.sort((p, q) => hash(`${row.book.id}${p.id}`) - hash(`${row.book.id}${q.id}`));
  const n = list.length;
  const rowsN = Math.max(1, Math.min(n, Math.round(w * 0.8)));
  const per = Math.max(1, Math.ceil(n / rowsN));
  const mul = Math.max(0.6, Math.min(1.2, Math.sqrt((w * h * 0.9) / Math.max(n, 1))));
  const plants = list.map((it, i) => {
    const r = Math.floor(i / per);
    const j = i % per;
    const inRow = Math.min(per, n - r * per);
    const gx = 0.7 + (w - 1.4) * ((r + 0.5) / rowsN);
    const gy = 0.7 + (h - 1.4) * ((j + 0.5) / inRow);
    const p = gridPt(gx - w / 2, gy - h / 2);
    const idx = STAGE_INDEX[it.stage] ?? 0;
    return { ...it, key: `${row.book.id}:${it.id}`, idx, bx: p.x, by: p.y, hh: [0.55, 1, 1.5, 2.1][idx] * LAB_TW * mul };
  });
  plants.sort((p, q) => p.by - q.by);
  return plants;
};

const boxOf = (p, crop) => {
  const sq = crop === 'carrot' || !crop;
  return sq
    ? { w: p.hh * 1.25, h: p.hh * 1.25 }
    : { w: p.hh * [1.5, 0.82, 0.71, 0.57][p.idx], h: p.hh };
};

/** 탭 판정용 자리(밭 중심 기준 상대 지도 px) */
export const labSpots = (row, item, crop) => labPlants(row, item).map((p) => {
  const { w, h } = boxOf(p, crop);
  return { id: p.id, key: p.key, bx: p.bx, by: p.by, x0: p.bx - w / 2, x1: p.bx + w / 2, y0: p.by - h, y1: p.by };
});

/** 밭 한 장 — 부모(밭 중심에 놓인 0 크기 div) 기준으로 그린다. R = 그리는 배율 */
const LabField = ({ row, item, crop, color, R }) => {
  const plants = labPlants(row, item);
  const m = fieldMatrix(item.w, item.h);
  const hs = color ? hueSat(color) : null;
  const tf = `matrix(${m.a * R}, ${m.b * R}, ${m.c * R}, ${m.d * R}, ${m.e * R}, ${m.f * R})`;
  const filter = hs ? `hue-rotate(${Math.round(hs.h - RIM_HUE)}deg) saturate(${(0.35 + hs.s * 0.9).toFixed(2)})` : undefined;
  return (
    <>
      <img
        src={fieldV2}
        alt=""
        draggable={false}
        decoding="async"
        className="absolute left-0 top-0 max-w-none origin-top-left select-none"
        style={{ width: IMG, height: IMG, transform: tf, filter }}
      />
      {hs && (
        // 흙은 원래 색 그대로 — 테두리·받침만 단어장 색으로 물들인 뒤 윗면만 원본을 덮는다
        <img
          src={fieldV2}
          alt=""
          draggable={false}
          decoding="async"
          className="absolute left-0 top-0 max-w-none origin-top-left select-none"
          style={{ width: IMG, height: IMG, transform: tf, clipPath: SOIL_CLIP }}
        />
      )}
      {plants.map((p) => {
        const { w, h } = boxOf(p, crop);
        return (
          <div
            key={p.key}
            className="absolute"
            style={{ left: (p.bx - w / 2) * R, top: (p.by - h) * R, width: w * R, height: h * R }}
          >
            <img
              src={spriteSrc(crop, p.idx)}
              alt=""
              draggable={false}
              className="block w-full h-full object-contain origin-bottom animate-crop-sway select-none"
              style={{ animationDelay: `-${(hash(p.key) * 3.4).toFixed(2)}s` }}
            />
            {p.stage === 'golden' && (
              <Sparkle
                weight="fill"
                size={Math.max(8, h * R * 0.28)}
                className="absolute -top-[6%] right-[6%] text-[#FFC53D] animate-pulse"
              />
            )}
          </div>
        );
      })}
    </>
  );
};

export default LabField;
