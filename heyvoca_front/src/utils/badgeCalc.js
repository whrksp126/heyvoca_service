// badgeCalc.js
// Word 타입: { id: string, nextReviewAt: number } // ms 타임스탬프

export function shouldShowDot(words, now, lastSeenTime) {
  // 새로 기한 지난 단어가 1개 이상?
  return words.some(w => w.nextReviewAt <= now && w.nextReviewAt > lastSeenTime);
}

export function getOverdueCount(words, now) {
  return words.filter(w => w.nextReviewAt <= now).length;
}
