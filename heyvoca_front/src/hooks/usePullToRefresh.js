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
//
// ── "손을 안 뗐는데 풀린다" 버그(2026-09 QA) — 원인과 대응 ───────────────────────
// 실기기(Android WebView)에서 당기는 도중 제스처가 제멋대로 원위치로 돌아가는 문제가
// 코드 리뷰로 확인된 원인은 두 가지였다(둘 다 아래에서 고쳤다):
//
//  (b) [확정 원인] 아래 onTouchMove의 `dy <= 0` 분기 — 이미 pulling 중인데 손가락이
//      시작점보다 살짝 위로만 올라가도(자연스러운 손떨림 수준) `reset()`(스프링 복귀
//      애니메이션)과 `g.active = false`(제스처 완전 종료)를 **동시에** 했다. 그 뒤로
//      같은 터치 시퀀스 안에서 다시 아래로 내려도 `onTouchStart`가 다시 불리지 않는 한
//      (같은 시퀀스라 안 불린다) 제스처가 복구되지 않아 "손 안 뗐는데 풀린" 것처럼 보였다.
//      고침: pulling이 이미 확정된 상태에서 dy<=0이면 pull만 0으로 줄이고 제스처는
//      유지한다 — 최종 판정(복귀 vs 새로고침)은 오직 touchend/touchcancel에서만 내린다.
//      (반대로 el.scrollTop>0, 즉 실제 스크롤이 시작된 경우는 그대로 제스처를 접는다 —
//      이건 더 이상 pull이 아니라 일반 스크롤이다.)
//
//  (a) [보강] Android WebView가 자체 오버스크롤 글로우/바운스를 우리보다 먼저 가져가며
//      touchcancel을 보내면, 예전 코드는 touchcancel을 touchend와 똑같이 처리해 즉시
//      복귀시켰다. preventDefault(passive:false로 등록됨, 당김이 확정된 순간부터 호출)에
//      더해 pulling이 확정되면 대상 요소의 touch-action을 'none'으로 바꿔 네이티브가
//      이 터치 시퀀스를 아예 못 가져가게 막았다. 그래도 touchcancel이 오면(진짜 해석 불가
//      상황 — 전화 수신, 시스템 제스처 등) 곧장 리셋하지 않고 짧은 유예(CANCEL_GRACE_MS)
//      동안 pull 값을 얼려 둔다 — 그 사이 같은 손가락이 새 touchstart로 이어지면(일부
//      WebView가 실제로 이렇게 한다) 이어서 당기는 것으로 보고, 유예가 끝나도록 아무 입력이
//      없으면 그때 최종 판정을 내린다.
//
// 컨테이너의 `overscroll-behavior`(PullToRefresh.jsx의 overscroll-y-none)도 함께 봐야
// 한다 — 네이티브 바운스 자체를 CSS 레벨에서 끈다.
//
// ── "당긴 채로 멈춰 있으면 손 안 뗐는데 풀린다" 재현(2026-09-21 QA) — 재조사 ──────────
// 위 (a)(b) 조치 이후에도 실기기(Android WebView·홈)에서 재현됐다. 코드를 다시 훑어
// 확인한 것과 이번에 고친 것을 구분해 적는다.
//
//  · [확인, 문제 없음] onTouchMove 리스너는 이미 `{ passive: false }`로 붙어 있고, 당김이
//    확정된 프레임마다 `e.preventDefault()`를 호출한다 — React의 합성 onTouchMove(항상
//    passive)를 쓰지 않고 최초부터 addEventListener를 직접 썼다. 이 부분은 원인이 아니다.
//  · [확인, 실질적 영향 없음] `el.style.touchAction = 'none'`은 당김이 "확정된 다음"에야
//    걸리는데, Android는 해당 터치 시퀀스의 touch-action을 touchstart 시점(정확히는 첫
//    비동기 히트테스트 시점)에 한 번만 확정해 이후 변경을 반영하지 않는다. 즉 이 줄은
//    이번 터치 시퀀스에는 사실상 무효고, 실제 방어는 바로 위 preventDefault다. 걷어내면
//    다음 프레임/다른 브라우저에 도움이 될 수도 있어 남겨두되, 이게 핵심 방어라고
//    오해하지 않는다(주석 정정).
//  · [신규 조치] Android는 손가락이 눌린 채 일정 시간 움직이지 않으면(길게 누르기) 내부
//    제스처 판정기가 컨텍스트 메뉴/텍스트 선택으로 이 터치를 가져가려 시도할 수 있고,
//    이 과정에서 우리 터치 시퀀스가 touchcancel로 끊길 수 있다. `index.css`가 전역으로
//    `user-select:none`/`-webkit-touch-callout:none`을 걸어 두긴 했지만(모든 원소 대상),
//    일부 WebView 빌드는 CSS만으로 컨텍스트 이벤트 자체의 발생까지는 막지 못한다 —
//    그래서 이번에 `contextmenu` 이벤트를 JS 레벨에서 한 번 더 preventDefault한다
//    (제스처 추적 중일 때만, 아래 onContextMenu).
//  · [신규 조치] touchcancel을 받았을 때의 유예가 220ms로 너무 짧았다 — 그 시간 안에
//    후속 touchstart(이어받기)가 오지 않으면 무조건 "확정"으로 판단해 되돌리거나
//    새로고침을 트리거했는데, 이게 바로 "아직 손 안 뗐는데 풀린" 것처럼 보이는 지점이다.
//    지금은 손가락이 실제로 안 뗀 상태일 가능성을 훨씬 더 오래 봐준다 — touchcancel을
//    받으면 pull 값을 그 자리에 얼려 둔 채 **최종 판정을 절대 서두르지 않고** 다음
//    touchend/touchstart를 기다리다, 정말 아무 입력도 없을 때만 최대 CANCEL_SAFETY_MS(3초)
//    뒤에 안전장치로 판정한다(변수명도 "유예"가 아니라 "안전장치"라는 의도가 드러나게
//    CANCEL_GRACE_MS → CANCEL_SAFETY_MS로 바꿨다).
//  · [점검, 이번 재현과 무관] 리마운트/재초기화 경로도 다시 봤다 — 이 훅의 메인
//    useEffect cleanup은 리스너만 떼고 reset()을 부르지 않는다(예전에 그런 적이 없다).
//    홈(components/home/Main.jsx)은 로딩 상태에 따라 PullToRefresh를 조건부로 껐다 켜거나
//    key를 바꿔 다시 마운트하지 않으며(단일 return, 최상위에 key 없음), onRefresh로 넘기는
//    handlePullToRefresh는 deps가 refreshStats 하나뿐이고 refreshStats(StatsContext)는
//    deps가 빈 배열이라 완전히 안정적이다 — 즉 드래그 중 이 훅의 메인 이펙트가 onRefresh
//    identity 변화로 재실행되는 경로는 없다. 이 각도는 원인에서 제외한다.
//
// ── "당긴 채로 멈춰 있으면 손 안 뗐는데 풀린다" 재현 — 진짜 원인(2026-09-21 실기기 확정) ──
// 위 조치들을 다 넣은 뒤에도 재현됐다. 실기기 콘솔에 다음 경고가 함께 찍히는 걸 확인했다:
//   "Ignored attempt to cancel a touchmove event with cancelable=false, because scrolling
//    is in progress and cannot be interrupted"
// 원인은 아래 onTouchMove의 예전 구조에 있었다 — pulling으로 "확정"되기 전(TAP_SLOP 이내)
// 에는 preventDefault를 아예 호출하지 않았다(탭이 당김에 먹혀 click이 씹히는 걸 막으려는
// 의도였다). 그런데 그 몇 프레임 동안 Chrome은 이미 이 터치 시퀀스를 "스크롤 제스처"로
// 확정해 자기가 가져가 버린다 — 그 뒤로는 우리가 아무리 나중에 preventDefault를 걸어도
// (pulling 확정 후) 이미 cancelable=false라 무시되고, 곧 touchcancel로 끊긴다. 스크롤 불가능한
// 화면(단어장 목록)에서 멀쩡했던 이유도 이거다 — 가져갈 스크롤이 없으니 Chrome이 애초에
// 스크롤 제스처를 시작하지 않는다.
// 고침: 슬롭을 기다리지 않는다. 첫 touchmove에서 즉시 방향을 판정해(아래로·세로 우세) 그
// 이벤트 안에서 바로 preventDefault한다 — Chrome이 스크롤을 선점할 틈 자체를 주지 않는다.
// 그 대가로 예전 TAP_SLOP(탭의 미세한 떨림까지 당김으로 잡지 않으려던 여유 구간)은 걷어냈다.
// 버튼 위 탭은 여전히 INTERACTIVE_SELECTOR가 애초에 후보에서 제외하고, 그 외 요소의 탭은
// 보통 touchmove 자체가 거의 없거나 있어도 방향이 위/가로로 튀어 이 분기를 타지 않는 경우가
// 대부분이라 실사용 영향은 제한적으로 본다 — 스크롤 가능한 5개 탭 전부에서 "손 안 뗐는데
// 풀린다"를 확정적으로 없애는 쪽을 우선했다.
//
// 아래에서 실제로 무슨 일이 있었는지 실기기에서 바로 확인할 수 있도록
// `localStorage.setItem('ptr.debug','1')`일 때만 동작하는 이벤트 로그를 추가했다
// (PullToRefresh.jsx의 디버그 오버레이가 이 로그를 그린다). 기본은 꺼져 있다.
// `move(non-cancelable)` 로그가 보이면 여전히 Chrome이 스크롤을 선점했다는 뜻이다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMotionValue, animate } from 'framer-motion';
import { showToast } from '../utils/osFunction';
import { haptic } from '../lib/feel';

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// touchcancel 뒤 최종 판정까지 기다리는 안전장치 시간 — 이 시간 안에 같은 손가락이 새
// touchstart로 이어지면 "아직 안 뗐다"로 보고 pull을 이어간다. 예전엔 220ms였는데
// 너무 짧아 "당긴 채로 멈춰 있다가 touchcancel을 맞고도 아직 손을 안 뗀" 흔한 경우를
// 손을 뗀 것으로 오판했다(2026-09-21). 손가락이 진짜 안 뗀 채 멈춰 있을 가능성을
// 최대한 오래 봐주고, 정말 아무 입력도 없을 때만 이 시간이 지나서 안전하게 판정한다 —
// 사람이 "이상하게 오래 멈춰 있네" 느낄 수는 있어도 "안 뗐는데 풀렸다"보다는 훨씬 낫다.
const CANCEL_SAFETY_MS = 3000;

