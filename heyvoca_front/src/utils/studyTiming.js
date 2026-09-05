// 학습/테스트 채점 후 다음 슬라이드로 넘어가기까지의 지연(ms).
// 오답은 사용자가 정답·해설을 충분히 인지할 수 있도록 더 천천히 넘긴다.
export const ADVANCE_DELAY_CORRECT = 1000;
export const ADVANCE_DELAY_WRONG = 2500;

/*
  단계가 오른 정답은 더 오래 붙잡는다.

  진화 연출(FarmStatusBar)이 딱 1000ms 다 — ADVANCE_DELAY_CORRECT 와 같은 값이라,
  막대가 다 차고 작물이 자리를 잡는 **바로 그 프레임**에 화면이 넘어갔다.
  가장 보여 줘야 할 순간이 매번 잘려 나간 셈이다.
  연출이 끝난 뒤 결과(새 작물 · 다음 복습일)를 읽을 시간을 1.2초 더 준다.
  오답(2500ms)보다는 짧게 유지한다 — 성과를 보는 시간이 실수를 보는 시간보다
  길어지면 학습 리듬이 늘어진다.
*/
export const ADVANCE_DELAY_GROW = 2200;

// 정답 여부에 따른 전환 지연을 반환.
export const getAdvanceDelay = (isCorrect) =>
  isCorrect ? ADVANCE_DELAY_CORRECT : ADVANCE_DELAY_WRONG;
