// src/components/home/LabField.jsx
//
// 실험실 farm_home — 홈 밭 지도의 밭 한 장(field_v2 + 단어장 작물 종류별 스프라이트).
// 좌표는 HomeFieldGrid 의 '밭 캔버스'(마름모 중심 = (DIA_CX, DIA_CY)) px 이다.
import React from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { stageToCrop } from '../../utils/crop';
import fieldV2 from '../../assets/farm2/field_v2.png';
import carrotSeed from '../../assets/images/farm/crops/planted/healthy-seed.png';
import carrotSprout from '../../assets/images/farm/crops/planted/healthy-sprout.png';
import carrotLeaf from '../../assets/images/farm/crops/planted/healthy-leaf.png';
import carrotCarrot from '../../assets/images/farm/crops/planted/healthy-carrot.png';

const FARM2 = import.meta.glob('../../assets/farm2/*_[0-3].png', { eager: true, import: 'default' });
const CARROT = [carrotSeed, carrotSprout, carrotLeaf, carrotCarrot];

export const LAB_CROPS = [
  { id: 'carrot', name: '당근' },
  { id: 'corn', name: '옥수수' },
  { id: 'cucumber', name: '오이' },
  { id: 'pumpkin', name: '호박' },
  { id: 'radish', name: '무' },
  { id: 'rice', name: '벼' },
  { id: 'strawberry', name: '딸기' },
  { id: 'tomato', name: '토마토' },
];

const STAGE_INDEX = { seed: 0, sprout: 1, leaf: 2, carrot: 3, golden: 3 };

const spriteSrc = (crop, idx) => {
  if (crop === 'carrot' || !crop) return CARROT[idx];
  return FARM2[`../../assets/farm2/${crop}_${idx}.png`] || CARROT[idx];
};

/** 밭 크기 3단계 — 단어 수 */
export const sizeFactor = (n) => (n <= 30 ? 0.78 : n <= 120 ? 0.92 : 1);

// field_v2.png(640×640) 안의 좌표
const IMG = 640;
const IMG_CX = 320;
const IMG_CY = 300;
const IMG_W_AT_1 = 1130; // factor 1 일 때 그림 폭(캔버스 px) — 테두리 마름모 폭이 DIA_W(1024)가 되도록
const SOIL_L = [70, 305];
const SOIL_U = [260, -115]; // L → T (이랑 방향)
const SOIL_V = [245, 115]; // L → B

const CX = 600;
const CY = 531;

const hash = (s) => {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
};

/** 밭 한 장의 작물 배치 — 이랑을 따라 촘촘히. 그리기와 탭 판정이 같이 쓴다 */
export const labPlants = (row, maxSprites) => {
  const words = row.fieldWords || [];
  let list = words.map((w) => ({ id: String(w.id), stage: stageToCrop(w.stage) }));
  if (list.length === 0) {
    const c = row.field?.counts || {};
    ['seed', 'sprout', 'leaf', 'carrot', 'golden'].forEach((st) => {
      for (let i = 0; i < (c[st] || 0); i += 1) list.push({ id: `${st}${i}`, stage: st });
    });
  }
  const total = list.length;
  const factor = sizeFactor(total);
  const imgW = IMG_W_AT_1 * factor;
  const sc = imgW / IMG;
  if (total > maxSprites) {
    const step = total / maxSprites;
    list = Array.from({ length: maxSprites }, (_, i) => list[Math.floor(i * step)]);
  }
  list.sort((a, b) => hash(`${row.book.id}${a.id}`) - hash(`${row.book.id}${b.id}`));
  const n = list.length;
  const rowsN = Math.min(6, Math.max(1, Math.round(Math.sqrt(n / 1.7))));
  const per = Math.max(1, Math.ceil(n / rowsN));
  const mul = Math.max(0.55, Math.min(1, 1.1 * Math.sqrt(24 / Math.max(n, 1))));
  const plants = list.map((it, i) => {
    const r = Math.floor(i / per);
    const j = i % per;
    const inRow = Math.min(per, n - r * per);
    const u = 0.1 + 0.8 * ((j + 0.5) / inRow);
    const v = 0.14 + 0.72 * ((r + 0.5) / rowsN);
    const ix = SOIL_L[0] + u * SOIL_U[0] + v * SOIL_V[0];
    const iy = SOIL_L[1] + u * SOIL_U[1] + v * SOIL_V[1];
    const bx = CX + (ix - IMG_CX) * sc;
    const by = CY + (iy - IMG_CY) * sc;
    const idx = STAGE_INDEX[it.stage] ?? 0;
    const hFrac = [0.035, 0.075, 0.12, 0.18][idx] * imgW * mul;
    return { ...it, key: `${row.book.id}:${it.id}`, idx, bx, by, h: hFrac };
  });
  plants.sort((a, b) => a.by - b.by);
  return { plants, imgW, sc };
};

/** 단어장 하나의 크기·스프라이트 비율을 적용한 화면 박스(캔버스 px) */
const boxOf = (p, crop) => {
  const sq = crop === 'carrot' || !crop;
  const w = sq ? p.h * 1.25 : p.h * [1.5, 0.82, 0.71, 0.57][p.idx];
  const h = sq ? p.h * 1.25 : p.h;
  return { w, h };
};

export const labSpots = (row, crop, maxSprites) => labPlants(row, maxSprites).plants.map((p) => {
  const { w, h } = boxOf(p, crop);
  return { id: p.id, key: p.key, bx: p.bx, by: p.by, x0: p.bx - w / 2, x1: p.bx + w / 2, y0: p.by - h, y1: p.by };
});

/** 밭 한 장 — 부모(MapField 자리 div)의 좌상단이 캔버스 (0,0), R = 그리는 배율 */
const LabField = ({ row, crop, maxSprites, R }) => {
  const { plants, imgW, sc } = labPlants(row, maxSprites);
  return (
    <>
      <img
        src={fieldV2}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        loading="lazy"
        decoding="async"
        width={imgW * R}
        height={imgW * R}
        style={{ left: (CX - IMG_CX * sc) * R, top: (CY - IMG_CY * sc) * R, width: imgW * R, height: imgW * R }}
      />
      {plants.map((p) => {
        const { w, h } = boxOf(p, crop);
        const golden = p.stage === 'golden';
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
            {golden && (
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