// 디버그 오버레이(ptr.debug)에 남기는 최근 이벤트 줄 수
const DEBUG_LOG_LIMIT = 20;

// 설정 화면 토글(ptr.debug)이 켜지고/꺼지는 순간 같은 탭 안에서 훅과 오버레이 둘 다
// 즉시 반영하기 위한 커스텀 이벤트 — localStorage의 'storage' 이벤트는 같은 탭에서는
// 발생하지 않으므로(다른 탭/윈도우에서 바꿀 때만 발생), setPtrDebugEnabled가 값을 쓴
// 직후 이 이벤트를 직접 쏜다.
export const PTR_DEBUG_EVENT = 'ptr-debug-change';

export const isPtrDebugEnabled = () => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem('ptr.debug') === '1';
  } catch {
    // 일부 WebView는 localStorage 접근이 막혀 있을 수 있다 — 그런 경우 그냥 디버그를 끈다.
    return false;
  }
};

// 설정 화면(SettingsNewFullSheet)의 "당겨서 새로고침 진단 표시" 토글이 호출한다 —
// localStorage에 쓰고 PTR_DEBUG_EVENT를 쏴서 새로고침 없이 오버레이가 켜지고/꺼지게 한다.
export const setPtrDebugEnabled = (enabled) => {
  try {
    if (enabled) window.localStorage.setItem('ptr.debug', '1');
    else window.localStorage.removeItem('ptr.debug');
  } catch {
    // localStorage 접근 불가 — 이벤트만 쏴서 이번 세션 동안은 동작하게 한다.
  }
  try {
    window.dispatchEvent(new CustomEvent(PTR_DEBUG_EVENT, { detail: { enabled } }));
  } catch {
    // CustomEvent 미지원 환경(구형 WebView) — 조용히 무시, 다음 마운트에서 localStorage로 반영.
  }
};

