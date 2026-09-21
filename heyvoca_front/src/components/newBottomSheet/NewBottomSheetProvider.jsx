import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { useNewBottomSheetContext, useNewBottomSheetActions } from '../../context/NewBottomSheetContext';

const BottomSheetItem = ({ newBottomSheet, isActive, phase, onDragEnd, onAnimationComplete }) => {
  const controls = useDragControls();
  const sheetRef = useRef(null);
  const isDragEnabled = !!newBottomSheet.options?.isDragToCloseEnabled;

  const handlePointerDown = (e) => {
    if (!isDragEnabled) return;

    // data-drag-handle 속성이 있는 요소에서 시작된 경우 → 내부 드래그 우선
    if (e.target.closest('[data-drag-handle]')) return;

    // 스크롤 가능한 조상 요소 체크
    let el = e.target;
    while (el && el !== sheetRef.current) {
      if (el.scrollHeight > el.clientHeight + 1) {
        // 스크롤 최상단이 아니면 → 스크롤이 우선 (바텀시트 드래그 안 함)
        if (el.scrollTop > 0) return;
        break;
      }
      el = el.parentElement;
    }

    controls.start(e);
  };

  if (!isActive && !newBottomSheet.options?.keepInDOM) return null;

  // overscroll-contain(시트 루트) — 시트 안에서 시작한 터치 스크롤이 시트 바깥으로
  // 체이닝되지 않게 한다. 시트 루트는 overflow-hidden 이라 사용자 스크롤은 안 되지만
  // (아래 ::after 가 만드는 오버플로 때문에) 스크롤 노드는 있어서, Chrome 의 스크롤 체인
  // 탐색이 이 노드에서 끊긴다(cc InputHandler: overscroll-behavior 가 auto 가 아닌 노드는
  // 건너뛰지 않고 여기서 래치). 이게 없으면 콘텐츠가 최상단/최하단이거나 스크롤할 게 없을 때
  // 제스처가 뷰포트(root scroller)까지 올라가는데, Android WebView 는 화면을 꽉 채운
  // 풀시트 스크롤 컨테이너를 root scroller 로 승격(ImplicitRootScroller)하기 때문에
  // 바텀시트를 스크롤하면 그 아래 풀시트 목록이 움직였다. index.css 의 .bottom-sheet-open 참고.
  const commonProps = {
    ref: sheetRef,
    drag: isDragEnabled ? 'y' : false,
    dragListener: false,
    dragControls: controls,
    dragConstraints: { top: 0, bottom: 0 },
    dragElastic: 0.4,
    onPointerDown: handlePointerDown,
    onDragEnd: (event, info) => onDragEnd(event, info, newBottomSheet),
    'data-bottom-sheet': 'true',
    className: `
      left-0 right-0 bottom-0 z-[1001]
      fixed
      max-h-[90vh]
      rounded-t-2xl
      bg-layout-white dark:bg-layout-black
      overflow-hidden
      overscroll-contain
      after:content-['']
      after:absolute after:left-0 after:right-0 after:bottom-[-100vh]
      after:h-[101vh]
      after:bg-layout-white dark:after:bg-layout-black
    `,
  };

  if (isActive && phase !== 'idle') {
    return (
      <motion.div
        key={newBottomSheet.id}
        {...commonProps}
        initial={phase === 'enter' ? { y: '100%' } : { y: 0 }}
        animate={{ y: phase === 'exit' ? '100%' : 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onAnimationComplete={onAnimationComplete}
      >
        <div>
          <newBottomSheet.component {...newBottomSheet.props} />
          <div style={{ height: 'calc(var(--safe-area-bottom) - 20px)' }} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={newBottomSheet.id}
      {...commonProps}
      // hidden 시트는 보이는 위치(y:0)에서 시작해 아래로 슬라이드(일반 닫힘과 동일).
      initial={{ y: 0, opacity: 1 }}
      animate={{ y: newBottomSheet.options?.hidden ? '100%' : 0, opacity: newBottomSheet.options?.hidden ? 0 : 1 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      style={newBottomSheet.options?.hidden ? { pointerEvents: 'none' } : undefined}
    >
      <div>
        <newBottomSheet.component {...newBottomSheet.props} />
        <div style={{ height: 'calc(var(--safe-area-bottom) - 20px)' }} />
      </div>
    </motion.div>
  );
};

export const NewBottomSheetProvider = () => {
  "use memo";

  const { stack } = useNewBottomSheetContext();
  const { clearStack, popNewBottomSheet, resolveNewBottomSheet } = useNewBottomSheetActions();
  const [renderedStack, setRenderedStack] = useState([]);
  const [renderedActiveIndex, setRenderedActiveIndex] = useState(-1);
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    if (stack.length > 0) {
      setPhase('enter');
      setRenderedStack(stack);
      setRenderedActiveIndex(stack.length - 1);
    } else {
      setPhase('exit');
    }
  }, [stack]);

  // 바텀시트가 하나라도 떠 있는 동안(닫힘 애니메이션 중 포함 — renderedStack 기준)
  // <html> 에 bottom-sheet-open 을 붙인다. index.css 가 이 클래스로 아래 레이어(#root,
  // 풀시트)를 pointer-events:none 으로 잠가, Chrome 이 아래 레이어의 스크롤 컨테이너를
  // root scroller 로 승격하거나 컴포지터 히트테스트가 거기로 새는 일을 막는다.
  useEffect(() => {
    const root = document.documentElement;
    if (renderedStack.length > 0) root.classList.add('bottom-sheet-open');
    else root.classList.remove('bottom-sheet-open');
    return () => root.classList.remove('bottom-sheet-open');
  }, [renderedStack.length]);

  const handleBackdropClick = (e) => {
    const currentSheet = stack[stack.length - 1];
    if (!currentSheet) return;
    if (currentSheet.options?.isBackdropClickClosable === false) return;

    if (currentSheet.resolve) {
      // openAwait/pushAwait 시트 — resolve 호출 (미호출 시 Promise 가 pending 상태로 남음)
      const value = currentSheet.options?.backdropClickValue ?? null;
      resolveNewBottomSheet(value);
    } else {
      popNewBottomSheet();
    }
  };

  const handleDragEnd = (event, info, newBottomSheet) => {
    if (newBottomSheet.options.isDragToCloseEnabled && (info.offset.y > 100 || info.velocity.y > 300)) {
      popNewBottomSheet();
    }
  };

  const handleAnimationComplete = () => {
    if (phase === 'exit') {
      setRenderedStack([]);
      setRenderedActiveIndex(-1);
      setPhase('idle');
    }
  };

  return createPortal(
    <AnimatePresence mode="wait">
      {renderedStack.length > 0 && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 z-[1000]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
          />
          {renderedStack.map((newBottomSheet, index) => {
            const isActive = index === renderedActiveIndex;
            return (
              <BottomSheetItem
                key={newBottomSheet.id}
                newBottomSheet={newBottomSheet}
                isActive={isActive}
                phase={phase}
                onDragEnd={handleDragEnd}
                onAnimationComplete={isActive ? handleAnimationComplete : undefined}
              />
            );
          })}
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
