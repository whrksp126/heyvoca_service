// src/utils/scriptSession.js
//
// 글자 밭 학습 세션 문제 구성 — TakeTest의 buildTestQuestions와 같은 역할을 아주 가볍게
// 한다. 세션 자체가 3~5분짜리 경량 화면이라 별도 플러그인 레지스트리 없이 이 한 파일에서
// 스텝 배열을 만든다.

import { resolveConfusables } from './scriptData';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 학습(see/listen 선택) 문제 하나의 표시 라벨 — 스크립트에 따라 다른 필드를 쓴다. */
export const optionLabel = (script, item) => {
  if (!item) return '';
  if (script === 'alphabet') return `${item.name_hangul} · ${item.sound_hangul}`;
  return item.note ? item.hangul : `${item.hangul} · ${item.romaji}`;
};

/** 선택지 버튼 안 두 줄(한글 발음 크게 + 로마자 작게)로 쓸 { main, sub } — ChoiceCard B안. */
export const optionMainSub = (script, item) => {
  if (!item) return { main: '', sub: '' };
  if (script === 'alphabet') return { main: item.name_hangul, sub: item.sound_hangul };
  return { main: item.hangul, sub: item.note ? '' : item.romaji };
};

/** 오답 선택지 구성 — 혼동쌍(confusables)을 우선 채우고, 모자라면 풀에서 무작위 보충. */
const buildDistractors = (item, pool, count) => {
  const byChar = new Map(pool.map((p) => [p.char, p]));
  const confusables = (item.confusables || [])
    .map((c) => byChar.get(c))
    .filter((c) => c && c.char !== item.char);
  const rest = shuffle(pool.filter((p) => p.char !== item.char && !confusables.includes(p)));
  const combined = [...confusables, ...rest];
  return combined.slice(0, count);
};

/** MCQ 한 문제 — kind: 'seePick'(글자 보고 뜻/소리 고르기) | 'listenPick'(소리 듣고 글자 고르기) */
const buildChoiceStep = (script, item, pool, kind, idSuffix = '') => {
  const distractors = buildDistractors(item, pool, 3);
  const options = shuffle([item, ...distractors]);
  const answerIndex = options.findIndex((o) => o.char === item.char);
  return {
    id: `${kind}-${item.char}-${idSuffix}`,
    type: kind,
    script,
    char: item.char,
    item,
    options,
    answerIndex,
  };
};

const buildIntroStep = (script, item, pool = []) => ({
  id: `intro-${item.char}`,
  type: 'intro',
  script,
  char: item.char,
  item,
  confusables: resolveConfusables(script, item, pool),
});

const buildTraceStep = (script, item) => ({
  id: `trace-${item.char}`,
  type: 'trace',
  script,
  char: item.char,
  item,
});

/**
 * 학습 세션(행 배우기) — 글자마다 [만나기 → 보고 고르기 → 듣고 고르기 → 따라 쓰기]를
 * 끝까지 이어 붙인 뒤, 마지막에 전체를 섞은 확인 문제를 덧붙인다.
 */
export const buildLearnSteps = (script, chars, pool) => {
  const steps = [];
  for (const item of chars) {
    steps.push(buildIntroStep(script, item, pool));
    steps.push(buildChoiceStep(script, item, pool, 'seePick', 'learn'));
    steps.push(buildChoiceStep(script, item, pool, 'listenPick', 'learn'));
    steps.push(buildTraceStep(script, item));
  }
  const checkCount = Math.min(chars.length, 5);
  const checkItems = shuffle(chars).slice(0, checkCount);
  checkItems.forEach((item, idx) => {
    const kind = idx % 2 === 0 ? 'seePick' : 'listenPick';
    steps.push(buildChoiceStep(script, item, pool, kind, `check-${idx}`));
  });
  return steps;
};

/** 복습 세션 — 만나기·따라 쓰기 없이 ②③ 퀴즈만. */
export const buildReviewSteps = (script, chars, pool) => {
  const steps = [];
  for (const item of chars) {
    steps.push(buildChoiceStep(script, item, pool, 'seePick', 'review'));
    steps.push(buildChoiceStep(script, item, pool, 'listenPick', 'review'));
  }
  return shuffle(steps).map((s, idx) => ({ ...s, id: `${s.id}-${idx}` }));
};

/** '이미 알아요' 확인 테스트 — 5문제(모자라면 있는 만큼), see/listen 절반씩. */
export const buildSkipCheckSteps = (script, chars, pool) => {
  const count = Math.min(5, chars.length * 2);
  const source = shuffle([...chars, ...chars]).slice(0, count);
  return source.map((item, idx) =>
    buildChoiceStep(script, item, pool, idx % 2 === 0 ? 'seePick' : 'listenPick', `skip-${idx}`)
  );
};

/** 세션 결과(문제별 char+정오답)를 글자별 "첫 시도" 기준 1건으로 집계 — /script/log 페이로드. */
export const summarizeResults = (answeredSteps) => {
  const firstByChar = new Map();
  for (const s of answeredSteps) {
    if (s.type !== 'seePick' && s.type !== 'listenPick') continue;
    if (firstByChar.has(s.char)) continue;
    firstByChar.set(s.char, !!s.correct);
  }
  return Array.from(firstByChar.entries()).map(([char, correct]) => ({ char, correct }));
};
