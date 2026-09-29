// src/utils/scriptQuestions.js
//
// 글자(문자 학습) 문제 구성 — 학습하기(TakeTest)가 쓰는 "question" 배열을 만든다.
// 글자 하나 = 단어 하나(2026-09-30 개편): 세션 자체는 새 씨앗 심기(pages/TakeTest.jsx
// buildPlantTestQuestions)와 같은 자리에서 조립되고, 결과는 TakeTest의 일반 문제 배열과
// 똑같은 모양(questionType·options/resultIndex·fsrs·vocaIndexId…)으로 나온다 — Main.jsx가
// 유형을 구분하지 않고 같은 진행바·재출제·/study/log 경로를 그대로 태운다.
//
// 예전 utils/scriptSession.js(별도 ScriptSessionNewFullSheet 전용 스텝 빌더)를 대체한다.

import { resolveConfusables } from './scriptData';

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// 알파벳은 대문자·소문자를 각각 다른 따라 쓰기 문제로 낸다. 가나는 구분 없음(null 하나).
const traceVariantsFor = (script) => (script === 'alphabet' ? ['upper', 'lower'] : [null]);

/** 선택지 버튼 안 두 줄(한글 발음 크게 + 로마자 작게)로 쓸 { main, sub } — ChoiceCard가 쓴다.
 *  알파벳은 글자 이름(에이/와이…)만 크게 보여준다(가나는 로마자 보조를 유지). `option`은
 *  buildScriptChoiceQuestion이 만든 options 배열의 원소(=word, `.item`에 정적 데이터). */
export const optionMainSub = (script, option) => {
  const it = option?.item;
  if (!it) return { main: '', sub: '' };
  if (script === 'alphabet') return { main: it.name_hangul, sub: '' };
  return { main: it.hangul, sub: it.note ? '' : it.romaji };
};

/** 오답 선택지 — 혼동쌍(item.confusables)을 우선 채우고, 모자라면 풀에서 무작위 보충. */
const buildDistractors = (word, pool, count) => {
  const byChar = new Map((pool || []).map((p) => [p.char, p]));
  const confusableChars = word.item?.confusables || [];
  const confusables = confusableChars
    .map((c) => byChar.get(c))
    .filter((c) => c && c.char !== word.char);
  const confusableCharSet = new Set(confusables.map((c) => c.char));
  const rest = shuffle((pool || []).filter((p) => p.char !== word.char && !confusableCharSet.has(p.char)));
  return [...confusables, ...rest].slice(0, count);
};

/** ① 만나기 — 채점 없음(NO_GRADE_QUESTION_TYPES). 확인용 헷갈리는 글자는 정적 데이터 기준으로 미리 붙여 둔다. */
export const buildScriptIntroQuestion = (script, word, pool) => ({
  ...word,
  questionType: 'scriptIntro',
  confusables: resolveConfusables(script, word.item, pool.map((w) => w.item)),
  isCorrect: null,
  userResultIndex: null,
});

/** ②③ 보고 고르기 / 듣고 고르기 — 사지선다(단, 풀이 작으면 그보다 적을 수 있다). */
export const buildScriptChoiceQuestion = (word, pool, kind) => {
  const distractors = buildDistractors(word, pool, 3);
  const options = shuffle([word, ...distractors]);
  const resultIndex = options.findIndex((o) => o.char === word.char);
  return {
    ...word,
    questionType: kind, // 'scriptSeePick' | 'scriptListenPick'
    options,
    resultIndex,
    isCorrect: null,
    userResultIndex: null,
  };
};

/** ④ 따라 쓰기 — 채점은 컴포넌트가 자체적으로(StrokeTracer) 하고 완료 시 항상 정답 처리한다. */
export const buildScriptTraceQuestion = (word, traceVariant = null) => ({
  ...word,
  questionType: 'scriptTrace',
  traceVariant,
  isCorrect: null,
  userResultIndex: null,
});

/** 줄 전체가 아직 한 번도 학습되지 않았는지(모든 글자가 FSRS "new") — "처음 배우는 줄" 판정. */
export const isFreshRow = (words) =>
  (words || []).every((w) => (
    !w.fsrs || (!(Number(w.fsrs.reps) > 0) && (!w.fsrs.state || w.fsrs.state === 'new'))
  ));

