// src/components/takeTest/rewards/growth.js
//
// 「밭 성장」 슬라이드의 데이터 준비 — 화면과 떼어 둔 순수 함수.
// 예전에는 자람 · 새싹 · 되살림 · 황금 당근이 각각 한 장이었다. 네 목록을 한 줄로 합친다.
import { stageToCrop, CROP_STAGES, CROP_LABEL, withRo } from '../../../utils/crop';

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
    out.push({ id, word: row.word, meaning: row.meaning, kind, from, to, meta: metaOfRow(row) });
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

/** 목록 시트 오른쪽 문구 */
export const growthRightLabel = (entry) => {
  if (entry.kind === 'sprout') return '새싹이 돋았어요';
  if (entry.kind === 'rescue') return '되살렸어요';
  if (entry.kind === 'gold') return '황금 당근';
  return `${withRo(CROP_LABEL[entry.to] ?? '작물')} 자랐어요`;
};

/*
  밭 위 자리 — 3×3 마름모 격자(i: 오른쪽 아래, j: 왼쪽 아래). 개수마다 모양이 가운데로 모이게 고른다.
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
 * 밭에 올릴 작물을 고른다. 9칸을 넘으면 종류마다 적어도 하나는 보이게 하고(대표 종류 우선),
 * 못 올린 만큼은 그 종류의 마지막 작물이 숫자로 대신한다(weight).
 * @returns {{ crops: Array<{entry, x, y, weight}>, total: number }}
 */
export const planField = (entries) => {
  const byKind = Object.fromEntries(GROWTH_KINDS.map((k) => [k, entries.filter((e) => e.kind === k)]));
  const quota = Object.fromEntries(GROWTH_KINDS.map((k) => [k, Math.min(1, byKind[k].length)]));
  let left = FIELD_MAX - GROWTH_KINDS.reduce((s, k) => s + quota[k], 0);
  while (left > 0) {
    let gave = false;
    for (const k of GROWTH_KINDS) {
      if (left > 0 && quota[k] < byKind[k].length) { quota[k] += 1; left -= 1; gave = true; }
    }
    if (!gave) break;
  }
  const picked = GROWTH_KINDS.flatMap((k) => byKind[k].slice(0, quota[k]).map((entry, i) => ({
    entry,
    weight: i === quota[k] - 1 ? 1 + (byKind[k].length - quota[k]) : 1,
  })));
  const slots = SLOTS_BY_COUNT[picked.length] ?? [];
  const crops = picked.map((p, n) => {
    const [i, j] = slots[n];
    return { ...p, x: FIELD_W / 2 + (i - j) * 44, y: 150 + (i + j - 2) * 19 };
  });
  return { crops, total: entries.length };
};
