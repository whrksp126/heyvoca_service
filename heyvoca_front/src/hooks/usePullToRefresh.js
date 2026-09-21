// src/hooks/usePullToRefresh.js
//
// 당겨서 새로고침(pull-to-refresh) — 바텀 탭 5개(홈·단어장·찾기·상점·마이) 전용 제스처 훅.
//
// 설계
//   · 대상 스크롤 요소(scrollRef)가 scrollTop===0 일 때만 아래로 당기는 제스처를 가로챈다.
//   · 당김 거리는 framer-motion MotionValue(pull)로 관리한다 — touchmove마다 React state를
//     갱신하지 않고 MotionValue.set()만 호출해 리렌더 없이 60fps로 이어진다.
//   · phase(React state)는 아이콘 전환 같은 "저빈도 이산 상태"에만 쓴다.
//     idle → pulling → ready → refreshing → done → idle
//
// ── 브라우저가 제스처를 가로채지 못하게 하는 방법(핵심) ─────────────────────────────
// 실기기(Android WebView) QA에서 "당긴 채 손을 안 뗐는데 풀린다 / 살짝 위로 움직이면
// 콘텐츠가 스크롤되며 풀린다"가 계속 재현됐다. 확인된 메커니즘:
//   1) touchmove.preventDefault()는 브라우저가 "이 터치 시퀀스는 스크롤이 아니다"라고
//      판단하는 유일한 신호인데, 첫 touchmove에서 방향 판정을 기다리느라 preventDefault를
//      건너뛰거나, 메인 스레드가 바빠(홈의 애니메이션 등) 브라우저의 터치 ack 타임아웃
//      (~200ms) 안에 응답하지 못하면 브라우저가 스크롤 제스처를 선점한다. 그 뒤로는 모든
//      touchmove가 cancelable=false 가 되어 preventDefault가 무시되고, 손가락이 조금만
//      위로 가도 컨테이너가 실제로 스크롤된다(scrollTop>0).
//   2) 예전 코드는 scrollTop>0 을 "일반 스크롤로 전환됨"으로 보고 reset 했다 — 즉 브라우저
//      선점 + 손떨림 1px 만으로 제스처가 풀렸다. 스크롤할 콘텐츠가 없는 화면(단어장 목록)
//      에서만 멀쩡했던 이유가 이것이다.
// 대응(전부 아래 구현):
//   · 방향이 정해지기 전(6px 슬롭 안)에도 touchmove를 전부 preventDefault 한다. 위/가로로
//     판정되면 그때부터 막지 않으므로 브라우저는 그 다음 move부터 정상 스크롤을 시작한다
//     (6px 지연은 체감되지 않는다).
//   · 아래로 판정된 순간 컨테이너를 잠근다: overflow-y:hidden + scrollTop=0. 브라우저가
//     이미 선점했더라도 다음 커밋부터는 스크롤 대상이 사라져 콘텐츠가 움직이지 않고, 우리는
//     (cancelable 여부와 무관하게 계속 들어오는) touchmove로 pull 을 갱신한다.
//   · 제스처가 살아 있는 동안 scrollTop 변화·역방향 이동·손떨림 어느 것도 리셋 사유가 아니다.
//     최종 판정(복귀 vs 새로고침)은 오직 touchend 에서만 내린다. touchcancel 은 "브라우저가
//     손을 뗐다고 보증하지 않는" 이벤트라 즉시 판정하지 않고 붙들어 둔다(아래 참고).
//   · React state(phase) 갱신은 rAF 로 미뤄 터치 핸들러 자체는 항상 가볍게 끝낸다(ack 지연 방지).
//
// touchcancel: 같은 손가락이 새 touchstart 로 돌아오면 이어받고, CANCEL_SAFETY_MS 안에
// 아무 입력도 없으면 그때 판정한다(무한 대기 방지용 안전장치일 뿐, 정상 경로가 아니다).
//
// 진단: 설정 > "당겨서 새로고침 진단 표시"(localStorage ptr.debug=1)를 켜면 이벤트 타임라인이
// 화면에 뜬다. 리셋/새로고침에는 항상 reason 이 남는다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotionValue, animate } from 'framer-motion';
import { showToast } from '../utils/osFunction';
import { haptic } from '../lib/feel';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// touchcancel 뒤 아무 입력도 없을 때 최종 판정까지 기다리는 시간(안전장치)
const CANCEL_SAFETY_MS = 3000;
const DEBUG_LOG_LIMIT = 20;
// 방향(아래=당김 / 위·가로=일반 스크롤)을 결정하는 데 쓰는 이동량. 이 안에서는 preventDefault만 한다.
const DECIDE_SLOP = 6;
// 손가락 이동 → 당김 거리 감쇠(고무줄 저항)
const DAMPING = 0.5;

