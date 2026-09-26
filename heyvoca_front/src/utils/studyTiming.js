/*
  학습 채점 후 다음 슬라이드로 넘어가는 규칙 — **모든 문제 유형 공통**(2026-09-26 개편).
  실제 판정은 hooks/useStudyAdvanceGate.js 가 한다. 여기에는 숫자만 둔다.

  넘어가는 시각 = 아래 조건 중 **가장 늦은 것**

    ① 최소 대기      채점 시각 + (정답 1000ms / 오답 2500ms)
                     오답은 정답 선택지·해설을 읽을 시간이 더 필요하다.
    ② XP 연출        상태 바(FarmStatusBar)의 막대·숫자 카운트업이 끝난 시각 + 700ms(머무름)
                     "경험치가 오르는 도중에 넘어가 결과가 안 보인다"(2026-09-26 실기기 피드백).
                     오답(같은 세션 재출제)도 −XP 가 줄어드는 걸 본 뒤 넘어간다.
    ③ 읽기(TTS)      재생 중이면 끝난 시각 + 200ms

  상한(워치독)
    - 서버(/study/log) 응답이 늦어 XP 연출이 **시작조차 안 되면** 채점 후 3000ms 에 ②를 포기한다.
    - 연출이 시작됐지만 끝났다는 신호가 안 오면(언마운트 등) 채점 후 7000ms 에 강제로 넘긴다.
    - TTS 가 안 끝나면(네트워크 지연) ①의 시각 + 4000ms 에 ③을 포기한다.

  예전의 "진화하면 2200ms" 고정값(ADVANCE_DELAY_GROW)은 ②가 대신한다 — 진화 연출(1000ms)이
  끝난 뒤 700ms 를 머물므로 서버 응답이 늦어도 잘리지 않는다.
*/
export const ADVANCE_DELAY_CORRECT = 1000;
export const ADVANCE_DELAY_WRONG = 2500;

// ② XP 연출이 끝난 뒤 머무는 시간
export const FARM_DWELL_MS = 700;
// ② 서버 응답이 안 와 연출이 시작되지 않을 때 포기하는 시각(채점 기준)
export const FARM_START_WATCHDOG_MS = 3000;
// 전체 상한(채점 기준) — 어떤 신호가 빠져도 이 시각엔 넘어간다
export const ADVANCE_HARD_CAP_MS = 7000;

// ③ TTS 종료 뒤 여유 / TTS 워치독(①의 시각 기준)
export const TTS_ADVANCE_GRACE_MS = 200;
export const TTS_ADVANCE_WATCHDOG_MS = 4000;

// FarmStatusBar 연출 길이 — 막대(0.45s / 진화 0.9s) + 배지 카운트업 지연(0.1s)까지.
// FarmStatusBar 가 onSettled 를 이 시간 뒤에 부른다.
export const FARM_ANIM_MS = 600;
export const FARM_ANIM_GROW_MS = 1000;

// 정답 여부에 따른 최소 대기(①).
export const getAdvanceDelay = (isCorrect) =>
  isCorrect ? ADVANCE_DELAY_CORRECT : ADVANCE_DELAY_WRONG;
