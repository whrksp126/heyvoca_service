// src/utils/scriptQuestions.js
//
// 글자(문자 학습) 문제 구성 — 학습하기(TakeTest)가 쓰는 "question" 배열을 만든다.
// 글자 하나 = 단어 하나(2026-09-30 개편): 세션 자체는 새 씨앗 심기(pages/TakeTest.jsx
// buildPlantTestQuestions)와 같은 자리에서 조립되고, 결과는 TakeTest의 일반 문제 배열과
// 똑같은 모양(questionType·options/resultIndex·fsrs·vocaIndexId…)으로 나온다 — Main.jsx가
// 유형을 구분하지 않고 같은 진행바·재출제·/study/log 경로를 그대로 태운다.
//
// 예전 utils/scriptSession.js(별도 ScriptSessionNewFullSheet 전용 스텝 빌더)를 대체한다.

import { resolveConfusables, getStaticChar, staticDistractorPool } from './scriptData';

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
  // 세션 글자만으로 오답 3개를 못 채우면(글자 1~3개짜리 세션·재출제) 스크립트 전체 정적 목록으로 보충
  const safePool = (pool || []).length >= 4 ? pool : staticDistractorPool(word.script);
  const distractors = buildDistractors(word, safePool, 3);
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
 * [만나기 → 따라 쓰기(알파벳은 대/소문자 각각) → 보고 고르기 → 듣고 고르기]를 순서대로
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
    traceVariantsFor(script).forEach((variant) => out.push(buildScriptTraceQuestion(word, variant)));
    out.push(buildScriptChoiceQuestion(word, pool, 'scriptSeePick'));
    out.push(buildScriptChoiceQuestion(word, pool, 'scriptListenPick'));
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

/**
 * 글자 하나 깊게 — 상세 시트(ScriptCharDetailNewBottomSheet)의 "배우기"/"연습하기"(2026-10 개편).
 * 처음 배우는 것과 같은 수준으로 그 글자 하나만 반복한다:
 *   글자 카드(만나기) → 따라 쓰기(획순) → 보고 고르기 → 듣고 고르기 → 보고 고르기 → 듣고 고르기
 * (오답 보기는 매번 새로 섞는다 — 같은 보기 넷을 두 번 보지 않게). 예전에는 이미 배운 글자의
 * "연습하기"가 mode=review 로 서버가 고른 다른 글자 20개를 섞어 냈다.
 */
export const buildScriptSingleCharQuestions = (script, word, pool) => {
  const out = [buildScriptIntroQuestion(script, word, pool)];
  traceVariantsFor(script).forEach((variant) => out.push(buildScriptTraceQuestion(word, variant)));
  out.push(buildScriptChoiceQuestion(word, pool, 'scriptSeePick'));
  out.push(buildScriptChoiceQuestion(word, pool, 'scriptListenPick'));
  out.push(buildScriptChoiceQuestion(word, pool, 'scriptSeePick'));
  out.push(buildScriptChoiceQuestion(word, pool, 'scriptListenPick'));
  return out;
};

/* ─── 복습 응용(2026-10) ─────────────────────────────────────────────────────────── */

/** 듣고 쓰기 — 소리만 듣고 빈 판에 직접 쓴다(가이드 획 없음). 채점은 utils/scriptWriteGrader.js. */
export const buildScriptListenWriteQuestion = (word, traceVariant = null) => ({
  ...word,
  questionType: 'scriptListenWrite',
  traceVariant,
  isCorrect: null,
  userResultIndex: null,
});

// 한글 음절에 받침 ㄴ 을 붙인다(か+ん → 칸). 받침이 이미 있으면 null.
const addNieun = (syllable) => {
  const code = syllable?.charCodeAt(0);
  if (!code || code < 0xAC00 || code > 0xD7A3) return null;
  if ((code - 0xAC00) % 28 !== 0) return null;
  return String.fromCharCode(code + 4);
};

