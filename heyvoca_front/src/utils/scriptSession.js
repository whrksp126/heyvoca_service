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

/** 선택지 버튼 안 두 줄(한글 발음 크게 + 로마자 작게)로 쓸 { main, sub } — ChoiceCard B안.
 *  알파벳은 글자 이름(에이/와이…)만 크게 보여준다 — 아래 sound_hangul(애/이/르…) 작은
 *  보조 텍스트는 2026-09-29 QA로 제거했다(가나는 로마자 보조를 그대로 유지). */
export const optionMainSub = (script, item) => {
  if (!item) return { main: '', sub: '' };
  if (script === 'alphabet') return { main: item.name_hangul, sub: '' };
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

// 알파벳은 대문자·소문자를 각각 다른 따라 쓰기 슬라이드로 낸다(2026-09-29 QA 4차 —
// strokes/alphabet.json에 소문자 획 데이터도 이미 있다). 가나는 대/소문자 구분이 없어
// variant는 항상 null.
const traceVariantsFor = (script) => (script === 'alphabet' ? ['upper', 'lower'] : [null]);

const buildTraceStep = (script, item, idSuffix = '', variant = null) => ({
  id: `trace-${item.char}${variant ? `-${variant}` : ''}${idSuffix ? `-${idSuffix}` : ''}`,
  type: 'trace',
  script,
  char: item.char,
  item,
  traceVariant: variant, // 'upper' | 'lower' | null(가나 등 구분 없음)
});

/** 이 줄이 "처음 배우는 줄"인지 — 글자 전부가 아직 한 번도 학습되지 않았을 때(level 0)만
 *  true. mergeProgress가 채워 준 item.level 기준(글자 밭 utils/scriptData.js 참고). */
const isFreshRow = (chars) => (chars || []).every((c) => (Number(c?.level) || 0) === 0);

// 랜덤 테스트형에서 뽑을 문제 유형 — 만나기(intro)는 제외. 알파벳은 대/소문자 따라 쓰기가
// 각각 후보라 글자당 조합이 4개(seePick·listenPick·trace-upper·trace-lower), 가나는 3개다.
const buildComboKindsForChar = (script, item) => {
  const kinds = [{ kind: 'seePick' }, { kind: 'listenPick' }];
  traceVariantsFor(script).forEach((variant) => kinds.push({ kind: 'trace', variant }));
  return kinds.map((k) => ({ item, ...k }));
};

/** 글자×유형 전체 조합을 섞어 만든 뒤, 같은 글자·같은 유형이 바로 연속되지 않도록
 *  그리디하게 자리를 바꾼다(완벽한 보장은 아니지만 이 세션 규모에서는 충분하다). */
const buildShuffledCombos = (script, chars) => {
  const combos = chars.flatMap((item) => buildComboKindsForChar(script, item));
  const shuffled = shuffle(combos);
  for (let i = 1; i < shuffled.length; i++) {
    const prev = shuffled[i - 1];
    const clashes = shuffled[i].item.char === prev.item.char || shuffled[i].kind === prev.kind;
    if (!clashes) continue;
    const swapIdx = shuffled.findIndex((c, j) => (
      j > i && c.item.char !== prev.item.char && c.kind !== prev.kind
    ));
    if (swapIdx !== -1) {
      [shuffled[i], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[i]];
    }
  }
  return shuffled;
};

/** 랜덤 테스트형 스텝 — 만나기(정보 전달) 슬라이드 없이 보고 고르기·듣고 고르기·따라 쓰기를
 *  글자·유형 모두 랜덤 순서로 배치한다. 복습·다시 배우기·'이미 알아요' 확인 공통으로 쓴다
 *  (2026-09-29 QA 4차 — "처음 배우는 줄"이 아니면 전부 이 테스트 느낌으로 통일). 알파벳은
 *  대문자·소문자 따라 쓰기가 둘 다 후보로 섞여 들어간다(둘 다 반드시 나오는 건 아니다). */
const buildRandomTestSteps = (script, chars, pool, idPrefix) => (
  buildShuffledCombos(script, chars).map(({ item, kind, variant }, idx) => {
    const idSuffix = `${idPrefix}-${idx}`;
    if (kind === 'trace') return buildTraceStep(script, item, idSuffix, variant);
    return buildChoiceStep(script, item, pool, kind, idSuffix);
  })
);

/**
 * 학습 세션(행 배우기/다시 배우기) — "처음 배우는 줄"(글자 전부 level 0)이면 글자마다
 * [만나기 → 보고 고르기 → 듣고 고르기 → 따라 쓰기(대문자 → 소문자, 알파벳만)]를 순서대로
 * 이어 붙이고, 마지막에 전체를 섞은 확인 문제를 덧붙인다. 이미 한 번이라도 배운 줄을
 * "다시 배우기"로 들어온 경우는 복습과 같은 랜덤 테스트형으로 바로 들어간다(만나기 생략).
 */
export const buildLearnSteps = (script, chars, pool) => {
  if (!isFreshRow(chars)) {
    return buildRandomTestSteps(script, chars, pool, 'relearn');
  }
  const steps = [];
  for (const item of chars) {
    steps.push(buildIntroStep(script, item, pool));
    steps.push(buildChoiceStep(script, item, pool, 'seePick', 'learn'));
    steps.push(buildChoiceStep(script, item, pool, 'listenPick', 'learn'));
    traceVariantsFor(script).forEach((variant) => {
      steps.push(buildTraceStep(script, item, 'learn', variant));
    });
  }
  const checkCount = Math.min(chars.length, 5);
  const checkItems = shuffle(chars).slice(0, checkCount);
  checkItems.forEach((item, idx) => {
    const kind = idx % 2 === 0 ? 'seePick' : 'listenPick';
    steps.push(buildChoiceStep(script, item, pool, kind, `check-${idx}`));
  });
  return steps;
};

/** 복습 세션 — 랜덤 테스트형(보고 고르기·듣고 고르기·따라 쓰기, 글자·유형 랜덤). */
export const buildReviewSteps = (script, chars, pool) => buildRandomTestSteps(script, chars, pool, 'review');

/** '이미 알아요' 확인 테스트 — 랜덤 테스트형에서 최대 5문제만 뽑는다(짧은 확인용). */
export const buildSkipCheckSteps = (script, chars, pool) => {
  const all = buildRandomTestSteps(script, chars, pool, 'skip');
  return all.slice(0, Math.min(5, all.length));
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