// 버튼/링크/폼 요소 위에서 시작한 터치는 애초에 당김 제스처 후보에서 제외한다 —
// 스크롤 최상단에 버튼이 있는 화면(홈 CTA 등)에서 버튼을 누르자마자 당김이 가로채는
// 사고를 막는다. data-no-ptr 로 개별 요소를 추가 제외할 수 있다.
const INTERACTIVE_SELECTOR = 'button, a, [role="button"], input, textarea, select, [data-no-ptr]';

// "방향 확정(decided)"과 "시각적 당김 확정(pulling)"을 분리하는 슬롭(2026-09-21 보완).
// preventDefault는 방향이 정해지는 즉시(아래 dy 4px) 걸어 브라우저의 스크롤 선점을 막아야
// 하지만, 그 즉시 콘텐츠를 밀거나 인디케이터를 보여주면 카드형(비-버튼) 탭에서 손끝이
// 1~수 px 흔들리기만 해도 화면이 반응해 버린다. 그래서 방향 판정과 별개로, 이 거리만큼
// 세로로 누적돼야만 비로소 "당김"으로 보여준다 — 그 전에 손을 떼면 pull=0·phase=idle 그대로라
// 아무 상태 변화 없이 순수 탭(click)으로 남는다.
const VISUAL_SLOP = 4;

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

  // 디버그 오버레이용 이벤트 로그 — localStorage.setItem('ptr.debug','1')일 때만 쌓인다.
  // 껴 있을 때는 setState 자체를 안 타므로(logDebug 안에서 바로 return) 평소 성능에는
  // 영향이 없다. 설정 화면 토글이 실행 중에 값을 바꿀 수 있으므로 PTR_DEBUG_EVENT를 듣고
  // 즉시 갱신하고(아래 useEffect), 그와 별개로 매 제스처 시작(onTouchStart) 시점에도 한 번 더
  // localStorage를 다시 읽는다 — 이벤트를 놓쳤거나(오래된 WebView) 다른 화면에서 훅이 새로
  // 마운트된 경우에도 최신 값을 보장한다.
  const debugEnabledRef = useRef(isPtrDebugEnabled());
  useEffect(() => {
    const onDebugChange = (e) => { debugEnabledRef.current = !!e.detail?.enabled; };
    window.addEventListener(PTR_DEBUG_EVENT, onDebugChange);
    return () => window.removeEventListener(PTR_DEBUG_EVENT, onDebugChange);
  }, []);
  const [debugLog, setDebugLog] = useState([]);
  // 제스처가 실제로 시작된 시각 — 로그 각 줄에 "손을 댄 뒤 몇 ms가 지났는지"를 남기기 위함
  // (실기기 로그만 보고도 "1400ms째 당긴 채 멈춰 있다가 풀렸다" 같은 타이밍을 바로 읽을 수
  // 있게 한다). touchcancel 뒤 "이어받기"로 이어지는 동안은 원래 시작 시각을 유지한다.
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

  // touchId    — 이 제스처를 시작한 손가락의 identifier. 멀티터치 중 다른 손가락의
  //              move/end/cancel을 우리 제스처로 착각하지 않기 위해 고정해 둔다.
  // cancelling — touchcancel을 받고 최종 판정을 유예 중인 상태(위 (a) 설명 참고).
  const gestureRef = useRef({
    active: false, pulling: false, cancelling: false, startY: 0, startX: 0, touchId: null,
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

  const clearTouchAction = useCallback(() => {
    const el = scrollRef?.current;
    if (el) el.style.touchAction = '';
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

  // reason — 디버그 로그에 "왜 리셋됐는지"를 남긴다. 실기기 QA에서 원인을 바로 읽을 수
  // 있게 모든 호출부가 문자열을 넘긴다(아래 참고).
  const reset = useCallback((reason = 'unknown') => {
    gestureRef.current.active = false;
    gestureRef.current.pulling = false;
    gestureRef.current.cancelling = false;
    clearGraceTimer();
    clearTouchAction();
    snapTo(0);
    setPhaseSafe('idle');
    logDebug(`reset(reason=${reason})`);
  }, [snapTo, setPhaseSafe, clearGraceTimer, clearTouchAction, logDebug]);

  const runRefresh = useCallback(async (reason = 'unknown') => {
    clearGraceTimer();
    clearTouchAction();
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
  }, [onRefresh, threshold, minShowMs, errorMessage, snapTo, setPhaseSafe, reset, clearGraceTimer, clearTouchAction, logDebug]);

  // touchend/touchcancel(안전장치 종료)에서 공통으로 쓰는 최종 판정 — threshold를 넘었으면
  // 새로고침, 아니면 원위치. "확실히 끝났다"고 확인된 시점에만 불린다.
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

      // 매 제스처 시작마다 ptr.debug 플래그를 다시 읽는다 — 설정 화면에서 토글을 켜고
      // 바로 이어서 당겨도(페이지 새로고침 없이) 그 제스처부터 로그가 남는다.
      debugEnabledRef.current = isPtrDebugEnabled();

      const g = gestureRef.current;
      // touchcancel 유예 중(원인 a) — 같은 동작이 새 touchstart로 이어졌다. 손가락
      // identifier는 바뀌어도(시스템이 터치를 재발급했을 뿐) pull 값은 그대로 이어가고,
      // 다음 dy 계산이 지금 pull과 맞아떨어지도록 startY만 역산해 맞춘다.
      if (g.active && g.cancelling) {
        clearGraceTimer();
        g.cancelling = false;
        g.pulling = true;
        g.touchId = e.touches[0].identifier;
        g.startY = e.touches[0].clientY - (pull.get() / 0.5);
        g.startX = e.touches[0].clientX;
        logDebug('start(이어받기)');
        return;
      }

      if (el.scrollTop > 0) { g.active = false; return; }
      // 버튼 등 인터랙티브 요소 위에서 시작한 터치는 당김 후보에서 제외 — 탭이 당김에
      // 먹혀 click이 씹히는 사고를 막는다. 그 외 요소는 아래 onTouchMove의 VISUAL_SLOP이
      // 탭 보호를 맡는다(2026-09-21 보완 — "진짜 원인" 절 참고).
      if (e.target?.closest?.(INTERACTIVE_SELECTOR)) { g.active = false; return; }
      stopAnim();
      gestureStartAtRef.current = Date.now();
      gestureRef.current = {
        active: true,
        // decided — 방향(아래로·세로 우세) 판정 여부. pulling(시각적 확정)과 분리했다 —
        // decided는 preventDefault를 걸지 말지만 결정하고, pulling은 실제로 콘텐츠를
        // 밀고 인디케이터를 보여줄지를 결정한다(아래 onTouchMove 참고).
        decided: false,
        pulling: false,
        cancelling: false,
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

      // 시작한 손가락만 추적한다 — 도중에 다른 손가락이 스치거나 겹쳐 닿아도(멀티터치)
      // 그 손가락의 움직임을 우리 제스처로 착각하지 않는다(원인 c).
      const touch = Array.from(e.touches).find((t) => t.identifier === g.touchId);
      if (!touch) return;

      const dy = touch.clientY - g.startY;
      const dx = touch.clientX - g.startX;

      if (!g.decided) {
        // 방향 미확정 — 첫 touchmove에서 곧바로 판정한다(슬롭을 기다리지 않는다,
        // 2026-09-21). 여기서 기다리면 그 사이 Chrome이 스크롤 제스처를 이미 선점해 버려
        // 다음 touchmove부터 cancelable=false가 되고 곧 touchcancel로 끊긴다 — "손 안
        // 뗐는데 풀리는" 진짜 원인이었다(파일 상단 "진짜 원인" 절 참고).
        // 주의: 여기서 확정하는 건 "이 터치 시퀀스를 우리가 가져간다"(preventDefault)이지
        // "당김을 화면에 보여준다"(pulling)가 아니다 — 그 둘은 아래에서 분리한다
        // (VISUAL_SLOP 설명 참고, 2026-09-21 보완).
        if (el.scrollTop > 0 || dy <= 0 || Math.abs(dx) >= dy) {
          // 이미 스크롤 중이거나 위/가로/모호함 — 당김 후보를 접고 브라우저 기본 동작
          // (스크롤·탭)에 맡긴다.
          g.active = false;
          return;
        }
        g.decided = true;
      } else if (el.scrollTop > 0) {
        // 방향은 이미 정했는데 실제 스크롤이 시작됐다 — 더 이상 pull 제스처가 아니다.
        // 아직 시각적으로 당김을 보여준 적이 없다면(pulling===false) 되돌릴 것도 없다.
        if (g.pulling) reset('scroll');
        g.active = false;
        return;
      }

      // 방향이 확정된 모든 touchmove(첫 이벤트 포함)에서 즉시 preventDefault — 슬롭을
      // 기다리지 않고 이 터치 시퀀스를 우리가 가져간다(브라우저의 스크롤 선점 방지).
      // cancelable=false로 들어오면(이미 네이티브가 스크롤을 선점했다는 뜻) 조용히
      // 넘기지 않고 디버그 로그에 남긴다. 이 호출은 "시각적 당김 확정"과는 무관하다.
      if (e.cancelable) {
        e.preventDefault();
      } else {
        logDebug('move(non-cancelable)');
      }

      if (!g.pulling) {
        if (dy < VISUAL_SLOP) {
          // 아직 시각적 슬롭(VISUAL_SLOP) 안 — 스크롤 선점만 막아 둘 뿐, pull/phase는
          // idle 그대로 둔다. 이 상태에서 손을 떼면(touchend) g.pulling이 여전히 false라
          // 아무 상태 변화 없이 순수 탭(click)으로 남는다(카드형 탭 보호, 2026-09-21).
          return;
        }
        g.pulling = true;
        // 당김이 시각적으로 확정된 순간부터 이 요소의 네이티브 터치 처리(스크롤·오버스크롤
        // 글로우)를 끈다 — 실질적 방어는 위 preventDefault다(원인 a 설명 참고). Android는
        // 터치 시퀀스의 touch-action을 시작 시점에 한 번만 확정해 이 줄 자체는 이번
        // 시퀀스에는 무효일 수 있지만, 다음 프레임/다른 브라우저에 도움이 될 수 있어 남겨둔다.
        el.style.touchAction = 'none';
      }

      if (dy <= 0) {
        // 이미 당기는 중에 손가락이 시작점 위로 살짝 올라간 것뿐이다(원인 b) — 제스처를
        // 끝내지 않고 pull만 0으로 줄인다. 손을 뗄 때(touchend)만 최종 판정을 내린다.
        pull.set(0);
        if (phaseRef.current !== 'pulling') setPhaseSafe('pulling');
        const now = Date.now();
        if (now - lastMoveLogAtRef.current > 120) {
          lastMoveLogAtRef.current = now;
          logDebug(`move dy=${Math.round(dy)} pull=0`);
        }
        return;
      }

      const damped = clamp(dy * 0.5, 0, maxPull);
      pull.set(damped);
      const next = damped >= threshold ? 'ready' : 'pulling';
      if (phaseRef.current !== next) {
        // 'pulling'→'ready' 문턱을 처음 넘는 순간에만 — 새로고침이 "확정"됐다는 신호
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
      // 우리가 추적하던 손가락이 뗀 것인지 확인한다 — 다른 손가락이 뗀 것이면 무시하고
      // 우리 손가락은 계속 추적한다(원인 c).
      const lifted = Array.from(e.changedTouches).some((t) => t.identifier === g.touchId);
      if (!lifted) return;

      clearGraceTimer();
      g.active = false;
      g.cancelling = false;
      if (!g.pulling) { clearTouchAction(); return; }
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
        // 아직 당김으로 확정되지 않은 상태에서 취소됐다 — 보여줄 pull이 없으니 그냥 접는다.
        g.active = false;
        g.cancelling = false;
        clearTouchAction();
        logDebug('cancel(pull 없음)');
        return;
      }

      // 진짜로 손을 뗀 것인지, 시스템이 잠깐 가로챈 것뿐인지 touchcancel만으로는 알 수
      // 없다(원인 a — 위 파일 상단 설명 참고). pull 값을 그 자리에서 얼려 두고, 최종 판정을
      // 서두르지 않는다 — 그 사이 onTouchStart가 "이어받기"로 들어오면 계속 당겨지고,
      // 정말 아무 입력도 없을 때만 CANCEL_SAFETY_MS 뒤에 안전장치로 최종 판정(복귀/새로고침)을
      // 내린다(2026-09-21 — 예전 220ms는 "당긴 채로 멈춰 있는" 흔한 경우를 손 뗀 것으로
      // 오판했다. 위 파일 상단 "재조사" 절 참고).
      logDebug('cancel');
      g.pulling = false;
      g.cancelling = true;
      clearGraceTimer();
      graceTimerRef.current = window.setTimeout(() => {
        graceTimerRef.current = null;
        // 그 사이 onTouchStart가 이어받았다면 cancelling이 이미 false다 — 손 안 뗀 것으로
        // 확정됐으니 여기서는 아무 것도 하지 않는다.
        if (!gestureRef.current.cancelling) return;
        gestureRef.current.active = false;
        gestureRef.current.cancelling = false;
        clearTouchAction();
        logDebug(`cancel-timeout(${CANCEL_SAFETY_MS}ms)`);
        resolveGesture('cancel-timeout');
      }, CANCEL_SAFETY_MS);
    };

    // 컨텍스트 메뉴(길게 누르기) 차단 — 손가락을 멈추고 있으면 Android가 텍스트 선택/
    // 컨텍스트 메뉴 제스처로 판단해 터치 시퀀스를 touchcancel로 끊을 수 있다. 전역 CSS
    // (index.css의 user-select:none/-webkit-touch-callout:none)로 이미 메뉴 자체는
    // 막아 두었지만, 일부 WebView는 그것만으로 컨텍스트 이벤트/취소까지는 막지 못해
    // JS 레벨에서 한 번 더 막는다. 터치를 추적 중일 때만 막아 다른 화면(길게 눌러 복사 등)
    // 동작에는 영향을 주지 않는다.
    const onContextMenu = (e) => {
      if (gestureRef.current.active) e.preventDefault();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });
    el.addEventListener('contextmenu', onContextMenu);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
      el.removeEventListener('contextmenu', onContextMenu);
      clearGraceTimer();
      el.style.touchAction = '';
    };
  }, [scrollRef, disabled, threshold, maxPull, pull, resolveGesture, reset, stopAnim, setPhaseSafe, clearGraceTimer, clearTouchAction, logDebug]);

  // 비활성화되면(예: 탭 전환·검색 모드 진입 등 호출부가 막을 때) 진행 중이던 제스처를 리셋
  useEffect(() => {
    if (disabled) reset('disabled');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  return {
    pull, phase, threshold, maxPull,
    // ptr.debug=1일 때만 채워지는 최근 이벤트 로그(PullToRefresh.jsx 디버그 오버레이용)
    debugLog,
  };
}

export default usePullToRefresh;