/** 가나 글자 단위 배열 → 한글 근사 발음·로마자. ん은 앞 음절 받침으로 붙인다. */
export const unitsReading = (script, units) => {
  let hangul = '';
  const romaji = [];
  (units || []).forEach((u) => {
    const it = getStaticChar(script, u);
    romaji.push(it?.romaji || '');
    const h = it?.hangul || u;
    if ((u === 'ん' || u === 'ン') && hangul) {
      const merged = addNieun(hangul.slice(-1));
      hangul = merged ? hangul.slice(0, -1) + merged : `${hangul}${h}`;
      return;
    }
    hangul += h;
  });
  return { hangul, romaji: romaji.join('') };
};

/** 가나 문자열을 글자 단위로 자른다(요음 2자 단위 우선). 스크립트에 없는 글자가 있으면 null. */
export const splitKanaUnits = (script, text) => {
  const units = [];
  let i = 0;
  while (i < (text || '').length) {
    const two = text.slice(i, i + 2);
    if (two.length === 2 && getStaticChar(script, two)) { units.push(two); i += 2; continue; }
    if (getStaticChar(script, text[i])) { units.push(text[i]); i += 1; continue; }
    return null;
  }
  return units;
};

// 오답 조합 — 한 글자를 혼동 글자(우선) 또는 다른 배운 글자로 바꾼다.
const mutateUnits = (script, units, learnedChars) => {
  const idx = Math.floor(Math.random() * units.length);
  const target = units[idx];
  const conf = (getStaticChar(script, target)?.confusables) || [];
  const learnedConf = conf.filter((c) => learnedChars.includes(c));
  const pool = learnedConf.length > 0 ? learnedConf : learnedChars.filter((c) => c !== target);
  if (pool.length === 0) return null;
  const next = [...units];
  next[idx] = pool[Math.floor(Math.random() * pool.length)];
  return next;
};

/**
 * 조합 단어 문제 — 배운 글자로만 된 2~3글자 단어.
 *   scriptWordRead   : 단어(가나)+뜻을 보고 발음(한글 근사·로마자)을 고른다.
 *   scriptWordListen : 소리를 듣고 글자 조합을 고른다.
 * entry = { units, reading, word, meaning, real } — 실제 단어(일한 사전, 서버 /script/session
 * mode=review 의 words)가 우선이고 모자라면 무의미 조합(real:false, 뜻 없음)으로 채운다.
 * 기록은 이 단어에 들어 있는 이번 세션 글자 하나(word — 글자=단어)로 한다.
 */
export const buildScriptWordQuestion = (word, entry, kind, learnedChars, bank = []) => {
  const script = word.script;
  const key = (units) => units.join('');
  const seen = new Set([key(entry.units)]);
  const wrong = [];
  const sameLen = shuffle(bank.filter((b) => b.units.length === entry.units.length && !seen.has(key(b.units))));
  // 오답 절반은 한 글자만 바꾼 조합(헷갈리는 글자), 나머지는 다른 단어
  for (let tries = 0; tries < 12 && wrong.length < 2; tries++) {
    const m = mutateUnits(script, entry.units, learnedChars);
    if (m && !seen.has(key(m))) { seen.add(key(m)); wrong.push(m); }
  }
  for (const b of sameLen) {
    if (wrong.length >= 3) break;
    if (!seen.has(key(b.units))) { seen.add(key(b.units)); wrong.push(b.units); }
  }
  for (let tries = 0; tries < 20 && wrong.length < 3; tries++) {
    const m = mutateUnits(script, entry.units, learnedChars);
    if (m && !seen.has(key(m))) { seen.add(key(m)); wrong.push(m); }
  }
  const toOption = (units) => {
    const r = unitsReading(script, units);
    return kind === 'scriptWordRead'
      ? { key: key(units), label: r.hangul, labelSub: r.romaji }
      : { key: key(units), label: key(units), labelSub: '' };
  };
  // 발음 고르기는 한글 근사가 같은 조합(ぢ/じ 등)이 섞이면 정답이 둘이 된다 — 표기 기준으로 한 번 더 거른다
  const correct = toOption(entry.units);
  const labels = new Set([correct.label]);
  const wrongOpts = wrong.map(toOption).filter((o) => (labels.has(o.label) ? false : (labels.add(o.label), true)));
  const options = shuffle([correct, ...wrongOpts.slice(0, 3)]);
  return {
    ...word,
    questionType: kind,
    wordPrompt: {
      units: entry.units,
      reading: entry.reading || key(entry.units),
      word: entry.word || null,
      meaning: entry.meaning || null,
      real: !!entry.real,
    },
    options,
    resultIndex: options.findIndex((o) => o.key === correct.key),
    isCorrect: null,
    userResultIndex: null,
  };
};

