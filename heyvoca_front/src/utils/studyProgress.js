/*
  상단 진행바 계산(듀오링고 방식) — 순수 함수. 외부 상태 없이 testQuestions 만으로 다시 계산되므로
  이탈 후 복원·Main 재마운트에서도 같은 값이 나온다.

  - 분모: 학습 시작 시 정해진 "채점 단위" 총수. 단일 문제 = 1단위, 카드 맞추기류(words[]) = 세트 안
    단어 수. 비채점 슬라이드(wordIntro·scriptIntro·phaseNotice)와 재출제(isRetry)는 분모에 넣지 않는다.
  - 분자: 채워진 단위 수. 채점 순간 정답이면 즉시 채워지고(오답은 그대로), 틀린 단위는 그 단어의
    재출제를 맞혔을 때 채워진다. 단위별로 최대 1번만 채워지고(unfilled 로 clamp) 분모를 넘지 않는다.
  - 단위 ↔ 재출제 연결은 단어 id(vocaIndexId ?? id) 로 한다. 같은 단어의 단위가 여러 개(plant 단계 등)여도
    "틀린 단위 수"만큼만 재출제 정답이 채운다.
*/
const NO_GRADE = ['wordIntro', 'scriptIntro', 'phaseNotice'];
const wordKey = (w) => w?.vocaIndexId ?? w?.id;

export const computeStudyProgress = (questions) => {
  let total = 0;
  const unfilledByWord = new Map(); // 단어 id -> 아직 안 채워진 원본 단위 수
  const filledUnits = new Set(); // `${원본 순번}` 또는 `${원본 순번}:${단어 id}`
  const retryCorrectByWord = new Map(); // 단어 id -> 정답으로 끝낸 재출제 수
  let ordinal = 0;

  (questions ?? []).forEach((q) => {
    if (!q || NO_GRADE.includes(q.questionType)) return;
    const isSet = Array.isArray(q.words);
    if (q.isRetry) {
      if (isSet) {
        q.words.forEach((w) => {
          if (w.isCorrect === true) retryCorrectByWord.set(wordKey(w), (retryCorrectByWord.get(wordKey(w)) ?? 0) + 1);
        });
      } else if (q.isCorrect === true) {
        retryCorrectByWord.set(wordKey(q), (retryCorrectByWord.get(wordKey(q)) ?? 0) + 1);
      }
      return;
    }
    const base = ordinal++;
    const units = isSet ? q.words.map((w) => [`${base}:${wordKey(w)}`, wordKey(w), w.isCorrect === true])
      : [[`${base}`, wordKey(q), q.isCorrect === true]];
    units.forEach(([key, wid, ok]) => {
      total += 1;
      if (ok) filledUnits.add(key);
      else unfilledByWord.set(wid, (unfilledByWord.get(wid) ?? 0) + 1);
    });
  });

  let done = filledUnits.size;
  unfilledByWord.forEach((unfilled, wid) => {
    done += Math.min(unfilled, retryCorrectByWord.get(wid) ?? 0);
  });
  return { total, done: Math.min(done, total) };
};
