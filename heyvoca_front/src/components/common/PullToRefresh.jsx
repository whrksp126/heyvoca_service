// src/components/common/PullToRefresh.jsx
//
// 당겨서 새로고침 래퍼 — 바텀 탭 5개(홈·단어장·찾기·상점·마이)의 스크롤 루트를 감싼다.
// 학습 화면(TakeTest)·바텀시트·풀시트 내부에는 쓰지 않는다(과제 범위 밖).
//
// 사용법 — 기존 페이지의 "스크롤 컨테이너 역할을 하던 최상위 엘리먼트"를 이 컴포넌트로
// 바꿔 끼운다. 기존에 그 엘리먼트에 있던 className·초기 애니메이션(motion.div면 as={motion.div}
// + initial/animate/exit)·onScroll 등은 그대로 props로 넘기면 된다. children은 지금까지
// 그 엘리먼트 안에 있던 내용 그대로.
//
//   const scrollRef = useRef(null); // 기존에 handleScroll·scrollTo 등에 쓰던 ref가 있다면 그대로 전달
//   <PullToRefresh ref={scrollRef} as={motion.div} onRefresh={handleRefresh} className="...">
//     {...기존 children...}
//   </PullToRefresh>
//
// fixedHeader — position:fixed로 화면에 떠 있는 헤더(예: 마이페이지)를 당김 동작에 실려
// 함께 움직이지 않게 하려면 children이 아니라 이 prop으로 넘긴다(내부 콘텐츠 래퍼 밖에 그려진다).
// position:sticky 헤더(예: 찾기 화면 검색바)는 children 그대로 둬도 된다 — 당기는 동안은
// scrollTop이 항상 0이라 sticky가 아직 고정되기 전이라, 콘텐츠 전체와 함께 내려가는 편이
// 자연스럽고 이질감이 없다.
//
// ── 배경 vs 콘텐츠 분리(2026-09 개편) ─────────────────────────────────────
// 이 컴포넌트가 그리는 최상위 엘리먼트(Component, as/className/style/onScroll 등 호출부
// props를 그대로 받는 실제 스크롤 컨테이너)는 예전과 동일하게 유지한다 — onScroll·motion
// 진입 애니메이션·flex-1 같은 부모 레이아웃 의존 클래스를 다른 레이어로 옮기면 5개 적용처의
// 기존 동작(무한 스크롤 임계값, 헤더 자동 숨김, 풀시트 진입 트랜지션 등)이 깨지기 쉽다.
// 대신 "배경이 콘텐츠와 함께 당겨져 보인다"는 문제는 애초에 이 구조에 없다 — 당김 중
// translateY가 걸리는 건 아래 `PullToRefreshContent`(children 래퍼) 하나뿐이고, Component
// 자신의 배경(className의 bg-* 토큰)은 그 바깥 박스에 그대로 칠해져 있어 함께 움직이지
// 않는다. 인디케이터도 PullToRefreshContent 밖(Component의 직계 자식)에 그려서 콘텐츠
// translateY의 영향을 받지 않는다 — scrollTop===0에서만 제스처가 시작되므로 인디케이터는
// 사실상 "콘텐츠가 비켜준 그 배경 위"에만 나타난다.
//
// 예전 버그는 배경이 실제로 움직인 게 아니라, 인디케이터가 그 자리(배경이 드러나는 영역)에서
// safe-area를 무시하고 상단 끝(top:0)에 그려져 상태바/노치 영역을 침범해 보였던 것이다.
// 그래서 기본 indicatorTop을 `--status-bar-height`(env(safe-area-inset-top), index.css)
// 아래로 내려 항상 안전 영역 밑·페이지 배경 위에서만 그려지도록 고쳤다(아래 prop 설명 참고).
//
// 인디케이터 — 원형 링 + 진행 호(arc). 당긴 거리(0~threshold)에 비례해 호가 채워지고
// 링이 손끝 이동에 맞춰 회전한다(유튜브류 앱의 손맛). 임계값을 처음 넘는 순간 살짝
// 커졌다 돌아오는 스냅 펄스(lib/feel의 SPRING.bouncy 재사용) — 햅틱은 usePullToRefresh
// 훅이 같은 시점에 이미 울리므로 여기서 중복 호출하지 않는다. 손을 떼 새로고침이 시작되면
// 호는 고정 폭을 유지한 채 링만 계속 도는 스피너로 전환되고, 완료 시 Check 아이콘으로
// 짧게 바뀐 뒤 훅의 스프링으로 접힌다.
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import {
  motion, useMotionValue, useTransform, useMotionValueEvent, useAnimationControls,
  useReducedMotion, animate, AnimatePresence,
} from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { SPRING } from '../../lib/feel';