/** 무의미 조합 — 세션 글자 하나 + 다른 배운 글자 1개(합쳐서 가나 3자 이하 — 서버 TTS 사전 검증 면제 범위). */
const nonsenseEntry = (focusChar, learnedChars) => {
  const others = learnedChars.filter((c) => c !== focusChar && c.length === 1);
  if (others.length === 0) return null;
  const other = others[Math.floor(Math.random() * others.length)];
  const units = Math.random() < 0.5 ? [focusChar, other] : [other, focusChar];
  if (units.join('').length > 3) return null;
  return { units, reading: units.join(''), word: null, meaning: null, real: false };
};

/** 듣기 카드 맞추기 — 스피커 카드 ↔ 글자 카드. 세트당 글자 2~4개. */
export const buildScriptListenMatchSets = (words) => {
  const chunks = [];
  const pool = shuffle(words);
  for (let i = 0; i + 1 < pool.length && chunks.length < 2; i += 4) {
    const chunk = pool.slice(i, i + 4);
    if (chunk.length >= 2) chunks.push(chunk);
  }
  return chunks.map((chunk, i) => ({
    questionType: 'scriptListenMatch',
    id: `scriptListenMatch-set-${i}-${Date.now()}`,
    script: chunk[0].script,
    words: shuffle(chunk),
    vocabularySheetId: chunk[0].vocabularySheetId,
    isCorrect: null,
  }));
};

const REVIEW_MAX_CHARS = 10;
const REVIEW_WORD_QUESTIONS = 6;

/**
 * 글자 복습(학습장 상단 "글자 복습") — 배운 글자들을 응용 문제로 다시 학습한다.
 * 서버가 숙달 낮은 순으로 준 글자 중 앞 10개만 쓴다(세션 길이 ~25문제).
 *   글자마다 2문제: [보고 고르기 | 듣고 고르기 | 듣고 쓰기] 중 둘(듣고 쓰기는 획 데이터가 있는 글자만)
 *   + 조합 단어 6문제(보고 발음 고르기 / 듣고 조합 고르기 번갈아) + 듣기 카드 맞추기 1~2세트
 */
