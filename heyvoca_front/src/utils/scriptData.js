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
import { getTextSound, prefetchTextSound, prefetchTtsList } from './common';

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

/**
 * 문자 하나를 소리 내어 읽을 때 실제로 TTS에 넘길 텍스트.
 * 기본은 item.char 그대로지만, 단독으로 넘기면 오독되거나 어색한 항목은
 * data/script/*.json 의 "speak" 필드로 안전한 텍스트를 지정해 덮어쓴다.
 *
 * 알파벳: 대문자 한 글자만 넘기면 ElevenLabs가 관사 "a"(어)처럼 슈와 발음으로 읽을 위험이
 * 있는 항목(특히 A)이 있어, 26자 전부 영어 알파벳 이름의 표준 표기(Ay/Bee/See...)를
 * alphabet.json 에 미리 채워 뒀다 — 모든 TTS 보이스가 흔들림 없이 "글자 이름"으로 읽는다.
 *
 * 가나: 대부분은 글자 그 자체(단일/요음 2글자 문자열)로도 안정적으로 읽힌다 — 요음
 * (きゃ 등)은 이미 유효한 모라 2글자 조합이라 그대로 둬도 된다. speak 오버라이드가 필요한
 * 항목만 hiragana.json/katakana.json 에 넣었다:
 *   - ぢ/づ, ヂ/ヅ → 현대 일본어에서 じ/ず, ジ/ズ 와 발음이 같다(4단 동음화) → speak을
 *     그 동음 글자로 지정해 그대로 발음하게 한다.
 *   - を → 조사로 쓰일 때도 「오」로만 발음된다(역사적 철자, wo 아님) → speak: "お".
 *     ヲ(가타카나)도 같은 음운적 이유로 speak: "オ".
 *   - は/へ → 히라가나 단독 は/へ는 "조사"로 오인돼 일부 TTS가 わ/え(조사일 때의 발음)로
 *     읽을 위험이 있다(문장 안 명사+は 패턴 휴리스틱). 조사 규칙이 적용되지 않는 가타카나
 *     동음(ハ/ヘ)으로 speak을 지정해 항상 글자 그대로의 소리(ha/he)로 읽게 한다.
 *   - ん/ン → 모음 없는 단독 비음이라 무음/뭉개짐으로 재생될 수 있어, 길게 늘인 가타카나
 *     "ンー"로 speak을 지정해 발화 길이를 확보한다.
 */
export const scriptSpokenText = (script, item) => item?.speak || item?.char;

// 재생 실패(캐시 미스·resolve/다운로드 실패)를 1회 재시도한 뒤 재생한다.
// getTextSound 자체는 실패를 조용히 삼키므로, prefetchTextSound의 성공 여부(objectURL 반환)로
// 성공/실패를 판별해 재시도한다 — 이미 성공적으로 캐시된 경우는 즉시 반환되어 비용이 없다.
const speakTextWithRetry = async (text, lang, onMeta) => {
  if (!text) return;
  let cached = await prefetchTextSound(text, lang);
  if (!cached) {
    // 1회 재시도
    cached = await prefetchTextSound(text, lang);
  }
  return getTextSound(text, lang, onMeta);
};

/** script 문자 하나(item.speak 우선)를 소리 내 읽는다 — 실패 시 1회 재시도, 연속 탭 시
 *  이전 재생은 getTextSound 내부의 공유 오디오 인스턴스가 자동으로 끊고 새로 재생한다. */
export const speakScriptItem = (script, item, onMeta) =>
  speakTextWithRetry(scriptSpokenText(script, item), scriptTtsLang(script), onMeta);

/** 예시 단어처럼 item.char 가 아닌 임의 텍스트(같은 스크립트 언어)를 재생할 때. */
export const speakScriptText = (script, text, onMeta) =>
  speakTextWithRetry(text, scriptTtsLang(script), onMeta);

/** 세션에 들어갈 글자들의 음성을 세션 시작 시 미리 받아 둔다(줄 단위 prefetch) —
 *  글자 자체 소리 + 예시 단어 소리까지 포함해 첫 탭에서도 끊김 없이 재생되게 한다. */
export const prefetchScriptSession = (script, chars) => {
  const lang = scriptTtsLang(script);
  const seen = new Set();
  const list = [];
  const add = (text) => {
    const t = (text || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    list.push({ text: t, language: lang });
  };
  (chars || []).forEach((item) => {
    add(scriptSpokenText(script, item));
    if (item?.example?.word) add(item.example.word);
  });
  return prefetchTtsList(list, 4);
};

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
