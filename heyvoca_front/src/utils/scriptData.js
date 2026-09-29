// src/utils/scriptData.js
//
// 글자 밭(문자 학습) — 정적 글자 데이터(src/data/script/*.json) + 서버 진행도(GET
// /script/progress)를 합쳐 화면이 바로 쓸 수 있는 모양으로 만드는 단일 소스.
// 히라가나/가타카나/알파벳 셋 다 "script" 코드('hiragana'|'katakana'|'alphabet')로 구분한다.

import hiraganaData from '../data/script/hiragana.json';
import katakanaData from '../data/script/katakana.json';
import alphabetData from '../data/script/alphabet.json';
import hiraganaStrokes from '../data/script/strokes/hiragana.json';
import katakanaStrokes from '../data/script/strokes/katakana.json';
import alphabetStrokes from '../data/script/strokes/alphabet.json';

export const SCRIPT_TYPES = {
  HIRAGANA: 'hiragana',
  KATAKANA: 'katakana',
  ALPHABET: 'alphabet',
};

export const SCRIPT_LABEL = {
  hiragana: '히라가나',
  katakana: '가타카나',
  alphabet: '알파벳',
};

// 학습 언어별로 이 화면에서 기본으로 보여줄 스크립트 목록.
export const scriptsForLearningLang = (learningLang) =>
  learningLang === 'ja' ? [SCRIPT_TYPES.HIRAGANA, SCRIPT_TYPES.KATAKANA] : [SCRIPT_TYPES.ALPHABET];

const RAW_DATA = {
  hiragana: hiraganaData,
  katakana: katakanaData,
  alphabet: alphabetData,
};

const STROKE_DATA = {
  hiragana: hiraganaStrokes,
  katakana: katakanaStrokes,
  alphabet: alphabetStrokes,
};

/** 문자의 TTS 재생 언어. 가나는 ja, 알파벳은 en. */
export const scriptTtsLang = (script) => (script === 'alphabet' ? 'en' : 'ja');

/** 문자 하나가 자동재생할 때 읽을 텍스트 — 가나는 글자 그 자체, 알파벳은 이름(name_hangul이
 *  아니라 실제 발화는 영어 TTS 보이스가 "A"를 알아서 '에이'로 읽는다). */
export const scriptSpokenText = (script, item) => (script === 'alphabet' ? item.char : item.char);

/** 행(row) 표시 라벨 — 히라가나/가타카나는 "○행", 알파벳은 "A – E" 범위. */
export const rowLabel = (script, rowKey, items) => {
  if (!items || items.length === 0) return rowKey;
  if (script === 'alphabet') {
    const first = items[0].char;
    const last = items[items.length - 1].char;
    return first === last ? first : `${first} – ${last}`;
  }
  return `${items[0].char}행`;
};

/** 정적 데이터를 row 순서를 유지한 채 { rowKey, items: [...] } 배열로 묶는다. */
export const groupByRow = (items) => {
  const order = [];
  const map = new Map();
  for (const it of items) {
    if (!map.has(it.row)) {
      map.set(it.row, []);
      order.push(it.row);
    }
    map.get(it.row).push(it);
  }
  return order.map((rowKey) => ({ rowKey, items: map.get(rowKey) }));
};

/** 숙달 단계(0-5) → 화면에 쓸 작물 표시 정보. CropImage가 받는 crop 키를 그대로 돌려준다.
 *  0: 빈 흙(작물 없음) · 1: 씨앗 · 2: 새싹 · 3-4: 이파리 · 5: 수확(당근). */
export const levelToCropStage = (level) => {
  const lv = Number(level) || 0;
  if (lv <= 0) return null;
  if (lv === 1) return 'PLANTED_SEED';
  if (lv === 2) return 'sprout';
  if (lv <= 4) return 'leaf';
  return 'carrot';
};

export const isMastered = (level) => (Number(level) || 0) >= 5;

/**
 * 정적 데이터 + 서버 진행도(items: [{char, level, correct_cnt, wrong_cnt, last_studied_at,
 * next_review_at}])를 합친다. 진행도가 없는 글자는 level 0으로 취급.
 */
export const mergeProgress = (script, progressItems) => {
  const raw = RAW_DATA[script] || [];
  const byChar = new Map((progressItems || []).map((p) => [p.char, p]));
  return raw.map((item) => {
    const p = byChar.get(item.char);
    return {
      ...item,
      level: p?.level ?? 0,
      correct_cnt: p?.correct_cnt ?? 0,
      wrong_cnt: p?.wrong_cnt ?? 0,
      last_studied_at: p?.last_studied_at ?? null,
      next_review_at: p?.next_review_at ?? null,
    };
  });
};

/** 지금 시각 기준 복습 예정(next_review_at ≤ now)이면서 한 번이라도 학습한(level>0) 글자. */
export const dueItems = (mergedItems, now = new Date()) =>
  mergedItems.filter((it) => it.level > 0 && it.next_review_at && new Date(it.next_review_at) <= now);

export const masteredCount = (mergedItems) => mergedItems.filter((it) => isMastered(it.level)).length;

/** strokeKey(단일 글자) 또는 compound([base, small])로 획 데이터를 찾는다. */
export const getStrokeEntry = (script, item) => {
  const table = STROKE_DATA[script] || {};
  if (Array.isArray(item.compound)) {
    return item.compound.map((k) => table[k]).filter(Boolean);
  }
  const key = item.strokeKey || item.char || item.lower;
  const entry = table[key];
  return entry ? [entry] : [];
};

/** 알파벳 전용 — 대문자/소문자 획 데이터를 함께 돌려준다. */
export const getAlphabetStrokeEntries = (item) => {
  const table = STROKE_DATA.alphabet || {};
  return {
    upper: table[item.char] ? [table[item.char]] : [],
    lower: table[item.lower] ? [table[item.lower]] : [],
  };
};

/** 혼동쌍(confusables) 문자 → 같은 데이터셋의 항목 객체로 확장. */
export const resolveConfusables = (script, item, allMerged) => {
  if (!item?.confusables?.length) return [];
  const byChar = new Map(allMerged.map((it) => [it.char, it]));
  return item.confusables.map((c) => byChar.get(c)).filter(Boolean);
};