export const PTR_DEBUG_EVENT = 'ptr-debug-change';

export const isPtrDebugEnabled = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('ptr.debug') === '1';
  } catch {
    return false;
  }
};

// 설정 화면 토글이 호출한다. 같은 탭에서는 storage 이벤트가 안 오므로 커스텀 이벤트로 즉시 알린다.
export const setPtrDebugEnabled = (enabled) => {
  try {
    if (enabled) window.localStorage.setItem('ptr.debug', '1');
    else window.localStorage.removeItem('ptr.debug');
  } catch {
    // localStorage 사용 불가 환경 — 무시
  }
  try {
    window.dispatchEvent(new CustomEvent(PTR_DEBUG_EVENT, { detail: { enabled } }));
  } catch {
    // CustomEvent 미지원 — 무시
  }
};

// 이 요소들 위에서 시작한 터치는 당김 후보로 삼지 않는다(버튼·입력 등은 탭이 우선)
const INTERACTIVE_SELECTOR = 'button, a, [role="button"], input, textarea, select, [data-no-ptr]';

/**
 * @param {Object} opts
 * @param {import('react').RefObject<HTMLElement>} opts.scrollRef - 실제 스크롤 컨테이너(overflow-y-auto) ref
 * @param {() => Promise<any>} opts.onRefresh - 새로고침 실행 함수(Promise 반환)
 * @param {boolean} [opts.disabled] - true면 제스처를 감지하지 않고 진행 중이던 상태를 리셋
 * @param {number} [opts.threshold] - 새로고침이 확정되는 당김 거리(px)
 * @param {number} [opts.maxPull] - 고무줄 저항의 최대 당김 거리(px)
 * @param {number} [opts.minShowMs] - 인디케이터 최소 노출 시간(ms)
 * @param {string|null} [opts.errorMessage] - onRefresh 실패 시 토스트 문구. null이면 생략
 */
