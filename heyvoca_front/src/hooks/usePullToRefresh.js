// src/hooks/usePullToRefresh.js
//
// 당겨서 새로고침(pull-to-refresh) — 바텀 탭 5개(홈·단어장·찾기·상점·마이) 전용 제스처 훅.
//
// 설계
//   · 대상 스크롤 요소(scrollRef)가 scrollTop===0 일 때만 아래로 당기는 제스처를 가로챈다.
//     가로 스와이프·일반 스크롤(스크롤이 이미 내려간 상태)은 전혀 건드리지 않는다.
//   · 당김 거리는 framer-motion MotionValue(pull)로 관리한다 — touchmove마다 React state를
//     갱신하지 않고 MotionValue.set()만 호출해 리렌더 없이 60fps로 이어지고, 소비 측
//     (PullToRefresh.jsx)은 이 값을 style={{ y: pull }} 처럼 직접 구독해 DOM에 반영한다.
//   · 놓았을 때 스냅(0으로 복귀 또는 threshold에 고정)은 framer-motion의 독립 실행형
//     animate(motionValue, target, spring)로 처리한다 — React 리렌더와 무관하게 스프링이 돈다.
//   · phase(React state)는 아이콘 전환 같은 "저빈도 이산 상태"에만 쓴다.
//     idle → pulling → ready → refreshing → done → idle
//
// 새로고침 중 재당김은 무시한다(터치 시작 시 phase가 refreshing/done이면 제스처를 시작하지
// 않음). 최소 노출 시간(minShowMs)을 둬 아주 빠른 응답에서도 인디케이터가 깜빡이지 않는다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotionValue, animate } from 'framer-motion';
import { showToast } from '../utils/osFunction';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * @param {Object} opts
 * @param {import('react').RefObject<HTMLElement>} opts.scrollRef - 실제 스크롤 컨테이너(overflow-y-auto) ref
 * @param {() => Promise<any>} opts.onRefresh - 새로고침 실행 함수(Promise 반환)
 * @param {boolean} [opts.disabled] - true면 제스처를 감지하지 않고 진행 중이던 상태를 리셋
 * @param {number} [opts.threshold] - 새로고침이 확정되는 당김 거리(px)
 * @param {number} [opts.maxPull] - 고무줄 저항의 최대 당김 거리(px)
 * @param {number} [opts.minShowMs] - 인디케이터 최소 노출 시간(ms) — 너무 빠른 응답이면 깜빡임
 * @param {string|null} [opts.errorMessage] - onRefresh 실패 시 토스트 문구. null이면 토스트 생략
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
  const setPhaseSafe = useCallback((p) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const gestureRef = useRef({ active: false, pulling: false, startY: 0, startX: 0 });
  const animRef = useRef(null);

  const stopAnim = useCallback(() => {
    animRef.current?.stop?.();
    animRef.current = null;
  }, []);

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

  const reset = useCallback(() => {
    gestureRef.current.active = false;
    gestureRef.current.pulling = false;
    snapTo(0);
    setPhaseSafe('idle');
  }, [snapTo, setPhaseSafe]);

  const runRefresh = useCallback(async () => {
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
        setPhaseSafe('done');
        window.setTimeout(() => reset(), 420);
      }, wait);
    }
  }, [onRefresh, threshold, minShowMs, errorMessage, snapTo, setPhaseSafe, reset]);

  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || disabled) return undefined;

    const onTouchStart = (e) => {
      if (phaseRef.current === 'refreshing' || phaseRef.current === 'done') return;
      if (e.touches.length !== 1) return;
      if (el.scrollTop > 0) { gestureRef.current.active = false; return; }
      stopAnim();
      gestureRef.current = {
        active: true,
        pulling: false,
        startY: e.touches[0].clientY,
        startX: e.touches[0].clientX,
      };
    };

    const onTouchMove = (e) => {
      const g = gestureRef.current;
      if (!g.active || phaseRef.current === 'refreshing' || phaseRef.current === 'done') return;
      const touch = e.touches[0];
      const dy = touch.clientY - g.startY;
      const dx = touch.clientX - g.startX;

      // 위로 스와이프했거나 이미 스크롤이 내려간 상태 — 일반 스크롤에 맡기고 제스처를 접는다
      if (dy <= 0 || el.scrollTop > 0) {
        if (g.pulling) reset();
        g.active = false;
        return;
      }
      // 가로 이동이 세로보다 크면 가로 스와이프 — 가로채지 않는다(뒤로가기 등)
      if (!g.pulling && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        g.active = false;
        return;
      }

      g.pulling = true;
      // 세로 당김으로 확정된 순간에만 기본 동작(브라우저/WebView 오버스크롤 바운스)을 막는다
      if (e.cancelable) e.preventDefault();

      const damped = clamp(dy * 0.5, 0, maxPull);
      pull.set(damped);
      const next = damped >= threshold ? 'ready' : 'pulling';
      if (phaseRef.current !== next) setPhaseSafe(next);
    };

    const onTouchEnd = () => {
      const g = gestureRef.current;
      if (!g.active) return;
      g.active = false;
      if (!g.pulling) return;
      g.pulling = false;
      if (pull.get() >= threshold) runRefresh();
      else reset();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [scrollRef, disabled, threshold, maxPull, pull, runRefresh, reset, stopAnim, setPhaseSafe]);

  // 비활성화되면(예: 탭 전환·검색 모드 진입 등 호출부가 막을 때) 진행 중이던 제스처를 리셋
  useEffect(() => {
    if (disabled) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return { pull, phase, threshold, maxPull };
}

export default usePullToRefresh;
