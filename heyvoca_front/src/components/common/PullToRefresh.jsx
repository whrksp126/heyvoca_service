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
// ── 단순화(2026-09-21) — 콘텐츠를 밀지 않는다 ────────────────────────────────
// 예전에는 당긴 거리만큼 콘텐츠(children)를 아래로 translateY하고, fixedHeader/header/
// background 세 종류의 슬롯으로 화면마다 다른 헤더·배경 구조를 흡수했다. 그 결과 화면마다
// "이 헤더는 fixed인가 sticky인가", "그라디언트 배경은 어디에 둘 것인가"를 따로 계산해야
// 했고, FarmHero는 하늘(FarmHeroSky)과 밭(FarmHero 본문)을 억지로 분리해야 했다.
//
// 지금은 당김이 콘텐츠·배경 어느 쪽도 건드리지 않는다 — 화면은 그 자리에 그대로 있고,
// 인디케이터(링+진행 호)만 콘텐츠 위에 얹힌 오버레이로 나타났다 사라진다. 그래서
// PullToRefreshContent(콘텐츠 translateY 래퍼)·fixedHeader 높이 자동측정(ResizeObserver)·
// header/background 슬롯이 전부 필요 없어졌다 — children을 감싸는 래퍼 div조차 없다.
// 적용하는 화면은 기존에 쓰던 스크롤 컨테이너를 이 컴포넌트로 바꿔 끼우고 onRefresh만
// 넘기면 끝이다(className·as·onScroll 등 이 컴포넌트와 무관한 범용 props는 그대로 유지).
//
// 인디케이터는 `position:fixed`로 화면 최상단 근처(상태바 + 64px)에 항상 같은 자리에
// 뜬다 — document.body에 createPortal로 그려서, 호출부가 `as={motion.div}`를 쓰든
// 무엇을 쓰든(그 안에 transform이 걸리든) 전혀 영향받지 않는다.
import React, {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  motion, useMotionValue, useTransform, useMotionValueEvent, useAnimationControls,
  useReducedMotion, animate, AnimatePresence,
} from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import { usePullToRefresh, isPtrDebugEnabled, PTR_DEBUG_EVENT } from '../../hooks/usePullToRefresh';
import { SPRING } from '../../lib/feel';

// 링 지오메트리 — 배경 칩(40px) 안에 30px 링을 둔다.
const RING_SIZE = 30;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;
// 새로고침 중 스피너로 보일 때 고정으로 채워 두는 호의 비율(나머지는 빈 트랙)
const SPINNER_ARC_RATIO = 0.28;

// 오버레이가 위에서 내려오며 나타나는 거리 — translateY(-REVEAL_TRAVEL → 0)
const REVEAL_TRAVEL = 40;
// "잡혀 있음"을 보여주는 최소 노출치. 손가락이 당기다 말고 위로 살짝 올라가면(아직
// 손을 떼지 않음) 훅(usePullToRefresh)은 pull 값만 0으로 줄이고 제스처는 그대로 살려
// 둔다(touchend/touchcancel 확정 전까지 놓치지 않는다는 원칙). 그 사이 오버레이가 완전히
// 사라지면 "이미 놓쳤다"는 오해를 준다 — phase가 idle이 아닌 동안(=제스처가 아직 안
// 끝난 동안)에는 opacity·위치가 이 값 밑으로 내려가지 않고 "여전히 잡고 있다"는 흔적을
// 남긴다. 제스처가 진짜로 끝나 phase가 idle이 되면(훅의 reset) 그때 비로소 0까지 접힌다.
const REVEAL_FLOOR = 0.32;

