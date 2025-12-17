import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNewFullSheetContext, useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { AnimatePresence, motion } from 'framer-motion';

export const NewFullSheetProvider = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // State와 Actions 분리 구독
  const { stack, activeIndex } = useNewFullSheetContext();
  const { closeNewFullSheet, resolveNewFullSheet } = useNewFullSheetActions();

  // 스냅샷 유지로 최종 닫힘 시 exit 애니메이션 재생
  const [renderedStack, setRenderedStack] = useState([]);
  const [renderedActiveIndex, setRenderedActiveIndex] = useState(-1);
  const [visible, setVisible] = useState(false);
  const prevLenRef = useRef(0);
  const [phase, setPhase] = useState('idle');

  useEffect(() => {
    const prevLen = prevLenRef.current;
    const currLen = stack.length;

    if (currLen > 0) {
      setRenderedStack(stack);
      setRenderedActiveIndex(activeIndex);
      setVisible(true);
      setPhase(prevLen === 0 ? 'enter' : 'idle');
    } else if (prevLen > 0) {
      // 마지막 newFullSheet 닫힘 → exit 애니메이션
      setVisible(false);
      setPhase('exit');
    }

    prevLenRef.current = currLen;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stack, activeIndex]);

  // 배경 클릭 핸들러 (스냅샷 기준)
  const handleBackdropClick = (e) => {
    if (e.target !== e.currentTarget) return;
    const active = renderedActiveIndex >= 0 ? renderedStack[renderedActiveIndex] : undefined;
    if (!active) return;
    
    if (active.options?.onBackdropClick) {
      active.options.onBackdropClick();
    }
    
    if (active.options?.closeOnBackdropClick) {
      // openAwaitNewFullSheet인 경우 (resolve 함수가 있는 경우) resolveNewFullSheet 호출
      if (active.resolve) {
        const backdropValue = active.options?.backdropClickValue || { confirmed: false, cancelled: true };
        resolveNewFullSheet(backdropValue);
      } else {
        // 일반 openNewFullSheet인 경우 closeNewFullSheet 호출
        closeNewFullSheet();
      }
    }
  };

  return createPortal(
    <AnimatePresence mode="wait">
      {(visible || phase === 'exit') && (
        <motion.div
          key="newFullSheet-backdrop"
          className="
            fixed z-50 
            flex items-center justify-center 
            inset-0
          "
          // initial={phase === 'enter' ? { opacity: 0 } : {}}
          // animate={{ opacity: phase === 'exit' ? 0 : 1 }}
        >
          {renderedStack.map((newFullSheet, index) => {
            const shouldRender = index === renderedActiveIndex || newFullSheet.options.keepInDOM;
            if (!shouldRender) return null;
            // stack에서 최신 props 가져오기
            const currentStackItem = stack.find(item => item.id === newFullSheet.id);
            const currentProps = currentStackItem?.props || newFullSheet.props;
            const NewFullSheetComponent = newFullSheet.component;
            const isActive = index === renderedActiveIndex;
            if (isActive && phase !== 'idle') {
              return (
                <motion.div
                  key={newFullSheet.id}
                  className={`
                    absolute inset-0 flex items-center justify-center 
                    block
                    ${newFullSheet.options.smFull ? '': ''}
                  `}
                  onClick={e => {
                    handleBackdropClick(e);
                    e.stopPropagation();
                  }}
                  initial={phase === 'enter' ? { x: '100%' } : { x: 0 }}
                  animate={{ x: phase === 'exit' ? '100%' : 0 }}
                  transition={{ 
                    type: 'spring', 
                    damping: 25, 
                    stiffness: 200,
                    mass: 0.8
                  }}
                  onAnimationComplete={() => {
                    if (phase === 'exit') {
                      setRenderedStack([]);
                      setRenderedActiveIndex(-1);
                      setPhase('idle');
                    }
                  }}
                >
                  <NewFullSheetComponent {...currentProps} />
                </motion.div>
              );
            }
            return (
              <div
                key={newFullSheet.id}
                className={`
                  absolute inset-0 flex items-center justify-center 
                  ${isActive ? 'block' : 'hidden'}
                  ${newFullSheet.options.smFull ? '': ''}
                `}
                onClick={e => {
                  handleBackdropClick(e);
                  e.stopPropagation();
                }}
              >
                <NewFullSheetComponent {...currentProps} />
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

