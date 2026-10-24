import { useEffect, useRef, useState } from 'react';
import {
  FARM_DWELL_MS,
  FARM_START_WATCHDOG_MS,
  ADVANCE_HARD_CAP_MS,
  TTS_ADVANCE_GRACE_MS,
  TTS_ADVANCE_WATCHDOG_MS,
} from '../utils/studyTiming';

/*
  전역 홀드 — 콤보 보호 시트처럼 "사용자가 결정할 때까지 다음 슬라이드로 넘기면 안 되는" 순간에
  Main 이 holdStudyAdvance() 로 잡고, 결정이 끝나면 반환된 release() 를 부른다. 문제 화면의 모든 게이트
  (Main·플러그인 각자의 인스턴스)가 이 값 하나를 본다. 홀드 중에는 타이머를 걸지 않고(워치독 상한 포함),
  풀린 뒤 HOLD_RELEASE_GRACE_MS 만큼 더 보여 주고 넘긴다. release 는 여러 번 불러도 한 번만 센다.
*/
export const HOLD_RELEASE_GRACE_MS = 600;
let holdCount = 0;
let lastReleaseAt = 0;
const holdListeners = new Set();
export const holdStudyAdvance = () => {
  holdCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holdCount = Math.max(0, holdCount - 1);
    if (holdCount === 0) {
      lastReleaseAt = Date.now();
      holdListeners.forEach((fn) => fn());
    }
  };
};

/*
  수동 넘기기 모드 — 모든 학습 세션은 채점 후 자동으로 넘어가지 않고 '다음' 버튼을 눌러야
  넘어간다(2026-10-24 QA #15, 2차에서 심기 → 전 학습). Main 이 세션 동안 setStudyManualAdvance(true) 로 켠다. 켜져 있으면
  arm() 은 타이머를 걸지 않고 "누르면 넘어갈 함수"를 전역 대기값으로 올려 두며, Main 이
  useManualAdvancePending() 으로 그 값을 받아 '다음' 버튼을 그린다. 게이트를 쓰는 모든 유형
  (사지선다·빈칸 채우기·카드 맞추기·독해 …)이 자기 코드를 바꾸지 않고 같은 규칙을 따른다.
*/
let manualAdvanceMode = false;
let pendingManualAdvance = null;
const manualListeners = new Set();
const setPendingManual = (fn) => {
  pendingManualAdvance = fn;
  manualListeners.forEach((l) => l(fn));
};
export const setStudyManualAdvance = (on) => {
  manualAdvanceMode = !!on;
  if (!on && pendingManualAdvance) setPendingManual(null);
};
export const useManualAdvancePending = () => {
  const [pending, setPending] = useState(() => pendingManualAdvance);
  useEffect(() => {
    const l = (fn) => setPending(() => fn);
    manualListeners.add(l);
    setPending(() => pendingManualAdvance);
    return () => { manualListeners.delete(l); };
  }, []);
  return pending;
};

/**
 * 채점 → 다음 슬라이드 전환 게이트 — 모든 문제 유형 공통(규칙은 utils/studyTiming.js 상단).
 *
 *   const gate = useStudyAdvanceGate();
 *   gate.ttsBegin() / gate.ttsEnd()          // 게이트를 붙잡는 TTS 재생 시작·끝 (채점 전후 언제든)
 *   gate.arm({ minDelayMs, onAdvance })      // 채점 순간. 이 시각이 기준(gradedAt)이 된다
 *   gate.farmStarted() / gate.farmSettled()  // FarmStatusBar onAnimStart / onSettled
 *   gate.disarm()                            // 넘기지 않고 멈춤(수동 넘기기 등)
 *
 * 모든 이벤트는 같은 판정(attempt)을 다시 돌린다 — 가장 늦은 조건 시각까지 타이머를 걸고,
 * 새 신호가 오면 다시 계산한다. onAdvance 는 한 번만 불린다.
 * ref 만 쓰므로 리렌더를 일으키지 않는다.
 */
