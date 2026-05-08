/**
 * @deprecated Phase 1.3부터 백엔드 GET /study/recommend가 정렬을 처리합니다.
 * 이 파일은 VITE_RECOMMEND_BACKEND=false 폴백 모드에서만 사용되며, Phase 1.4에서 삭제 예정.
 */
import { isWordOverdue, getWordMemoryState, MEMORY_STATES } from './common';

/**
 * 망각곡선 기반 우선순위로 단어 배열 정렬.
 * 단어 풀은 호출자가 미리 필터링한 상태로 전달.
 *
 * 우선순위:
 * 1순위: overdue (nextReview 가장 오래된 것부터)
 * 2순위: 오늘 예정 (nextReview === today)
 * 3순위: 단기(interval 1~10), nextReview 임박 순
 * 4순위: 중기(interval 10~60), nextReview 임박 순
 * 5순위: 장기(interval ≥ 60), nextReview 임박 순
 * 6순위: 미학습(repetition===0 && interval===0), 랜덤
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

  // 1순위: overdue (nextReview < today), 가장 오래된 것부터
  const overdue = words
    .filter(w => isWordOverdue(w))
    .sort((a, b) => {
      const dateA = new Date(a.sm2?.nextReview ?? a.nextReview);
      const dateB = new Date(b.sm2?.nextReview ?? b.nextReview);
      return dateA - dateB;
    });

  const overdueIds = new Set(overdue.map(w => w.id));

  // 2순위: 오늘 예정 (nextReview === today)
  const todayScheduled = words.filter(w => {
    if (overdueIds.has(w.id)) return false;
    const nextReview = w.sm2?.nextReview ?? w.nextReview;
    if (!nextReview) return false;
    const d = new Date(nextReview);
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

  // 3순위: 단기 (interval 1~10), nextReview 임박 순
  const shortTerm = rest
    .filter(w => {
      const interval = w.sm2?.interval ?? w.interval ?? 0;
      return interval > 0 && interval < 10;
    })
    .sort((a, b) => {
      const dateA = new Date(a.sm2?.nextReview ?? a.nextReview);
      const dateB = new Date(b.sm2?.nextReview ?? b.nextReview);
      return dateA - dateB;
    });
  const shortTermIds = new Set(shortTerm.map(w => w.id));

  // 4순위: 중기 (interval 10~60), nextReview 임박 순
  const mediumTerm = rest
    .filter(w => {
      const interval = w.sm2?.interval ?? w.interval ?? 0;
      return interval >= 10 && interval < 60 && !shortTermIds.has(w.id);
    })
    .sort((a, b) => {
      const dateA = new Date(a.sm2?.nextReview ?? a.nextReview);
      const dateB = new Date(b.sm2?.nextReview ?? b.nextReview);
      return dateA - dateB;
    });
  const mediumTermIds = new Set(mediumTerm.map(w => w.id));

  // 5순위: 장기 (interval ≥ 60), nextReview 임박 순
  const longTerm = rest
    .filter(w => {
      const interval = w.sm2?.interval ?? w.interval ?? 0;
      return interval >= 60 && !shortTermIds.has(w.id) && !mediumTermIds.has(w.id);
    })
    .sort((a, b) => {
      const dateA = new Date(a.sm2?.nextReview ?? a.nextReview);
      const dateB = new Date(b.sm2?.nextReview ?? b.nextReview);
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
