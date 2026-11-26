// src/components/home/LabField.jsx
//
// 실험실 farm_home — 홈 밭 지도의 밭 한 장. 서버 발판(w×h 칸)을 그대로 아이소 격자 위에 그린다.
// 좌표는 모두 '지도 px'(HomeFieldGrid 레이어 좌표)이고, 밭 한 장 안에서는 밭 중심 기준 상대값이다.
import { Sparkle } from '@phosphor-icons/react';
import { stageToCrop } from '../../utils/crop';
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

const hash = (s) => {
  let h = 2166136261;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
};

const BASE_COLOR = '#B8B27A'; // 은은한 진흙/풀 톤 테두리(단어장 색은 쓰지 않는다)
const SOIL = '#B4703C';
const BORDER_W = 4; // 테두리 두께(지도 px) — 밭 크기와 무관하게 같다
const LIP = 2;      // 테두리 높이(아래로 비치는 면)

const shade = (hex, f) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#4F6B22';
  const n = parseInt(m[1], 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

const SUB = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]];

/** 밭 한 장의 작물 — 칸당 최대 4개(2×2), 단어 수만큼. 좌표는 밭 bbox 중심 기준 */
export const labPlants = (row, item) => {
  const { w, h, cells } = item;
  let list = (row.fieldWords || []).map((x) => ({ id: String(x.id), stage: stageToCrop(x.stage) }));
  if (list.length === 0) {
    const c = row.field?.counts || {};
    ['seed', 'sprout', 'leaf', 'carrot', 'golden'].forEach((st) => {
      for (let i = 0; i < (c[st] || 0); i += 1) list.push({ id: `${st}${i}`, stage: st });
    });
  }
  const cap = Math.min(MAX_PLANTS, cells.length * 4);
  if (list.length > cap) {
    const step = list.length / cap;
    list = Array.from({ length: cap }, (_, i) => list[Math.floor(i * step)]);
  }
  list.sort((p, q) => hash(`${row.book.id}${p.id}`) - hash(`${row.book.id}${q.id}`));
  const plants = list.map((it, i) => {
    const [dx, dy] = cells[i % cells.length];
    const [ox, oy] = SUB[Math.floor(i / cells.length)] || SUB[0];
    const p = gridPt(dx + ox - w / 2, dy + oy - h / 2);
    const idx = STAGE_INDEX[it.stage] ?? 0;
    return { ...it, key: `${row.book.id}:${it.id}`, idx, bx: p.x, by: p.y, hh: [0.3, 0.5, 0.72, 0.95][idx] * LAB_TW };
  });
  plants.sort((p, q) => p.by - q.by);
  return plants;
};

const MAX_SPRITE_W = LAB_TW * 0.5; // 슬롯 하나(칸의 절반 폭)를 넘지 않게
const boxOf = (p, crop) => {
  const sq = crop === 'carrot' || !crop;
  let w = sq ? p.hh * 1.25 : p.hh * [1.5, 0.82, 0.71, 0.57][p.idx];
  let h = sq ? p.hh * 1.25 : p.hh;
  if (w > MAX_SPRITE_W) { h *= MAX_SPRITE_W / w; w = MAX_SPRITE_W; }
  return { w, h };
};

/** 탭 판정용 자리(밭 중심 기준 상대 지도 px) */
export const labSpots = (row, item, crop) => labPlants(row, item).map((p) => {
  const { w, h } = boxOf(p, crop);
  return { id: p.id, key: p.key, bx: p.bx, by: p.by, x0: p.bx - w / 2, x1: p.bx + w / 2, y0: p.by - h, y1: p.by };
});

/** 칸 집합의 바깥 둘레 변 — [[ax,ay,bx,by]] (칸 좌표) */
const boundaryEdges = (cells) => {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const out = [];
  cells.forEach(([x, y]) => {
    if (!set.has(`${x},${y - 1}`)) out.push([x, y, x + 1, y]);
    if (!set.has(`${x + 1},${y}`)) out.push([x + 1, y, x + 1, y + 1]);
    if (!set.has(`${x},${y + 1}`)) out.push([x, y + 1, x + 1, y + 1]);
    if (!set.has(`${x - 1},${y}`)) out.push([x, y, x, y + 1]);
  });
  return out;
};

/** 밭 한 장 — 부모(밭 bbox 중심에 놓인 0 크기 div) 기준. 칸마다 같은 높이의 평평한 이랑 + 둘레 테두리, 옆면 없음 */
const LabField = ({ row, item, crop, color, R, tint = null }) => {
  const { w, h, cells } = item;
  const plants = labPlants(row, item);
  const pt = (dx, dy) => { const q = gridPt(dx - w / 2, dy - h / 2); return [q.x * R, q.y * R]; };
  const L = (x1, y1, x2, y2, oy = 0) => { const a = pt(x1, y1); const b = pt(x2, y2); return `M${a[0]} ${a[1] + oy}L${b[0]} ${b[1] + oy}`; };
  const base = BASE_COLOR; // color 는 이름 팻말에만 쓴다
  const edges = boundaryEdges(cells);
  const edgePath = (oy) => edges.map(([x1, y1, x2, y2]) => L(x1, y1, x2, y2, oy)).join('');
  const dark = cells.map(([x, y]) => [0.2, 0.5, 0.8].map((o) => L(x + o, y, x + o, y + 1)).join('')).join('');
  const light = cells.map(([x, y]) => [0.35, 0.65].map((o) => L(x + o, y, x + o, y + 1)).join('')).join('');
  return (
    <>
      <svg aria-hidden className="absolute left-0 top-0 overflow-visible" width="1" height="1">
        {cells.map(([x, y]) => (
          <polygon
            key={`${x},${y}`}
            points={[pt(x, y), pt(x + 1, y), pt(x + 1, y + 1), pt(x, y + 1)].map((q) => q.join(',')).join(' ')}
            fill={SOIL}
            stroke={SOIL}
            strokeWidth="0.6"
          />
        ))}
        <path d={dark} stroke="#8A4F24" strokeOpacity="0.45" strokeWidth={3 * R} fill="none" />
        <path d={light} stroke="#D49A60" strokeOpacity="0.4" strokeWidth={3 * R} fill="none" />
        {tint && cells.map(([x, y]) => (
          <polygon
            key={`t${x},${y}`}
            points={[pt(x, y), pt(x + 1, y), pt(x + 1, y + 1), pt(x, y + 1)].map((q) => q.join(',')).join(' ')}
            fill={tint}
            fillOpacity="0.45"
          />
        ))}
        <path d={edgePath(LIP * R)} stroke={shade(base, 0.7)} strokeWidth={BORDER_W * R} strokeLinecap="round" fill="none" />
        <path d={edgePath(0)} stroke={base} strokeWidth={BORDER_W * R} strokeLinecap="round" fill="none" />
      </svg>
      {plants.map((p) => {
        const { w: bw, h: bh } = boxOf(p, crop);
        return (
          <div
            key={p.key}
            className="absolute"
            style={{ left: (p.bx - bw / 2) * R, top: (p.by - bh) * R, width: bw * R, height: bh * R }}
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
                size={Math.max(8, bh * R * 0.28)}
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