export function usePullToRefresh({
  scrollRef,
  onRefresh,
  disabled = false,
  threshold = 72,
  maxPull = 110,
  minShowMs = 500,
  errorMessage = '새로고침에 실패했어요',
} = {}) {
  const pull = useMotionValue(0);
  const [phase, setPhase] = useState('idle'); // idle | pulling | ready | refreshing | done
  const phaseRef = useRef('idle');
  const phaseRafRef = useRef(null);
  // ref는 즉시 갱신(핸들러 로직용), React state는 rAF로 미뤄 터치 핸들러를 가볍게 유지
  const setPhaseSafe = useCallback((p) => {
    phaseRef.current = p;
    if (phaseRafRef.current) return;
    phaseRafRef.current = window.requestAnimationFrame(() => {
      phaseRafRef.current = null;
      setPhase(phaseRef.current);
    });
  }, []);

  // ── 진단 로그 ──
  const debugEnabledRef = useRef(isPtrDebugEnabled());
  useEffect(() => {
    const onDebugChange = (e) => { debugEnabledRef.current = !!e.detail?.enabled; };
    window.addEventListener(PTR_DEBUG_EVENT, onDebugChange);
    return () => window.removeEventListener(PTR_DEBUG_EVENT, onDebugChange);
  }, []);
  const [debugLog, setDebugLog] = useState([]);
  const gestureStartAtRef = useRef(null);
  const logDebug = useCallback((line) => {
    if (!debugEnabledRef.current) return;
    const elapsed = gestureStartAtRef.current != null ? Date.now() - gestureStartAtRef.current : 0;
    const withElapsed = `+${elapsed}ms ${line}`;
    setDebugLog((prev) => {
      const next = prev.length >= DEBUG_LOG_LIMIT ? prev.slice(prev.length - DEBUG_LOG_LIMIT + 1) : prev.slice();
      next.push(withElapsed);
      return next;
    });
  }, []);
  const lastMoveLogAtRef = useRef(0);

  // ── 제스처 상태(리렌더와 무관하게 ref로만 관리) ──
  const gestureRef = useRef({
    active: false, decided: false, pulling: false, cancelling: false,
    startY: 0, startX: 0, touchId: null,
  });
  const animRef = useRef(null);
  const graceTimerRef = useRef(null);

  const stopAnim = useCallback(() => {
    animRef.current?.stop?.();
    animRef.current = null;
  }, []);

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current) {
      window.clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  // 당김이 확정된 동안 컨테이너 스크롤을 잠근다 — 브라우저가 제스처를 선점했더라도
  // 콘텐츠가 움직이지 않게 한다. 인라인 스타일만 쓰므로 해제는 빈 문자열로.
  const lockScroll = useCallback(() => {
    const el = scrollRef?.current;
    if (!el) return;
    if (el.scrollTop !== 0) el.scrollTop = 0;
    el.style.overflowY = 'hidden';
  }, [scrollRef]);
  const unlockScroll = useCallback(() => {
    const el = scrollRef?.current;
    if (el) el.style.overflowY = '';
  }, [scrollRef]);

  const snapTo = useCallback((value, springOpts = {}) => {
    stopAnim();
    animRef.current = animate(pull, value, {
      type: 'spring',
      stiffness: 420,
      damping: 32,
      ...springOpts,
    });
    return animRef.current;
  }, [pull, stopAnim]);

  const reset = useCallback((reason = 'unknown') => {
    const g = gestureRef.current;
    g.active = false; g.decided = false; g.pulling = false; g.cancelling = false;
    clearGraceTimer();
    unlockScroll();
    snapTo(0);
    setPhaseSafe('idle');
    logDebug(`reset(reason=${reason})`);
  }, [snapTo, setPhaseSafe, clearGraceTimer, unlockScroll, logDebug]);

  const runRefresh = useCallback(async (reason = 'unknown') => {
    clearGraceTimer();
    unlockScroll();
    logDebug(`refresh(reason=${reason})`);
    setPhaseSafe('refreshing');
    snapTo(threshold, { stiffness: 520, damping: 28 });
    const startedAt = Date.now();
    try {
      await onRefresh?.();
    } catch (err) {
      console.error('pull-to-refresh onRefresh 오류:', err);
      if (errorMessage) showToast(errorMessage);
    } finally {
      const wait = Math.max(0, minShowMs - (Date.now() - startedAt));
      window.setTimeout(() => {
        haptic('light');
        setPhaseSafe('done');
        window.setTimeout(() => reset('refresh-done'), 420);
      }, wait);
    }
  }, [onRefresh, threshold, minShowMs, errorMessage, snapTo, setPhaseSafe, reset, clearGraceTimer, unlockScroll, logDebug]);

  // 최종 판정 — 손을 뗐을 때만 호출된다
  const resolveGesture = useCallback((reason = 'unknown') => {
    if (pull.get() >= threshold) runRefresh(reason);
    else reset(reason);
  }, [pull, threshold, runRefresh, reset]);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || disabled) return undefined;

    const onTouchStart = (e) => {
      if (phaseRef.current === 'refreshing' || phaseRef.current === 'done') return;
      if (e.touches.length !== 1) return;
      debugEnabledRef.current = isPtrDebugEnabled();

      const g = gestureRef.current;
      // touchcancel 뒤 같은 동작이 새 터치로 돌아온 경우 — 현재 pull에 맞춰 이어받는다
      if (g.active && g.cancelling) {
        clearGraceTimer();
        g.cancelling = false;
        g.pulling = true;
        g.touchId = e.touches[0].identifier;
        g.startY = e.touches[0].clientY - (pull.get() / DAMPING);
        g.startX = e.touches[0].clientX;
        logDebug('start(이어받기)');
        return;
      }

      if (el.scrollTop > 0) { g.active = false; return; }
      if (e.target?.closest?.(INTERACTIVE_SELECTOR)) { g.active = false; return; }
      stopAnim();
      gestureStartAtRef.current = Date.now();
      gestureRef.current = {
        active: true, decided: false, pulling: false, cancelling: false,
        startY: e.touches[0].clientY,
        startX: e.touches[0].clientX,
        touchId: e.touches[0].identifier,
      };
      logDebug(`start y=${Math.round(e.touches[0].clientY)}`);
    };

    const onTouchMove = (e) => {
      const g = gestureRef.current;
      if (!g.active || g.cancelling) return;
      if (phaseRef.current === 'refreshing' || phaseRef.current === 'done') return;

      // 우리가 추적하는 손가락만 본다(멀티터치 방어)
      const touch = Array.from(e.touches).find((t) => t.identifier === g.touchId);
      if (!touch) return;

      const dy = touch.clientY - g.startY;
      const dx = touch.clientX - g.startX;

      if (!g.decided) {
        // 방향 미정 구간 — 브라우저가 먼저 스크롤을 시작하지 못하게 일단 전부 막는다
        if (Math.max(Math.abs(dx), Math.abs(dy)) < DECIDE_SLOP) {
          if (e.cancelable) e.preventDefault();
          return;
        }
        if (el.scrollTop > 0 || dy <= 0 || Math.abs(dx) > dy) {
          // 위/가로 → 일반 스크롤. 이제부터 막지 않으므로 브라우저가 다음 move부터 스크롤한다.
          g.active = false;
          logDebug(`give-up dx=${Math.round(dx)} dy=${Math.round(dy)}`);
          return;
        }
        g.decided = true;
        g.pulling = true;
        lockScroll();
        setPhaseSafe('pulling');
        logDebug('pulling');
      }

      if (e.cancelable) e.preventDefault();
      else logDebug('move(non-cancelable)');
      // 브라우저가 선점해 이미 조금 스크롤했더라도 되돌린다(잠금 커밋 전 프레임 방어)
      if (el.scrollTop !== 0) el.scrollTop = 0;

      // 역방향(위로) 이동은 당김을 0까지만 줄이고 제스처는 유지한다
      const damped = clamp(Math.max(0, dy) * DAMPING, 0, maxPull);
      pull.set(damped);
      const next = damped >= threshold ? 'ready' : 'pulling';
      if (phaseRef.current !== next) {
        if (next === 'ready') haptic('medium');
        setPhaseSafe(next);
      }
      const now = Date.now();
      if (now - lastMoveLogAtRef.current > 120) {
        lastMoveLogAtRef.current = now;
        logDebug(`move dy=${Math.round(dy)} pull=${Math.round(damped)}`);
      }
    };

    const onTouchEnd = (e) => {
      const g = gestureRef.current;
      if (!g.active) return;
      const lifted = Array.from(e.changedTouches).some((t) => t.identifier === g.touchId);
      if (!lifted) return;

      clearGraceTimer();
      g.active = false;
      g.cancelling = false;
      if (!g.pulling) { g.decided = false; return; }
      g.pulling = false;
      logDebug(`end pull=${Math.round(pull.get())}`);
      resolveGesture('touchend');
    };

    const onTouchCancel = (e) => {
      const g = gestureRef.current;
      if (!g.active) return;
      const cancelled = Array.from(e.changedTouches).some((t) => t.identifier === g.touchId);
      if (!cancelled) return;

      if (!g.pulling) {
        g.active = false; g.decided = false; g.cancelling = false;
        logDebug('cancel(pull 없음)');
        return;
      }
      // 손을 뗐다는 보증이 아니므로 판정하지 않고 붙들어 둔다. 같은 동작이 새 touchstart로
      // 돌아오면 이어받고, 아무 입력도 없으면 안전장치 시간 뒤에만 판정한다.
      logDebug(`cancel(touches=${e.touches.length})`);
      g.pulling = false;
      g.cancelling = true;
      clearGraceTimer();
      graceTimerRef.current = window.setTimeout(() => {
        graceTimerRef.current = null;
        if (!gestureRef.current.cancelling) return;
        gestureRef.current.active = false;
        gestureRef.current.cancelling = false;
        logDebug(`cancel-timeout(${CANCEL_SAFETY_MS}ms)`);
        resolveGesture('cancel-timeout');
      }, CANCEL_SAFETY_MS);
    };

    // 당김 중 컨테이너가 어떤 이유로든 스크롤되면 즉시 0으로 되돌린다
    const onScroll = () => {
      const g = gestureRef.current;
      if ((g.pulling || g.cancelling) && el.scrollTop !== 0) el.scrollTop = 0;
    };

    // 손가락을 멈추고 있을 때 롱프레스 컨텍스트 메뉴가 터치를 끊지 않게
    const onContextMenu = (e) => {
      if (gestureRef.current.active) e.preventDefault();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('contextmenu', onContextMenu);
      // 진행 중인 제스처 상태는 ref에 남아 있으므로(리스너 재등록 시 이어짐) 여기서 리셋하지 않는다
    };
  }, [scrollRef, disabled, threshold, maxPull, pull, resolveGesture, stopAnim, setPhaseSafe, clearGraceTimer, lockScroll, logDebug]);

  // 언마운트 시 잠금·타이머·rAF 정리
  useEffect(() => () => {
    clearGraceTimer();
    unlockScroll();
    if (phaseRafRef.current) window.cancelAnimationFrame(phaseRafRef.current);
  }, [clearGraceTimer, unlockScroll]);

  useEffect(() => {
    if (disabled) reset('disabled');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return {
    pull, phase, threshold, maxPull,
    debugLog,
  };
}

export default usePullToRefresh;
