// 게스트 맛보기용 문제 생성 — 선택한 레벨 단어장 단어로 로컬 문제 배열 생성.
// 실제 takeTest UI가 읽는 question 스키마와 동일하게 만든다 (서버 추천/세션 없이).
// 유형: 사지선다 / 사지선다(듣기) / 카드맞추기 / 카드맞추기(듣기) 각 1문제.

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const firstMeaning = (m) => {
  if (!Array.isArray(m) || m.length === 0) return '';
  return typeof m[0] === 'string' ? m[0] : (m[0]?.meaning || '');
};

// meanings를 문자열 배열로 정규화 (사지선다 options / 카드매치 표시 공용)
const toMeaningStrings = (m) => (Array.isArray(m) ? m : [])
  .map((x) => (typeof x === 'string' ? x : (x?.meaning || '')))
  .filter(Boolean);

const fsrsStub = () => {
  const now = new Date();
  const next = new Date();
  next.setDate(next.getDate() + 3);
  return {
    state: 'new', stability: 0, difficulty: 0, retrievability: 0,
    next_review: next.toISOString(), last_review: now.toISOString(), reps: 0, lapses: 0,
  };
};

// 사지선다형 1문제 (multipleChoice / multipleChoiceListening 공용).
// 정답 뜻 + 다른 단어 뜻 3개를 보기로. voca_id를 vocaIndexId/id로 사용 → migrate 답안 매칭.
function buildChoiceQuestion(word, pool, questionType) {
  const wid = word.voca_id;
  const distractors = shuffle(pool.filter((x) => x.voca_id !== wid))
    .slice(0, 3)
    .map((x) => ({ id: x.voca_id, origin: x.origin, meanings: x.meanings }));
  const correctOption = { id: wid, origin: word.origin, meanings: word.meanings };
  const options = shuffle([correctOption, ...distractors]);
  const resultIndex = options.findIndex((o) => o.id === wid);

  return {
    id: wid,
    vocaIndexId: wid,
    vocabularySheetId: 'guest-trial',
    origin: word.origin,
    meanings: word.meanings,
    examples: word.examples || [],
    fsrs: fsrsStub(),
    priorityBucket: 'new',
    suggestedQuestionType: questionType,
    reason: null,
    questionType,
    options,
    resultIndex,
    isCorrect: null,
    userResultIndex: null,
    displayNextReview: null,
    isRetry: false,
  };
}

// 카드매치 세트 1문제 (cardMatch / cardMatchListening 공용). words = 단어 객체 배열.
function buildCardMatchQuestion(words, questionType, idx) {
  return {
    questionType,
    id: `${questionType}-set-${idx}`,
    words: shuffle(words.map((w) => ({
      id: w.voca_id,
      vocaIndexId: w.voca_id,
      origin: w.origin,
      meanings: w.meanings,
      examples: w.examples || [],
      vocabularySheetId: 'guest-trial',
      fsrs: fsrsStub(),
      priorityBucket: 'new',
      isCorrect: null,
    }))),
    vocabularySheetId: 'guest-trial',
    isCorrect: null,
  };
}

/**
 * 첫날 심는 씨앗 수. 온보딩 첫 세션은 **이 수만큼 심고 끝난다** —
 * 오답은 맞힐 때까지 세션 뒤쪽에 다시 나오므로(기획 §5.3) 중간에 그만두지 않는 한
 * 여기 담긴 단어는 전부 심긴다. 하루 목표(daily_new_limit)는 **다음 날부터** 적용된다.
 */
export const ONBOARDING_FIRST_DAY_WORDS = 14;

// 유형별 분량 — 합이 ONBOARDING_FIRST_DAY_WORDS 가 되게 맞춘다.
// 한 유형만 반복하면 그 유형에만 익숙해져 '외운 척'이 되므로 네 유형을 돌린다.
const CHOICE_COUNT = 3;       // 뜻 고르기 3문항 = 3단어
const LISTEN_COUNT = 3;       // 듣고 고르기 3문항 = 3단어
const MATCH_SIZE = 4;         // 카드 맞추기 1세트 = 4단어
const MATCH_LISTEN_SIZE = 4;  // 듣고 맞추기 1세트 = 4단어

/**
 * words: [{origin, meanings, examples, voca_id}] (레벨 단어장)
 * 반환: takeTest용 question 배열 — 뜻 고르기 3 · 듣고 고르기 3 · 카드 맞추기 1세트 ·
 *   듣고 맞추기 1세트 = **14단어 8문항**.
 *   단어가 부족하면 가능한 만큼만 생성. 최소 4단어 미만이면 빈 배열.
 */
export function buildGuestQuestions(words) {
  const valid = (words || [])
    .filter((w) => w?.origin && firstMeaning(w.meanings) && w?.voca_id != null)
    .map((w) => ({ ...w, meanings: toMeaningStrings(w.meanings) }));
  if (valid.length < 4) return [];

  const pool = shuffle(valid);
  const used = new Set();

  // 아직 안 쓴 단어 1개 소비
  const takeOne = () => {
    for (const w of pool) {
      if (!used.has(w.voca_id)) { used.add(w.voca_id); return w; }
    }
    return null;
  };
  // 뜻(첫 뜻)이 서로 겹치지 않는 n개 단어 세트 소비 (카드매치 매칭 모호성 방지)
  const takeSet = (n) => {
    const set = [];
    const seenMeaning = new Set();
    for (const w of pool) {
      if (used.has(w.voca_id)) continue;
      const m = (w.meanings[0] || '').trim();
      if (!m || seenMeaning.has(m)) continue;
      seenMeaning.add(m);
      used.add(w.voca_id);
      set.push(w);
      if (set.length === n) break;
    }
    return set;
  };

  const questions = [];

  // 뜻 고르기 · 듣고 고르기를 번갈아 낸다 — 같은 유형이 연달아 나오면 지루하다
  for (let t = 0; t < Math.max(CHOICE_COUNT, LISTEN_COUNT); t += 1) {
    if (t < CHOICE_COUNT) {
      const w = takeOne();
      if (w) questions.push(buildChoiceQuestion(w, pool, 'multipleChoice'));
    }
    if (t < LISTEN_COUNT) {
      const w = takeOne();
      if (w) questions.push(buildChoiceQuestion(w, pool, 'multipleChoiceListening'));
    }
  }

  const cmSet = takeSet(MATCH_SIZE);
  if (cmSet.length >= 2) questions.push(buildCardMatchQuestion(cmSet, 'cardMatch', 0));

  const cmlSet = takeSet(MATCH_LISTEN_SIZE);
  if (cmlSet.length >= 2) questions.push(buildCardMatchQuestion(cmlSet, 'cardMatchListening', 1));

  return questions;
}

/** 문제 배열이 실제로 다루는 **고유 단어 수**. 문항 수가 아니라 심는 씨앗 수다. */
export function countGuestWords(questions) {
  const ids = new Set();
  (questions || []).forEach((q) => {
    if (Array.isArray(q?.words)) q.words.forEach((w) => ids.add(w.vocaIndexId ?? w.id));
    else if (q) ids.add(q.vocaIndexId ?? q.id);
  });
  return ids.size;
}