const PullToRefreshIndicator = ({ pull, phase, threshold, maxPull }) => {
  "use memo";

  const reducedMotion = useReducedMotion();
  const isReady = phase === 'ready';
  const isRefreshing = phase === 'refreshing';
  const isDone = phase === 'done';
  const engaged = phase !== 'idle';

  // useMotionValueEvent 콜백은 리렌더와 무관하게 이어지는 구독이라, React state를 클로저로
  // 직접 참조하면 오래된 값을 볼 수 있다 — phase 파생값은 모두 ref로 최신화해 참조한다.
  const isRefreshingRef = useRef(false);
  useEffect(() => { isRefreshingRef.current = isRefreshing; }, [isRefreshing]);
  const isDoneRef = useRef(false);
  useEffect(() => { isDoneRef.current = isDone; }, [isDone]);
  const engagedRef = useRef(false);
  useEffect(() => { engagedRef.current = engaged; }, [engaged]);

  // reveal — 0(완전히 숨김) ~ 1(완전히 보임) 하나로 opacity·위치·스케일을 전부 몬다.
  // pull(0→threshold)에 정비례해 0→1로 올라가되, 제스처가 아직 안 끝났으면(engaged)
  // REVEAL_FLOOR 밑으로 내려가지 않는다. refreshing·done 중에는 아래 별도 effect가 1로
  // 고정한다(그 상태에선 pull이 threshold에 스프링으로 붙들려 있어 사실상 같은 값이지만,
  // 판정 시점의 프레임 오차를 없애기 위해 명시적으로 고정한다).
  const reveal = useMotionValue(0);
  useMotionValueEvent(pull, 'change', (v) => {
    if (isRefreshingRef.current || isDoneRef.current) return;
    const raw = threshold > 0 ? Math.min(1, Math.max(0, v / threshold)) : 0;
    const floor = engagedRef.current ? REVEAL_FLOOR : 0;
    reveal.set(Math.max(raw, floor));
  });
  useEffect(() => {
    if (isRefreshing || isDone) reveal.set(1);
  }, [isRefreshing, isDone, reveal]);
  // 제스처가 끝나 idle로 돌아왔는데 pull이 이미 0이면 change 이벤트가 안 와 floor(0.32)에
  // 걸린 채 남을 수 있다 — phase 변화 시점에 현재 pull 기준으로 한 번 재계산한다.
  useEffect(() => {
    if (isRefreshing || isDone) return;
    const raw = threshold > 0 ? Math.min(1, Math.max(0, pull.get() / threshold)) : 0;
    reveal.set(Math.max(raw, engaged ? REVEAL_FLOOR : 0));
  }, [engaged, isRefreshing, isDone, pull, threshold, reveal]);

  const translateY = useTransform(reveal, [0, 1], [-REVEAL_TRAVEL, 0]);
  const scale = useTransform(reveal, [0, 1], [0.6, 1]);

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

  // document.body에 포털로 그린다 — 5개 적용처 중 상당수가 `as={motion.div}`를 쓰는데,
  // framer-motion은 값이 0이어도 transform을 인라인으로 남겨 그 자손인 position:fixed
  // 요소의 기준을 뷰포트가 아니라 그 motion.div로 바꿔버릴 수 있다. 포털로 화면 서브트리
  // 밖에 그리면 이 문제와 완전히 무관해지고, 모든 화면에서 정확히 같은 위치에 뜬다.
  return createPortal(
    <div
      aria-hidden="true"
      className="fixed left-1/2 -translate-x-1/2 z-[30] pointer-events-none"
      style={{ top: 'calc(var(--status-bar-height) + 64px)' }}
    >
      <motion.div
        animate={chipControls}
        style={{ opacity: reveal, scale, y: translateY }}
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
    </div>,
    document.body,
  );
};

/**
 * 디버그 오버레이 — `localStorage.setItem('ptr.debug','1')`일 때만 렌더된다(기본 꺼짐).
 * usePullToRefresh가 남긴 최근 이벤트(최대 20줄, 각 줄 앞에 제스처 시작 후 경과 `+Nms`)를
 * 화면 좌상단에 반투명 박스로 보여준다 — 실기기에서 "왜 풀렸는지"(reset의 reason)를 콘솔
 * 연결 없이 바로 읽기 위한 용도다. 설정 화면(SettingsNewFullSheet)의 "당겨서 새로고침
 * 진단 표시" 토글이 PTR_DEBUG_EVENT를 쏘면 새로고침 없이 즉시 나타나고/사라진다.
 * 디자인 토큰만 쓴다(하드코딩 색상 금지) — layout-black/white 토큰을 다크와 무관하게
 * 항상 어두운 칩으로 고정해 어느 배경 위에서도 로그 텍스트가 읽히게 한다.
 *
 * document.body에 포털로 그린다 — 위 인디케이터와 같은 이유(as={motion.div} 자손의
 * position:fixed 기준 오염)로, Component 서브트리 밖에 그려 완전히 무관해진다.
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

  // ptr.debug 플래그 — 마운트 시 한 번 읽어 초기값으로 삼되, 설정 화면 토글이 쏘는
  // PTR_DEBUG_EVENT를 들어 실시간으로 갱신한다(새로고침 없이 오버레이가 켜지고/꺼진다).
  // 훅 쪽 debugLog도 같은 플래그로 게이팅돼 있어 플래그가 꺼져 있으면 log는 항상 빈
  // 배열이라 이 오버레이 자체도 사실상 아무 일도 안 한다.
  const [debugEnabled, setDebugEnabled] = useState(() => isPtrDebugEnabled());
  useEffect(() => {
    const onDebugChange = (e) => setDebugEnabled(!!e.detail?.enabled);
    window.addEventListener(PTR_DEBUG_EVENT, onDebugChange);
    return () => window.removeEventListener(PTR_DEBUG_EVENT, onDebugChange);
  }, []);

  return (
    <Component
      ref={scrollRef}
      // overscroll-y-none — 브라우저/WebView 기본 오버스크롤 글로우·바운스를 완전히 끈다.
      // 예전에는 overscroll-y-contain(스크롤 체이닝만 막음)을 썼는데, Android WebView는
      // contain이어도 최상단에서 자체 오버스크롤 글로우를 그리며 우리 제스처의 터치
      // 시퀀스를 가로채 touchcancel을 보낼 수 있었다(usePullToRefresh.js 상단 설명 참고) —
      // none으로 네이티브 효과 자체를 없애 우리 제스처만 남긴다.
      // 콘텐츠를 더 이상 밀지 않으므로(위 파일 상단 "단순화" 설명 참고) children은 그대로
      // 이 안에 직접 그린다 — 래퍼 div도, relative 기준점도 필요 없다(인디케이터는 fixed+포털).
      className={`overscroll-y-none ${className}`}
      {...rest}
    >
      <PullToRefreshIndicator pull={pull} phase={phase} threshold={threshold} maxPull={maxPull} />
      {children}
      {debugEnabled && <PullToRefreshDebugOverlay log={debugLog} />}
    </Component>
  );
});

export default PullToRefresh;
