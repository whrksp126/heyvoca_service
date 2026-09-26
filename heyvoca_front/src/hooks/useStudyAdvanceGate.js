import { useEffect, useRef } from 'react';
import {
  FARM_DWELL_MS,
  FARM_START_WATCHDOG_MS,
  ADVANCE_HARD_CAP_MS,
  TTS_ADVANCE_GRACE_MS,
  TTS_ADVANCE_WATCHDOG_MS,
} from '../utils/studyTiming';

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
  }).current;

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
    s.onAdvance?.();
  };

  const attempt = () => {
    clear();
    if (!s.armed || s.fired) return;
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
    if (now >= waitUntil) {
      fire();
      return;
    }
    s.timer = setTimeout(attempt, waitUntil - now);
  };

  const gate = useRef({
    arm: ({ minDelayMs = 0, onAdvance } = {}) => {
      clear();
      s.armed = true;
      s.fired = false;
      s.gradedAt = Date.now();
      s.minDelayMs = minDelayMs;
      s.onAdvance = onAdvance;
      s.farmStartedAt = null;
      s.farmSettledAt = null;
      attempt();
    },
    disarm: () => {
      clear();
      s.armed = false;
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

  useEffect(() => () => {
    clear();
    s.armed = false;
    s.fired = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return gate;
}

export default useStudyAdvanceGate;
