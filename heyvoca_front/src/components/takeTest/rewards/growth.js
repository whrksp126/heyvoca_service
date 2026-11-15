// src/components/takeTest/rewards/growth.js
//
// 「밭 성장」 슬라이드의 데이터 준비 — 화면과 떼어 둔 순수 함수.
// 예전에는 자람 · 새싹 · 되살림 · 황금 당근이 각각 한 장이었다. 네 목록을 한 줄로 합친다.
import { stageToCrop, CROP_STAGES } from '../../../utils/crop';

/** 밭에서 자라는 차례 — 새싹 → 자람 → 되살림 → 황금(피날레) */
export const GROWTH_KINDS = ['sprout', 'grow', 'rescue', 'gold'];

export const GROWTH_KIND_META = {
  sprout: { label: '새싹', chipStage: 'sprout' },
  grow: { label: '자람', chipStage: 'leaf' },
  rescue: { label: '되살림', chipStage: 'leaf', drop: true },
  gold: { label: '황금 당근', chipStage: 'golden', gold: true },
};

const prevCrop = (crop) => CROP_STAGES[Math.max(0, CROP_STAGES.indexOf(crop) - 1)];

/**
 * 네 목록 → 한 줄. 같은 단어는 한 번만 나온다.
 *   grownRows   단계가 오른 단어 전부(새싹 · 이파리 · 당근 · 황금 구분 없이). 도착 단계로 종류를 정한다
 *   rescuedRows 시들었다가 회복한 단어. 같은 세션에 단계까지 올랐다면 성장 쪽으로만 센다
 *   metaOfRow   요약 행 → 문제 원본 단어(일본어 읽기 표시용)
 */
export const buildGrowthEntries = ({ grownRows = [], rescuedRows = [], metaOfRow = () => null }) => {
  const seen = new Set();
  const out = [];
  const push = (row, kind, from, to) => {
    const id = row?.user_voca_id;
    if (id == null || seen.has(id)) return;
    seen.add(id);
    // fromHealth — 되살림 전 건강(체험 밭만 준다). 서버 요약은 시듦·심한 시듦만 되살림으로 세서 없으면 시듦 그림.
    out.push({ id, word: row.word, meaning: row.meaning, kind, from, to, fromHealth: row.health_from ?? null, meta: metaOfRow(row) });
  };
  grownRows.forEach((row) => {
    const to = stageToCrop(row.to_stage ?? row.crop);
    if (to === 'seed') return;
    const rawFrom = row.from_stage ? stageToCrop(row.from_stage) : null;
    const from = rawFrom && CROP_STAGES.indexOf(rawFrom) < CROP_STAGES.indexOf(to) ? rawFrom : prevCrop(to);
    const kind = to === 'golden' ? 'gold' : to === 'sprout' ? 'sprout' : 'grow';
    push(row, kind, from, to);
  });
  rescuedRows.forEach((row) => {
    const crop = stageToCrop(row.crop);
    push(row, 'rescue', crop, crop);
  });
  return GROWTH_KINDS.flatMap((k) => out.filter((e) => e.kind === k));
};

/*
  밭 위 자리 — 3×3 마름모 격자(i: 오른쪽 아래, j: 왼쪽 아래). 개수마다 모양이 가운데로 모이게 고른다.
  9개를 넘으면 fieldSlots 가 격자를 넓힌다.
  뒤(위)에서 앞(아래) 순서라, 마지막에 자라는 황금 당근이 맨 앞자리에 선다.
*/
const SLOTS_BY_COUNT = {
  1: [[1, 1]],
  2: [[1, 0], [0, 1]],
  3: [[1, 0], [0, 1], [1, 1]],
  4: [[1, 0], [0, 1], [2, 1], [1, 2]],
  5: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  6: [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
  7: [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [2, 2]],
  8: [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [2, 1], [1, 2], [2, 2]],
  9: [[0, 0], [1, 0], [0, 1], [2, 0], [1, 1], [0, 2], [2, 1], [1, 2], [2, 2]],
};
export const FIELD_MAX = 9;
export const FIELD_W = 340;
export const FIELD_H = 244;
export const CROP_BOX = 88;

/**
 * n 개 자리 — 9개까지는 위 3×3 자리 그대로(scale 1). 그보다 많으면 k×k 마름모 격자(k = ⌈√n⌉)에서
 * 가운데에 가까운 칸부터 n 칸을 고르고, 3×3 과 같은 밭 범위(x ±88, y ±38)에 맞게 간격을 줄인다.
 * 칸이 겹치지 않게 그림도 같은 비율(scale)로 줄인다. 뒤(위)에서 앞(아래) 순서.
 * 밭 성장 슬라이드(planField)와 새 씨앗 심기 장면(PlantingScene)이 같이 쓴다.
 * @returns {Array<{x:number, y:number, z:number, scale:number}>} z = 앞뒤 겹침 순서(zIndex)
 */
export const fieldSlots = (n) => {
  if (n <= 0) return [];
  if (n <= FIELD_MAX) {
    return SLOTS_BY_COUNT[n].map(([i, j]) => ({
      x: FIELD_W / 2 + (i - j) * 44, y: 150 + (i + j - 2) * 19, z: 10 + i + j, scale: 1,
    }));
  }
  const k = Math.ceil(Math.sqrt(n));
  const c = (k - 1) / 2;
  const cells = [];
  for (let i = 0; i < k; i += 1) for (let j = 0; j < k; j += 1) cells.push([i, j]);
  const step = 2 / (k - 1); // 3×3 간격(44, 19) 대비
  const scale = Math.min(1, 2.4 / (k - 1));
  return cells
    .sort((a, b) => (Math.hypot(a[0] - c, a[1] - c) - Math.hypot(b[0] - c, b[1] - c)) || (a[0] + a[1] - b[0] - b[1]))
    .slice(0, n)
    .sort((a, b) => (a[0] + a[1] - b[0] - b[1]) || (b[0] - a[0]))
    .map(([i, j]) => ({
      x: FIELD_W / 2 + (i - j) * 44 * step,
      y: 150 + (i + j - (k - 1)) * 19 * step,
      z: 10 + i + j,
      scale,
    }));
};

/**
 * 밭에 올릴 작물 자리 — **자란 작물은 전부** 밭에 올린다(이슈 #25 16차 QA — '13개 자랐어요'인데 밭엔 9개뿐이었다.
 * 예전엔 9칸까지만 올리고 나머지는 종류의 마지막 작물이 숫자로 대신했다). 9개를 넘으면 fieldSlots 가 격자를
 * 넓히고 칸을 줄인다. 자라는 차례(GROWTH_KINDS)대로 뒤에서 앞으로 놓여, 마지막에 자라는 황금 당근이 맨 앞에 선다.
 * weight 는 늘 1(한 칸 = 한 단어) — 호출부의 합계 계산을 그대로 두려고 남긴다.
 * @returns {{ crops: Array<{entry, x, y, z, scale, weight}>, total: number }}
 */
export const planField = (entries) => {
  const ordered = GROWTH_KINDS.flatMap((k) => entries.filter((e) => e.kind === k));
  const slots = fieldSlots(ordered.length);
  const crops = ordered.map((entry, n) => ({ entry, weight: 1, ...slots[n] }));
  return { crops, total: entries.length };
};
