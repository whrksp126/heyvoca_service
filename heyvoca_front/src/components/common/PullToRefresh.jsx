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
// ── 헤더 두 종류 — `fixedHeader` vs `header` ────────────────────────────────
// fixedHeader — 진짜 position:fixed로 화면 위에 떠 있는 헤더(예: 마이페이지). 당김에도
// 절대 움직이지 않아야 하고, 스크롤 컨테이너의 문서 흐름에도 애초에 속하지 않는다(호출부가
// 이미 그렇게 스타일링한 엘리먼트를 그대로 넘긴다). 렌더된 실제 높이를 ResizeObserver로
// 자동 측정해 콘텐츠·인디케이터를 그만큼 아래로 밀어낸다 — 호출부가 상태바+헤더 높이를
// 손으로 계산해 넘길 필요가 없다(2026-09-21 이전에는 `indicatorTop`이라는 prop에 각 화면이
// calc() 문자열을 직접 만들어 넘겼는데, 화면마다 기준이 달라 계속 어긋났다 — 아래
// "인디케이터 위치" 설명 참고).
//
// header — position:sticky 또는 일반 헤더(예: 찾기 화면의 검색바). fixedHeader와 달리
// 스크롤 컨테이너의 문서 흐름 **안**에 그대로 있다(같이 스크롤되다가 sticky면 멈춘다).
// 다만 당김의 translateY만은 받지 않는다 — children(PullToRefreshContent)과 형제로
// 그려지고, 당겨지는 콘텐츠는 그 바로 아래에서 시작한다.
//
// ── 배경 vs 콘텐츠 분리(2026-09 개편) ─────────────────────────────────────
// 이 컴포넌트가 그리는 최상위 엘리먼트(Component, as/className/style/onScroll 등 호출부
// props를 그대로 받는 실제 스크롤 컨테이너)는 예전과 동일하게 유지한다 — onScroll·motion
// 진입 애니메이션·flex-1 같은 부모 레이아웃 의존 클래스를 다른 레이어로 옮기면 5개 적용처의
// 기존 동작(무한 스크롤 임계값, 헤더 자동 숨김, 풀시트 진입 트랜지션 등)이 깨지기 쉽다.
// 대신 "배경이 콘텐츠와 함께 당겨져 보인다"는 문제는 애초에 이 구조에 없다 — 당김 중
// translateY가 걸리는 건 아래 `PullToRefreshContent`(children 래퍼) 하나뿐이고, Component
// 자신의 배경(className의 bg-* 토큰)은 그 바깥 박스에 그대로 칠해져 있어 함께 움직이지
// 않는다.
//
// ── 단색이 아닌 배경(그라디언트 등) — `background` prop (2026-09 QA) ─────────────
// 위 설명은 "Component 자신의 bg-* 단색 토큰"에만 맞는다. 화면 상단이 단색이 아니라
// 그라디언트(예: 홈 히어로 하늘)라면 얘기가 다르다 — 그 그라디언트를 그리는 요소가
// children(=PullToRefreshContent, 당김만큼 translateY됨) 안에 있으면, 당길 때 그 요소가
// 함께 내려가면서 원래 있던 자리 위로 Component의 flat한 bg-* 색(예: 다크 모드
// bg-layout-black #111111)이 드러난다. 그라디언트의 시작색(보통 밝은 톤)과 그 flat
// 색이 다르면 "그라디언트가 끊기고 그 위로 단색이 새로 나타난" 것처럼 보인다 — 실제로는
// Component 배경이 움직인 게 아니라, 그라디언트 쪽이 콘텐츠로 취급되어 비켜난 것이다.
//
// 해결은 Component의 직계 자식(PullToRefreshContent 밖)에 그라디언트 레이어를 하나 더
// 두는 것 — 이 `background` prop이 그 레이어다. pull의 translateY는 받지 않으므로 당기는
// 동안 제자리에 고정되고, 실제 스크롤(scrollTop 변화)에는 자연스럽게 같이 움직인다(스크롤
// 컨테이너의 콘텐츠 흐름 안에 있는 absolute 요소라 일반 스크롤과는 분리되지 않는다 — 오직
// pull의 인위적인 transform만 안 받는다). 홈은 FarmHero의 하늘(FarmHeroSky)을 여기에 넘긴다.
//
// ── 인디케이터 위치 — "틈에 놓인다" 방식(2026-09-21 재설계) ─────────────────────
// 예전에는 화면마다 `indicatorTop`(px/calc 문자열)을 직접 계산해 넘겼는데, 화면마다
// status-bar-height를 이미 소비했는지 · 헤더가 흐름 안에 있는지 fixed인지가 달라 거의 매번
// 어긋났다(찾기·마이페이지가 특히 그랬다). 지금은 좌표 계산을 아예 없앴다 —
//
//   인디케이터의 "쉬는 자리"(pull=0일 때 기준)는 당겨지는 콘텐츠(PullToRefreshContent)의
//   **원래 상단 모서리**와 같은 점이다(아래 `.relative` 래퍼의 y=0). 당김이 진행되면
//   인디케이터는 `translateY(pull - 칩높이 - 여백)`만큼만 내려간다 — 즉 콘텐츠 자신의
//   translateY(pull)보다 정확히 "칩높이+여백"만큼 덜 내려가므로, 인디케이터는 항상 콘텐츠
//   바로 위, 일정한 틈(margin)을 두고 따라온다(유튜브·안드로이드 새로고침과 같은 느낌).
//
//   pull이 그 값(INDICATOR_GAP)보다 작을 때는 translateY가 음수라 인디케이터가 아직 "틈"
//   자체가 없는 자리에 있다 — header가 없는 화면(홈·단어장·상점)은 이 구간이 스크롤
//   컨테이너 밖(위)이라 그냥 안 보이고, fixedHeader가 있는 화면(마이페이지)은 fixedHeader의
//   불투명 배경(z-20)에 자연히 가려진다 — 둘 다 별도 처리 없이 저절로 "숨는다". opacity도
//   같은 구간(GAP → threshold)에서 0→1로 페이드인해 "그 순간 갑자기 나타난" 느낌 대신
//   틈 위쪽에서부터 옅게 드러나며 내려오는 것처럼 보인다.
//
//   header(찾기의 sticky 검색바)를 쓰는 화면은 그 헤더가 `.relative` 래퍼보다 **먼저**
//   문서 흐름에 그려지므로, 래퍼의 y=0은 자동으로 "헤더 바로 아래"가 된다 — 좌표를 넘길
//   필요가 없다. fixedHeader(마이페이지)를 쓰는 화면은 fixedHeader의 렌더된 높이를
//   ResizeObserver로 재서 같은 래퍼에 marginTop으로 준다 — 이것도 손으로 값을 넘기지 않는다.
//
// 인디케이터 — 원형 링 + 진행 호(arc). 당긴 거리(0~threshold)에 비례해 호가 채워지고
// 링이 손끝 이동에 맞춰 회전한다(유튜브류 앱의 손맛). 임계값을 처음 넘는 순간 살짝
// 커졌다 돌아오는 스냅 펄스(lib/feel의 SPRING.bouncy 재사용) — 햅틱은 usePullToRefresh
// 훅이 같은 시점에 이미 울리므로 여기서 중복 호출하지 않는다. 손을 떼 새로고침이 시작되면
// 호는 고정 폭을 유지한 채 링만 계속 도는 스피너로 전환되고, 완료 시 Check 아이콘으로
// 짧게 바뀐 뒤 훅의 스프링으로 접힌다.
import React, {
  forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
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

// 인디케이터 칩 크기 + 콘텐츠와 벌어지는 여백 — "틈에 놓인다" 위치 계산의 기준값
// (위 파일 상단 "인디케이터 위치" 설명 참고).
const INDICATOR_CHIP_SIZE = 40;
const INDICATOR_GAP_MARGIN = 10;
const INDICATOR_GAP = INDICATOR_CHIP_SIZE + INDICATOR_GAP_MARGIN;

const PullToRefreshIndicator = ({ pull, phase, threshold, maxPull }) => {
  "use memo";

  const reducedMotion = useReducedMotion();
  const isReady = phase === 'ready';
  const isRefreshing = phase === 'refreshing';
  const isDone = phase === 'done';

  const isRefreshingRef = useRef(false);
  useEffect(() => { isRefreshingRef.current = isRefreshing; }, [isRefreshing]);

  // 위치 — 이 인디케이터가 그려지는 `.relative` 래퍼의 y=0(=당겨지는 콘텐츠의 원래 상단
  // 모서리)을 기준으로, 당긴 만큼(pull) 내려오되 칩 높이+여백(INDICATOR_GAP)만큼 미리
  // 빼 둔다. pull이 GAP보다 작을 때는 이 값이 음수라 컨테이너 밖(또는 fixedHeader 뒤)에
  // 가려 있고, GAP을 넘는 순간부터 콘텐츠 바로 위 틈에 자리잡은 채 함께 내려온다.
  const translateY = useTransform(pull, (v) => v - INDICATOR_GAP);

  // 등장 — 틈에서 막 드러나는 지점(GAP)부터 옅게 나타나 threshold 부근에서 완전히
  // 불투명해진다. threshold를 GAP보다 작게 설정하는 실수를 대비해 최소 폭을 둔다.
  const fadeEnd = Math.max(threshold, INDICATOR_GAP + 8);
  const opacity = useTransform(pull, [INDICATOR_GAP, fadeEnd], [0, 1], { clamp: true });
  const scale = useTransform(pull, [INDICATOR_GAP, fadeEnd], [0.55, 1], { clamp: true });

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
      className="absolute left-0 right-0 top-0 z-[5] flex justify-center pointer-events-none"
    >
      <motion.div
        animate={chipControls}
        style={{ opacity, scale, y: translateY }}
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
/**
 * 디버그 오버레이 — `localStorage.setItem('ptr.debug','1')`일 때만 렌더된다(기본 꺼짐).
 * usePullToRefresh가 남긴 최근 이벤트(최대 8줄)를 화면 좌상단에 반투명 박스로 보여준다 —
 * 실기기에서 "왜 풀렸는지"(reset의 reason)를 콘솔 연결 없이 바로 읽기 위한 용도다.
 * 디자인 토큰만 쓴다(하드코딩 색상 금지) — layout-black/white 토큰을 다크와 무관하게
 * 항상 어두운 칩으로 고정해 어느 배경 위에서도 로그 텍스트가 읽히게 한다.
 *
 * document.body에 포털로 그린다 — 5개 적용처 중 상당수가 `as={motion.div}`를 쓰는데,
 * framer-motion은 값이 0이어도 transform을 인라인으로 남겨(PullToRefreshContent 주석 참고)
 * 그 자손인 position:fixed 요소의 기준을 뷰포트가 아니라 그 motion.div로 바꿔버린다.
 * 포털로 Component 서브트리 밖에 그리면 이 문제와 완전히 무관해진다.
 */
const PullToRefreshDebugOverlay = ({ log }) => createPortal(
  <div
    aria-hidden="true"
    className="
      fixed z-[99999] pointer-events-none
      top-[calc(var(--status-bar-height)+4px)] left-[8px]
      max-w-[220px] px-[8px] py-[6px] rounded-[8px]
      bg-layout-black/75
    "
  >
    {log.length === 0 ? (
      <p className="text-[10px] leading-[1.5] font-[600] text-layout-white">ptr.debug 대기 중</p>
    ) : (
      log.map((line, i) => (
        <p key={i} className="text-[10px] leading-[1.5] font-[600] text-layout-white whitespace-nowrap overflow-hidden text-ellipsis">
          {line}
        </p>
      ))
    )}
  </div>,
  document.body,
);

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
    // 진짜 position:fixed 헤더(예: 마이페이지). 당김에 실려 움직이지 않는다. 렌더된 실제
    // 높이를 자동으로 재서 콘텐츠·인디케이터를 그만큼 밀어낸다(위 "헤더 두 종류" 참고) —
    // 호출부가 별도 spacer를 넣을 필요가 없다.
    fixedHeader = null,
    // position:sticky 또는 일반 헤더(예: 찾기 화면의 검색바). 문서 흐름 안에 그대로 있지만
    // 당김의 translateY는 받지 않는다 — 이 헤더 바로 아래가 콘텐츠의 "원래 상단 모서리"가
    // 되고, 인디케이터도 자동으로 그 자리를 기준으로 삼는다.
    header = null,
    // 단색이 아닌 상단 배경(그라디언트 등) — 당김에 딸려가지 않는 고정 레이어에 그린다.
    // 위 "단색이 아닌 배경" 주석 참고. 대부분의 화면(단색 bg-* 하나로 충분)은 안 써도 된다.
    background = null,
    children,
    ...rest
  },
  forwardedRef,
) {
  const scrollRef = useRef(null);
  useImperativeHandle(forwardedRef, () => scrollRef.current, []);

  const { pull, phase, debugLog } = usePullToRefresh({
    scrollRef, onRefresh, disabled, threshold, maxPull, minShowMs, errorMessage,
  });

  // ptr.debug 플래그는 껐다 켜도 새로고침 전까지는 안 바뀐다고 가정하고 마운트 시 한 번만
  // 읽는다 — 매 렌더 localStorage를 읽지 않기 위함. 훅 쪽 debugLog도 같은 플래그로 게이팅돼
  // 있어 플래그가 꺼져 있으면 log는 항상 빈 배열이라 이 오버레이 자체도 사실상 아무 일도
  // 안 한다.
  const [debugEnabled] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem('ptr.debug') === '1';
    } catch {
      return false;
    }
  });

  // fixedHeader 높이 자동 측정 — position:fixed는 문서 흐름을 차지하지 않으므로, 콘텐츠와
  // 인디케이터를 그 아래로 밀어내려면 실제 렌더 높이를 알아야 한다. 호출부가 상태바+헤더
  // 높이를 손으로 계산해 넘기던 옛 `indicatorTop`(calc 문자열)을 없애는 대신, 렌더된 DOM을
  // ResizeObserver로 직접 재서 항상 맞는 값을 쓴다(폰트 크기·safe-area가 달라져도 안전).
  const fixedHeaderWrapRef = useRef(null);
  const [fixedHeaderHeight, setFixedHeaderHeight] = useState(0);
  useLayoutEffect(() => {
    if (!fixedHeader) { setFixedHeaderHeight(0); return undefined; }
    const target = fixedHeaderWrapRef.current?.firstElementChild;
    if (!target) return undefined;
    const measure = () => setFixedHeaderHeight(target.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(target);
    return () => ro.disconnect();
  }, [fixedHeader]);

  return (
    <Component
      ref={scrollRef}
      // overscroll-y-none — 브라우저/WebView 기본 오버스크롤 글로우·바운스를 완전히 끈다.
      // 예전에는 overscroll-y-contain(스크롤 체이닝만 막음)을 썼는데, Android WebView는
      // contain이어도 최상단에서 자체 오버스크롤 글로우를 그리며 우리 제스처의 터치
      // 시퀀스를 가로채 touchcancel을 보낼 수 있었다(usePullToRefresh.js 상단 "손을 안
      // 뗐는데 풀린다" 설명 참고) — none으로 네이티브 효과 자체를 없애 우리 제스처만 남긴다.
      // relative — 배경(absolute)·아래 인디케이터 래퍼 위치 기준.
      className={`relative overscroll-y-none ${className}`}
      {...rest}
    >
      {fixedHeader && <div ref={fixedHeaderWrapRef}>{fixedHeader}</div>}
      {background && (
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-0 pointer-events-none">
          {background}
        </div>
      )}
      {header}
      {/* 인디케이터 + 콘텐츠 — 이 relative 래퍼의 y=0이 "당겨지는 콘텐츠의 원래 상단
          모서리"다. header가 있으면 문서 흐름상 바로 아래에서 자연히 시작하고,
          fixedHeader가 있으면 그 측정된 높이만큼 marginTop으로 밀려난다. */}
      <div
        className="relative"
        style={fixedHeaderHeight ? { marginTop: fixedHeaderHeight } : undefined}
      >
        <PullToRefreshIndicator pull={pull} phase={phase} threshold={threshold} maxPull={maxPull} />
        <PullToRefreshContent pull={pull} className={contentClassName}>
          {children}
        </PullToRefreshContent>
      </div>
      {debugEnabled && <PullToRefreshDebugOverlay log={debugLog} />}
    </Component>
  );
});

export default PullToRefresh;
