/**
 * 학습 세션 문제(단어)에 **학습 이력**을 채워 넣는다 — 문제 카드 우측 상단 "N일 전 학습"용.
 *
 * `/study/recommend` 응답의 fsrs 는 state/stability/difficulty/retrievability/next_review 만
 * 싣고 last_review·reps·lapses 가 없다(heyvoca_back routes/study.py). 그래서 이미 새싹인
 * 단어도 "첫 학습"으로 보였다(reviewTiming.js 상단 주석). 같은 사용자의 사전
 * (VocabularyContext.userDictionary ← GET /vocaIndexs)에는 전체 fsrs 와 농장 단계(farm.stage)가
 * 있으므로 빠진 키만 거기서 채운다.
 *
 * - 추천 응답에 있는 키는 **덮지 않는다**(같은 원천이고, 추천 쪽이 더 최신일 수 있다).
 * - 이어하기(recentStudy.study_data)로 복원된 문제에도 같은 걸 한 번 더 건다 — 저장된
 *   문제 객체도 추천 응답 모양이라 last_review 가 없다.
 * - 카드 맞추기 세트는 `words[]` 안의 단어마다 채운다.
 * - 원본 객체를 직접 고친다(문제 배열은 이미 새로 만든 것이고, 채점 로직이 같은 객체
 *   참조를 들고 fsrs 를 덮어쓰는 구조라 복사하면 참조가 갈라진다).
 */

const FSRS_FILL_KEYS = ['last_review', 'reps', 'lapses', 'elapsed_days', 'scheduled_days'];

const fillWord = (word, dict) => {
  if (!word || !dict) return;
  const id = word.vocaIndexId ?? word.id;
  if (id == null) return;
  const entry = dict[id] ?? dict[String(id)];
  if (!entry) return;
  const src = entry.fsrs;
  if (src && typeof src === 'object') {
    const dst = word.fsrs && typeof word.fsrs === 'object' ? word.fsrs : {};
    let changed = !word.fsrs;
    FSRS_FILL_KEYS.forEach((k) => {
      if (dst[k] == null && src[k] != null) { dst[k] = src[k]; changed = true; }
    });
    if (!dst.state && src.state) { dst.state = src.state; changed = true; }
    if (changed) word.fsrs = dst;
  }
  if (!word.farmStage && entry.farm?.stage) word.farmStage = entry.farm.stage;
};

export const attachStudyHistory = (questions, userDictionary) => {
  if (!Array.isArray(questions) || !userDictionary) return questions;
  questions.forEach((q) => {
    if (Array.isArray(q?.words)) q.words.forEach((w) => fillWord(w, userDictionary));
    else fillWord(q, userDictionary);
    // 사지선다 보기(options)는 단어 객체지만 시점 표시에 쓰이지 않으므로 건드리지 않는다.
  });
  return questions;
};

export default attachStudyHistory;