export const buildScriptReviewQuestions = (script, words, pool, wordBank = [], learnedChars = []) => {
  const chars = words.slice(0, REVIEW_MAX_CHARS);
  const isKana = script !== 'alphabet';
  const singles = [];
  chars.forEach((word) => {
    const canWrite = !Array.isArray(word.item?.compound);
    const kinds = shuffle(['scriptSeePick', 'scriptListenPick', ...(canWrite ? ['scriptListenWrite'] : [])]).slice(0, 2);
    kinds.forEach((kind) => {
      if (kind === 'scriptListenWrite') {
        const variant = script === 'alphabet' ? (Math.random() < 0.5 ? 'upper' : 'lower') : null;
        singles.push(buildScriptListenWriteQuestion(word, variant));
      } else {
        singles.push(buildScriptChoiceQuestion(word, pool, kind));
      }
    });
  });

  // 조합 단어 — 가나만. 실제 단어 우선, 이번 세션 글자가 든 단어에 그 글자로 기록한다.
  const wordQs = [];
  if (isKana) {
    const learned = learnedChars.length > 0 ? learnedChars : words.map((w) => w.char);
    const bank = (wordBank || [])
      .map((b) => ({ ...b, units: Array.isArray(b.units) ? b.units : splitKanaUnits(script, b.reading), real: true }))
      .filter((b) => b.units && b.units.length >= 2);
    const byChar = new Map(chars.map((w) => [w.char, w]));
    const used = new Set();
    for (const entry of shuffle(bank)) {
      if (wordQs.length >= REVIEW_WORD_QUESTIONS) break;
      const owner = entry.units.map((u) => byChar.get(u)).find(Boolean);
      if (!owner || used.has(entry.reading)) continue;
      used.add(entry.reading);
      const kind = wordQs.length % 2 === 0 ? 'scriptWordRead' : 'scriptWordListen';
      wordQs.push(buildScriptWordQuestion(owner, entry, kind, learned, bank));
    }
    for (let tries = 0; wordQs.length < Math.min(REVIEW_WORD_QUESTIONS, chars.length * 2) && tries < 30; tries++) {
      const owner = chars[tries % chars.length];
      if (owner.char.length > 1) continue;
      const entry = nonsenseEntry(owner.char, learned.filter((c) => c.length === 1));
      if (!entry || used.has(entry.reading)) continue;
      used.add(entry.reading);
      const kind = wordQs.length % 2 === 0 ? 'scriptWordRead' : 'scriptWordListen';
      wordQs.push(buildScriptWordQuestion(owner, entry, kind, learned, bank));
    }
  }

  const matchSets = chars.length >= 2 ? buildScriptListenMatchSets(chars) : [];

  // 글자 문제를 섞고, 조합 단어는 뒤쪽 2/3 구간에 흩어 넣고, 카드 맞추기는 중간·끝에 둔다.
  const mixed = shuffle(singles);
  for (let i = 1; i < mixed.length; i++) {
    if (mixed[i].char === mixed[i - 1].char) {
      const j = mixed.findIndex((q, k) => k > i && q.char !== mixed[i - 1].char);
      if (j !== -1) [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }
  }
  wordQs.forEach((q, idx) => {
    const start = Math.floor(mixed.length / 3);
    const pos = start + Math.floor(((idx + 1) * (mixed.length - start)) / (wordQs.length + 1));
    mixed.splice(Math.min(pos + idx, mixed.length), 0, q);
  });
  if (matchSets[0]) mixed.splice(Math.floor(mixed.length / 2), 0, matchSets[0]);
  if (matchSets[1]) mixed.push(matchSets[1]);
  return mixed;
};

/**
 * mode('learn'|'practice'|'review')에 따라 문제 배열을 구성한다.
 *   learn    — 상단 "새 글자 배우기"(다음 순서 글자들) 또는 시트의 "배우기"(글자 하나)
 *   practice — 시트의 "연습하기"(이미 배운 글자 하나, 처음 배우기와 같은 깊이)
 *   review   — 상단 "글자 복습"(배운 글자들 응용)
 * 글자 하나짜리 learn/practice 는 같은 "글자 하나 깊게" 구성을 쓴다.
 *
 * 풀(오답 후보)은 기본으로 이 세션의 글자들(words) 자신이지만, 칸 하나짜리 세션(글자 1개)
 * 처럼 words만으로는 사지선다를 채울 수 없는 경우 호출부가 별도 pool(대개
 * utils/scriptData.js buildDistractorPool로 만든 스크립트 전체 목록)을 넘긴다.
 * extra = { wordBank, learnedChars } — 복습 조합 단어 문제용(ScriptFieldBody startSession).
 */
export const buildScriptTestQuestions = (script, words, mode, pool, extra = {}) => {
  const distractorPool = Array.isArray(pool) && pool.length > 0 ? pool : words;
  if (mode === 'review') {
    return buildScriptReviewQuestions(script, words, distractorPool, extra.wordBank, extra.learnedChars);
  }
  if (words.length === 1) return buildScriptSingleCharQuestions(script, words[0], distractorPool);
  return buildScriptLearnQuestions(script, words, distractorPool);
};
