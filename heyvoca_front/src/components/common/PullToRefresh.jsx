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
// 인디케이터 — 물방울(Phosphor Drop) 하나. 당김 거리에 비례해 차오르다 임계치를 넘으면
// 살짝 튀는 회전을 하고, 새로고침 중에는 위아래로 까딱이는 반복 모션, 끝나면 체크로
// 0.4초 전환 후 접힌다. 텍스트 없음(아이콘만) · 이모지 없음 · 다크모드 토큰 대응.
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { motion, useTransform, useMotionValueEvent, AnimatePresence } from 'framer-motion';
import { Drop, Check } from '@phosphor-icons/react';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';

const PullToRefreshIndicator = ({ pull, phase, threshold, top }) => {
  "use memo";

  const height = useTransform(pull, (v) => `${v}px`);
  // 당김 거리에 비례해 차오른다 — 0(안 보임) → threshold(다 채워짐). clamp 기본값(true)이라
  // threshold를 넘게 당겨도(고무줄 저항 최대 maxPull까지) 1 이상으로 넘치지 않는다.
  const opacity = useTransform(pull, [0, threshold * 0.6], [0, 1]);
  const scale = useTransform(pull, [0, threshold], [0.4, 1]);

  const isReady = phase === 'ready';
  const isRefreshing = phase === 'refreshing';
  const isDone = phase === 'done';

  return (
    <motion.div
      aria-hidden="true"
      style={{ height, top }}
      className="absolute left-0 right-0 z-[5] flex items-end justify-center overflow-hidden pointer-events-none"
    >
      <motion.div
        style={{ opacity, scale }}
        animate={
          isRefreshing
            ? { y: [0, 6, 0], rotate: 0, transition: { y: { duration: 0.7, repeat: Infinity, ease: 'easeInOut' } } }
            : isReady
              ? { y: [0, -5, 0], rotate: [0, -14, 0], transition: { duration: 0.34, ease: [0.34, 1.56, 0.64, 1] } }
              : { y: 0, rotate: 0 }
        }
        className="
          flex items-center justify-center w-[34px] h-[34px] mb-[14px] rounded-full
          bg-layout-white dark:bg-layout-gray-dark
          shadow-[0_2px_8px_rgba(96,80,52,.16)] dark:shadow-[0_2px_8px_rgba(0,0,0,.4)]
        "
      >
        <AnimatePresence mode="wait" initial={false}>
          {isDone ? (
            <motion.span
              key="done"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              className="flex items-center justify-center"
            >
              <Check size={16} weight="bold" className="text-status-success-600" />
            </motion.span>
          ) : (
            <motion.span
              key="drop"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              className="flex items-center justify-center"
            >
              <Drop
                size={16}
                weight="fill"
                className={isReady || isRefreshing ? 'text-primary-main-600' : 'text-primary-main-400'}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

/**
 * 콘텐츠 래퍼 — 당김 거리(pull)만큼 아래로 밀린다.
 *
 * `<motion.div style={{ y: pull }}>` 로 그냥 바인딩하면 pull이 0일 때도 framer-motion이
 * `transform: translateY(0px)` 를 항상 인라인으로 남긴다 — transform은 값과 무관하게
 * "none이 아니면" 그 자체로 자손의 position:fixed 기준을 바꿔 버려서(CSS 스펙), 목록 안에 있는
 * fixed 요소(예: 찾기 화면의 위로가기 버튼·정렬 드롭다운 배경)가 항상 뷰포트가 아니라 이
 * 래퍼 기준으로 붙어버리는 회귀가 생긴다. 그래서 여기서는 값을 직접 구독해(useMotionValueEvent)
 * pull > 0 일 때만 transform을 걸고, 0으로 돌아오면 transform 자체를 지워(''  → 'none') 그
 * 부작용을 제스처가 실제로 진행 중인 짧은 구간으로만 한정한다.
 */
const PullToRefreshContent = ({ pull, className, children }) => {
  const ref = useRef(null);
  useMotionValueEvent(pull, 'change', (v) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = v > 0 ? `translateY(${v}px)` : '';
  });
  return <div ref={ref} className={className}>{children}</div>;
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
    // fixed 헤더가 콘텐츠 위에 떠 있는 화면(마이페이지)에서 인디케이터가 헤더 아래에서
    // 나오도록 시작 위치를 내린다. sticky 헤더(찾기)나 헤더가 아예 형제로 분리된 화면
    // (단어장 목록·상점)은 기본값 0으로 충분하다 — 자세한 이유는 파일 상단 주석 참고.
    indicatorTop = 0,
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
      <PullToRefreshIndicator pull={pull} phase={phase} threshold={threshold} top={indicatorTop} />
      <PullToRefreshContent pull={pull} className={contentClassName}>
        {children}
      </PullToRefreshContent>
    </Component>
  );
});

export default PullToRefresh;