// 링 지오메트리 — 배경 칩(40px) 안에 30px 링을 둔다(예전 물방울 칩과 비슷한 크기감).
const RING_SIZE = 30;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
// 새로고침 중 스피너로 보일 때 고정으로 채워 두는 호의 비율(나머지는 빈 트랙)
const SPINNER_ARC_RATIO = 0.28;

const PullToRefreshIndicator = ({ pull, phase, threshold, maxPull, top }) => {
  "use memo";

  const reducedMotion = useReducedMotion();
  const isReady = phase === 'ready';
  const isRefreshing = phase === 'refreshing';
  const isDone = phase === 'done';

  const isRefreshingRef = useRef(false);
  useEffect(() => { isRefreshingRef.current = isRefreshing; }, [isRefreshing]);

  // 칩 자체의 등장 — 당김 초반엔 옅고 작게, threshold 근처에서 완전히 드러난다.
  const opacity = useTransform(pull, [0, threshold * 0.4], [0, 1], { clamp: true });
  const scale = useTransform(pull, [0, threshold], [0.55, 1], { clamp: true });

  // 진행 호 — pull(=당긴 거리)에 정확히 비례해 채워진다(0→threshold가 0→100%).
  // clamp로 maxPull까지 당겨도 100%를 넘지 않는다. 새로고침 중엔 고정 폭 스피너로 바뀐다.
  const dashOffset = useMotionValue(RING_CIRC);
  useMotionValueEvent(pull, 'change', (v) => {
    if (isRefreshingRef.current) return;
    const progress = threshold > 0 ? Math.min(1, Math.max(0, v / threshold)) : 0;
    dashOffset.set(RING_CIRC * (1 - progress));
  });

  // 회전 — 손끝 이동량(pull)에 그대로 붙어 돈다("손에 붙는" 손맛). 새로고침 중엔 같은
  // 모션밸류를 독립 애니메이션(animate)으로 넘겨받아 등속으로 계속 돌린다.
  const rotate = useMotionValue(0);
  useMotionValueEvent(pull, 'change', (v) => {
    if (isRefreshingRef.current) return;
    rotate.set((Math.min(v, maxPull) / maxPull) * 320);
  });

  const spinAnimRef = useRef(null);
  useEffect(() => {
    if (isRefreshing) {
      dashOffset.set(RING_CIRC * (1 - SPINNER_ARC_RATIO));
      spinAnimRef.current?.stop?.();
      spinAnimRef.current = animate(rotate, rotate.get() + 360, {
        duration: reducedMotion ? 1.4 : 0.85,
        ease: 'linear',
        repeat: Infinity,
      });
    } else {
      spinAnimRef.current?.stop?.();
      spinAnimRef.current = null;
    }
    return () => { spinAnimRef.current?.stop?.(); spinAnimRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefreshing]);

  // 임계값 스냅 — pulling→ready로 "처음" 넘어가는 순간에만 살짝 커졌다 돌아온다.
  // 햅틱은 usePullToRefresh 훅이 같은 전이 시점에 이미 울리므로 여기서 중복 호출하지 않는다.
  const chipControls = useAnimationControls();
  const wasReadyRef = useRef(false);
  useEffect(() => {
    if (isReady && !wasReadyRef.current) {
      chipControls.start(reducedMotion
        ? { scale: [1, 1.06, 1], transition: { duration: 0.2, ease: 'easeOut' } }
        : { scale: [1, 1.18, 1], transition: SPRING.bouncy });
    }
    wasReadyRef.current = isReady;
  }, [isReady, chipControls, reducedMotion]);

  return (
    <div
      aria-hidden="true"
      style={{ top }}
      className="absolute left-0 right-0 z-[5] flex justify-center pointer-events-none"
    >
      <motion.div
        animate={chipControls}
        style={{ opacity, scale }}
        className="
          relative flex items-center justify-center w-[40px] h-[40px] rounded-full
          bg-layout-white dark:bg-layout-gray-dark
          shadow-[0_2px_8px_rgba(96,80,52,.16)] dark:shadow-[0_2px_8px_rgba(0,0,0,.4)]
        "
      >
        <motion.svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          style={{ rotate }}
        >
          {/* 트랙 — 항상 옅게 보이는 배경 링. stroke="currentColor" + text-* 토큰으로 색을
              입힌다(Phosphor 아이콘과 같은 방식 — stroke-* 유틸 대신 검증된 패턴을 쓴다). */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            strokeWidth={RING_STROKE}
            fill="none"
            stroke="currentColor"
            className="text-layout-gray-200 dark:text-layout-gray-500"
          />
          {/* 진행 호 — pull(또는 스피너 애니메이션)에 따라 채워지며 도는 부분 */}
          <motion.circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            strokeWidth={RING_STROKE}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={RING_CIRC}
            style={{ strokeDashoffset: dashOffset }}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            className={isReady || isRefreshing ? 'text-primary-main-600' : 'text-primary-main-400'}
          />
        </motion.svg>

        <AnimatePresence>
          {isDone && (
            <motion.span
              key="done"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Check size={16} weight="bold" className="text-status-success-600" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

/**
 * 콘텐츠 래퍼 — 당김 거리(pull)만큼 아래로 밀린다. Component 자신(배경)은 이 안에 없으므로
 * 함께 움직이지 않는다.
 *
 * `<motion.div style={{ y: pull }}>` 로 그냥 바인딩하면 pull이 0일 때도 framer-motion이
 * `transform: translateY(0px)` 를 항상 인라인으로 남긴다 — transform은 값과 무관하게
 * "none이 아니면" 그 자체로 자손의 position:fixed 기준을 바꿔 버려서(CSS 스펙), 목록 안에 있는
 * fixed 요소(예: 찾기 화면의 위로가기 버튼·정렬 드롭다운 배경)가 항상 뷰포트가 아니라 이
 * 래퍼 기준으로 붙어버리는 회귀가 생긴다. 그래서 여기서는 값을 직접 구독해(useMotionValueEvent)
 * pull > 0 일 때만 transform을 걸고, 0으로 돌아오면 transform 자체를 지워(''  → 'none') 그
 * 부작용을 제스처가 실제로 진행 중인 짧은 구간으로만 한정한다. scrollTop/height는 절대
 * 건드리지 않고 transform만 쓰므로(will-change-transform) 프레임 드롭 없이 따라온다.
 */
const PullToRefreshContent = ({ pull, className, children }) => {
  const ref = useRef(null);
  useMotionValueEvent(pull, 'change', (v) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = v > 0 ? `translateY(${v}px)` : '';
  });
  return <div ref={ref} className={`will-change-transform ${className || ''}`}>{children}</div>;
};

const PullToRefresh = forwardRef(function PullToRefresh(
  {
    as: Component = 'div',
    onRefresh,
    disabled = false,
    threshold = 72,
    maxPull = 110,
    minShowMs = 500,
    errorMessage,
    className = '',
    contentClassName = '',
    fixedHeader = null,
    // 인디케이터 시작 위치 — 기본값이 상태바 높이(safe-area-inset-top, index.css의
    // --status-bar-height)를 이미 감안하므로 대부분의 화면(홈·단어장·찾기·상점)은
    // 그대로 두면 된다. 고정 헤더가 상태바 아래를 추가로 덮는 화면(마이페이지)만
    // 헤더 높이를 더한 값을 넘겨 헤더 아래에서 나오게 한다.
    indicatorTop = 'calc(var(--status-bar-height) + 14px)',
    children,
    ...rest
  },
  forwardedRef,
) {
  const scrollRef = useRef(null);
  useImperativeHandle(forwardedRef, () => scrollRef.current, []);

  const { pull, phase } = usePullToRefresh({
    scrollRef, onRefresh, disabled, threshold, maxPull, minShowMs, errorMessage,
  });

  return (
    <Component
      ref={scrollRef}
      // overscroll-y-contain — 브라우저/WebView 기본 오버스크롤 글로우·바운스가 우리 인디케이터와
      // 겹치지 않게 한다. relative — 인디케이터(absolute) 위치 기준.
      className={`relative overscroll-y-contain ${className}`}
      {...rest}
    >
      {fixedHeader}
      <PullToRefreshIndicator pull={pull} phase={phase} threshold={threshold} maxPull={maxPull} top={indicatorTop} />
      <PullToRefreshContent pull={pull} className={contentClassName}>
        {children}
      </PullToRefreshContent>
    </Component>
  );
});

export default PullToRefresh;
