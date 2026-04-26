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
      className={`
        left-0 right-0 bottom-0 z-[1001]
        fixed
        max-h-[90vh]
        rounded-t-2xl
        bg-layout-white
        after:content-['']
        after:absolute after:left-0 after:right-0 after:bottom-[-100vh]
        after:h-[101vh]
        after:bg-layout-white
      `}
      initial={{ y: newBottomSheet.options?.hidden ? '100%' : 0, opacity: newBottomSheet.options?.hidden ? 0 : 1 }}
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
