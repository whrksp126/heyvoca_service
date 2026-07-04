// 게스트 맛보기용 문제 생성 — 선택한 레벨 단어장 단어로 로컬 multipleChoice 문제 배열 생성.
// 실제 takeTest UI가 읽는 question 스키마와 동일하게 만든다 (서버 추천/세션 없이).

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

/**
 * words: [{origin, meanings, examples, voca_id}] (레벨 단어장)
 * count: 출제 수 (기본 5)
 * 반환: takeTest용 question 배열 (questionType: multipleChoice)
 *   각 question은 voca_id를 vocaIndexId/id로 사용 → migrate 답안 매칭에 재사용.
 */
export function buildGuestQuestions(words, count = 5) {
  const valid = (words || []).filter((w) => w?.origin && firstMeaning(w.meanings));
  if (valid.length < 4) return [];

  const picked = shuffle(valid).slice(0, Math.min(count, valid.length));

  return picked.map((w, idx) => {
    const wid = w.voca_id ?? idx;
    // 오답 보기 3개 — 같은 단어장 다른 단어의 뜻에서
    const distractors = shuffle(valid.filter((x) => (x.voca_id ?? -1) !== wid))
      .slice(0, 3)
      .map((x, i) => ({ id: x.voca_id ?? `d-${i}`, origin: x.origin, meanings: x.meanings }));

    const correctOption = { id: wid, origin: w.origin, meanings: w.meanings };
    const options = shuffle([correctOption, ...distractors]);
    const resultIndex = options.findIndex((o) => o.id === wid);

    const now = new Date();
    const next = new Date();
    next.setDate(next.getDate() + 3);

    return {
      id: wid,
      vocaIndexId: wid,
      vocabularySheetId: 'guest-trial',
      origin: w.origin,
      meanings: w.meanings,
      examples: w.examples || [],
      fsrs: { state: 'new', stability: 0, difficulty: 0, retrievability: 0, next_review: next.toISOString(), last_review: now.toISOString(), reps: 0, lapses: 0 },
      priorityBucket: 'new',
      suggestedQuestionType: 'multipleChoice',
      reason: null,
      questionType: 'multipleChoice',
      options,
      resultIndex,
      isCorrect: null,
      userResultIndex: null,
      displayNextReview: null,
      isRetry: false,
    };
  });
}