export function useStudyAdvanceGate() {
  const s = useRef({
    armed: false,
    fired: false,
    gradedAt: 0,
    minDelayMs: 0,
    onAdvance: null,
    farmStartedAt: null,
    farmSettledAt: null,
    ttsActive: false,
    ttsEndedAt: null,
    timer: null,
    manualFn: null,
  }).current;
  const dropManual = () => {
    if (s.manualFn && pendingManualAdvance === s.manualFn) setPendingManual(null);
    s.manualFn = null;
  };

  const clear = () => {
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
  };

  const fire = () => {
    if (s.fired) return;
    s.fired = true;
    s.armed = false;
    clear();
    dropManual();
    s.onAdvance?.();
  };

  const attempt = () => {
    clear();
    if (!s.armed || s.fired) return;
    if (s.manualFn) return; // 수동 넘기기 대기 중 — TTS·XP 신호로 넘기지 않는다
    if (holdCount > 0) return; // 홀드 중 — 풀리면 holdListeners 가 다시 판정한다
    const now = Date.now();
    const minReadyAt = s.gradedAt + s.minDelayMs;
    const hardCap = s.gradedAt + ADVANCE_HARD_CAP_MS;
    let waitUntil = minReadyAt;

    // ② XP 연출
    if (s.farmSettledAt != null) {
      waitUntil = Math.max(waitUntil, s.farmSettledAt + FARM_DWELL_MS);
    } else if (s.farmStartedAt != null) {
      // 연출 중 — 끝 신호(farmSettled)가 오면 다시 계산된다. 안 오면 상한까지.
      waitUntil = Math.max(waitUntil, hardCap);
    } else {
      const wd = s.gradedAt + FARM_START_WATCHDOG_MS;
      if (now < wd) waitUntil = Math.max(waitUntil, wd);
    }

    // ③ TTS
    if (s.ttsActive) {
      const wd = minReadyAt + TTS_ADVANCE_WATCHDOG_MS;
      if (now < wd) waitUntil = Math.max(waitUntil, wd);
    } else if (s.ttsEndedAt != null) {
      waitUntil = Math.max(waitUntil, s.ttsEndedAt + TTS_ADVANCE_GRACE_MS);
    }

    waitUntil = Math.min(waitUntil, hardCap);
    // 홀드가 이 채점 이후에 풀렸다면 풀린 시각 + 여유까지는 상한이 지났어도 넘기지 않는다.
    if (lastReleaseAt >= s.gradedAt) waitUntil = Math.max(waitUntil, lastReleaseAt + HOLD_RELEASE_GRACE_MS);
    if (now >= waitUntil) {
      fire();
      return;
    }
    s.timer = setTimeout(attempt, waitUntil - now);
  };

  const gate = useRef({
    arm: ({ minDelayMs = 0, onAdvance } = {}) => {
      clear();
      dropManual();
      s.armed = true;
      s.fired = false;
      s.gradedAt = Date.now();
      s.minDelayMs = minDelayMs;
      s.onAdvance = onAdvance;
      s.farmStartedAt = null;
      s.farmSettledAt = null;
      if (manualAdvanceMode) {
        // 수동 넘기기 — 타이머 없이 '다음' 버튼(Main)이 fire 를 부를 때까지 기다린다.
        s.manualFn = () => fire();
        setPendingManual(s.manualFn);
        return;
      }
      attempt();
    },
    disarm: () => {
      clear();
      s.armed = false;
      dropManual();
    },
    farmStarted: () => {
      if (!s.armed || s.fired) return;
      if (s.farmStartedAt == null) s.farmStartedAt = Date.now();
      // 연출이 다시 시작되면(백그라운드 복귀 재생 등) 이전 끝 신호는 무효
      s.farmSettledAt = null;
      attempt();
    },
    farmSettled: () => {
      if (!s.armed || s.fired) return;
      if (s.farmStartedAt == null) s.farmStartedAt = Date.now();
      s.farmSettledAt = Date.now();
      attempt();
    },
    ttsBegin: () => {
      s.ttsActive = true;
      s.ttsEndedAt = null;
      attempt();
    },
    ttsEnd: () => {
      if (!s.ttsActive) return;
      s.ttsActive = false;
      s.ttsEndedAt = Date.now();
      attempt();
    },
    isArmed: () => s.armed && !s.fired,
  }).current;

  useEffect(() => {
    const onRelease = () => attempt();
    holdListeners.add(onRelease);
    return () => { holdListeners.delete(onRelease); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    clear();
    dropManual();
    s.armed = false;
    s.fired = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return gate;
}

export default useStudyAdvanceGate;
