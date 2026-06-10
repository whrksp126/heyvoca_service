// 학습/테스트 채점 후 다음 슬라이드로 넘어가기까지의 지연(ms).
// 오답은 사용자가 정답·해설을 충분히 인지할 수 있도록 더 천천히 넘긴다.
export const ADVANCE_DELAY_CORRECT = 1000;
export const ADVANCE_DELAY_WRONG = 2500;

// 정답 여부에 따른 전환 지연을 반환.
export const getAdvanceDelay = (isCorrect) =>
  isCorrect ? ADVANCE_DELAY_CORRECT : ADVANCE_DELAY_WRONG;
