// 클라이언트-사이드 FSRS 정렬 (StudySetupNewBottomSheet의 "선택한 단어 학습" 흐름 전용).
// 백엔드 /study/recommend를 거치지 않는 사용자 선택 풀에 한해 사용.
import { isWordOverdue, getWordMemoryState, MEMORY_STATES } from './common';

/**
 * 망각곡선 기반 우선순위로 단어 배열 정렬 (FSRS 기반).
 * 단어 풀은 호출자가 미리 필터링한 상태로 전달.
 *
 * 우선순위:
 * 1순위: overdue (next_review 가장 오래된 것부터)
 * 2순위: 오늘 예정 (next_review === today)
 * 3순위: 단기(stability 0~10), next_review 임박 순
 * 4순위: 중기(stability 10~60), next_review 임박 순
 * 5순위: 장기(stability >= 60), next_review 임박 순
 * 6순위: 미학습(fsrs.state === 'new' 또는 fsrs 없음), 랜덤
 *
 * @param {Array} words - 필터링된 단어 풀
 * @returns {Array} - 우선순위 순서대로 concat한 단일 배열
 */
export function sortByForgettingPriority(words) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Fisher-Yates 셔플
  const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const getNextReviewDate = (w) => {
    const nr = w.fsrs?.next_review;
    return nr ? new Date(nr) : null;
  };

  // 1순위: overdue (next_review < today), 가장 오래된 것부터
  const overdue = words
    .filter(w => isWordOverdue(w))
    .sort((a, b) => {
      const dateA = getNextReviewDate(a) ?? new Date(0);
      const dateB = getNextReviewDate(b) ?? new Date(0);
      return dateA - dateB;
    });

  const overdueIds = new Set(overdue.map(w => w.id));

  // 2순위: 오늘 예정 (next_review === today)
  const todayScheduled = words.filter(w => {
    if (overdueIds.has(w.id)) return false;
    const d = getNextReviewDate(w);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    return d.getTime() === now.getTime();
  });
  const todayIds = new Set(todayScheduled.map(w => w.id));

  // 미학습 분리 (6순위 랜덤)
  const unlearned = words.filter(w => {
    if (overdueIds.has(w.id) || todayIds.has(w.id)) return false;
    return getWordMemoryState(w) === MEMORY_STATES.UNLEARNED;
  });
  const unlearnedIds = new Set(unlearned.map(w => w.id));

  // 나머지 (단기/중기/장기)
  const rest = words.filter(w =>
    !overdueIds.has(w.id) && !todayIds.has(w.id) && !unlearnedIds.has(w.id)
  );

  // 3순위: 단기 (stability 0~10), next_review 임박 순
  const shortTerm = rest
    .filter(w => {
      const stability = w.fsrs?.stability ?? 0;
      return stability >= 0 && stability < 10;
    })
    .sort((a, b) => {
      const dateA = getNextReviewDate(a) ?? new Date(8640000000000000);
      const dateB = getNextReviewDate(b) ?? new Date(8640000000000000);
      return dateA - dateB;
    });
  const shortTermIds = new Set(shortTerm.map(w => w.id));

  // 4순위: 중기 (stability 10~60), next_review 임박 순
  const mediumTerm = rest
    .filter(w => {
      const stability = w.fsrs?.stability ?? 0;
      return stability >= 10 && stability < 60 && !shortTermIds.has(w.id);
    })
    .sort((a, b) => {
      const dateA = getNextReviewDate(a) ?? new Date(8640000000000000);
      const dateB = getNextReviewDate(b) ?? new Date(8640000000000000);
      return dateA - dateB;
    });
  const mediumTermIds = new Set(mediumTerm.map(w => w.id));

  // 5순위: 장기 (stability >= 60), next_review 임박 순
  const longTerm = rest
    .filter(w => {
      const stability = w.fsrs?.stability ?? 0;
      return stability >= 60 && !shortTermIds.has(w.id) && !mediumTermIds.has(w.id);
    })
    .sort((a, b) => {
      const dateA = getNextReviewDate(a) ?? new Date(8640000000000000);
      const dateB = getNextReviewDate(b) ?? new Date(8640000000000000);
      return dateA - dateB;
    });

  // 6순위: 미학습 (랜덤)
  const shuffledUnlearned = shuffleArray(unlearned);

  return [
    ...overdue,
    ...todayScheduled,
    ...shortTerm,
    ...mediumTerm,
    ...longTerm,
    ...shuffledUnlearned,
  ];
}