/**
 * 학습("배우기") — 처음 배우는 글자(들)면 글자마다
 * [만나기 → 보고 고르기 → 듣고 고르기 → 따라 쓰기(알파벳은 대/소문자 각각)]를 순서대로
 * 이어 붙인다. 2026-09-30부터 칸 하나를 탭해 그 글자 하나만 배우는 것이 기본 진입점이라
 * (components/newBottomSheet/ScriptCharDetailNewBottomSheet.jsx) words는 대개 1개다 —
 * 글자가 하나뿐이면 이미 두 번(보고/듣고 고르기) 물었으니 마지막 확인 문제를 또 붙이지
 * 않는다(반복해서 같은 글자 하나만 다시 묻는 건 어색하다). 여러 글자를 한 번에 배우는
 * 경우(예: 이전 세션이 남긴 words)에는 최대 5문제짜리 확인 문제를 덧붙인다. 이미 한 번이라도
 * 배운 글자를 "다시 배우기"로 들어오면 만나기 없이 무작위 테스트형으로 바로 들어간다.
 */
export const buildScriptLearnQuestions = (script, words, pool) => {
  if (!isFreshRow(words)) return buildScriptRandomQuestions(script, words, pool);
  const out = [];
  for (const word of words) {
    out.push(buildScriptIntroQuestion(script, word, pool));
    out.push(buildScriptChoiceQuestion(word, pool, 'scriptSeePick'));
    out.push(buildScriptChoiceQuestion(word, pool, 'scriptListenPick'));
    traceVariantsFor(script).forEach((variant) => out.push(buildScriptTraceQuestion(word, variant)));
  }
  if (words.length > 1) {
    const checkCount = Math.min(words.length, 5);
    const checkItems = shuffle(words).slice(0, checkCount);
    checkItems.forEach((word, idx) => {
      const kind = idx % 2 === 0 ? 'scriptSeePick' : 'scriptListenPick';
      out.push(buildScriptChoiceQuestion(word, pool, kind));
    });
  }
  return out;
};

/**
 * 무작위 테스트형 — 만나기 없이 보고 고르기·듣고 고르기·따라 쓰기를 글자·유형 모두 랜덤
 * 순서로 배치한다(같은 글자·같은 유형이 바로 연속되지 않도록 그리디 스왑). 복습·다시 배우기
 * 공통("연습하기" — ScriptCharDetailNewBottomSheet, 학습장 상단 "글자 연습하기").
 */
export const buildScriptRandomQuestions = (script, words, pool) => {
  const combos = words.flatMap((word) => {
    const kinds = [{ kind: 'scriptSeePick' }, { kind: 'scriptListenPick' }];
    traceVariantsFor(script).forEach((variant) => kinds.push({ kind: 'scriptTrace', variant }));
    return kinds.map((k) => ({ word, ...k }));
  });
  const shuffled = shuffle(combos);
  for (let i = 1; i < shuffled.length; i++) {
    const prev = shuffled[i - 1];
    const clashes = shuffled[i].word.char === prev.word.char || shuffled[i].kind === prev.kind;
    if (!clashes) continue;
    const swapIdx = shuffled.findIndex((c, j) => (
      j > i && c.word.char !== prev.word.char && c.kind !== prev.kind
    ));
    if (swapIdx !== -1) {
      [shuffled[i], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[i]];
    }
  }
  return shuffled.map(({ word, kind, variant }) => (
    kind === 'scriptTrace'
      ? buildScriptTraceQuestion(word, variant)
      : buildScriptChoiceQuestion(word, pool, kind)
  ));
};

/** 복습 — 무작위 테스트형 그대로. */
export const buildScriptReviewQuestions = (script, words, pool) => buildScriptRandomQuestions(script, words, pool);

/**
 * mode('learn'|'review')에 따라 문제 배열을 구성한다.
 *
 * 풀(오답 후보)은 기본으로 이 세션의 글자들(words) 자신이지만, 칸 하나짜리 세션(글자 1개)
 * 처럼 words만으로는 사지선다를 채울 수 없는 경우 호출부가 별도 pool(대개
 * utils/scriptData.js buildDistractorPool로 만든 스크립트 전체 목록)을 넘긴다.
 */
export const buildScriptTestQuestions = (script, words, mode, pool) => {
  const distractorPool = Array.isArray(pool) && pool.length > 0 ? pool : words;
  if (mode === 'review') return buildScriptReviewQuestions(script, words, distractorPool);
  return buildScriptLearnQuestions(script, words, distractorPool);
};
