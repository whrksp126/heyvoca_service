import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNewBottomSheetContext, useNewBottomSheetActions } from '../../context/NewBottomSheetContext';

export const NewBottomSheetProvider = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // State와 Actions 분리 구독
  const { stack } = useNewBottomSheetContext();
  const { clearStack, popNewBottomSheet } = useNewBottomSheetActions();
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
    if (currentSheet?.options?.isBackdropClickClosable !== false) {
      // handleBack();
      popNewBottomSheet();

    }
  };

  const handleDragEnd = (event, info, newBottomSheet) => {
    if (newBottomSheet.options.isDragToCloseEnabled && (info.offset.y > 100 || info.velocity.y > 300)) {
      // handleBack();
      popNewBottomSheet();
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
            const shouldRender = isActive || newBottomSheet.options?.keepInDOM;

            if (!shouldRender) return null;

            if (isActive && phase !== 'idle') {
              return (
                <motion.div
                  key={newBottomSheet.id}
                  className="
                    left-0 right-0 bottom-0 z-[1001] 
                    fixed 
                    max-h-[90vh]
                    rounded-t-2xl 
                    bg-white dark:bg-[#111]
                    overflow-hidden
                    after:content-[''] 
                    after:absolute after:left-0 after:right-0 after:bottom-[-100vh] 
                    after:h-[101vh] 
                    after:bg-white dark:after:bg-[#111]
                  "
                  initial={phase === 'enter' ? { y: '100%' } : { y: 0 }}
                  animate={{ y: phase === 'exit' ? '100%' : 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  drag={newBottomSheet.options?.isDragToCloseEnabled ? "y" : false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={0.4}
                  onDragEnd={(event, info) => handleDragEnd(event, info, newBottomSheet)}
                  onAnimationComplete={() => {
                    if (phase === 'exit') {
                      setRenderedStack([]);
                      setRenderedActiveIndex(-1);
                      setPhase('idle');
                    }
                  }}
                >
                  <div className="">
                    <newBottomSheet.component {...newBottomSheet.props} />
                  </div>
                </motion.div>
              );
            }

            return (
              <motion.div
                key={newBottomSheet.id}
                className="
                  left-0 right-0 bottom-0 z-[1001] 
                  fixed 
                  max-h-[90vh]
                  rounded-t-2xl 
                  bg-white 
                  after:content-[''] 
                  after:absolute after:left-0 after:right-0 after:bottom-[-100vh] 
                  after:h-[101vh] 
                  after:bg-white
                "
                initial={{ y: newBottomSheet.options?.hidden ? '100%' : 0, opacity: newBottomSheet.options?.hidden ? 0 : 1 }}
                animate={{ y: newBottomSheet.options?.hidden ? '100%' : 0, opacity: newBottomSheet.options?.hidden ? 0 : 1 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={newBottomSheet.options?.hidden ? { pointerEvents: 'none' } : undefined}
                drag={newBottomSheet.options?.isDragToCloseEnabled ? "y" : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.4}
                onDragEnd={(event, info) => handleDragEnd(event, info, newBottomSheet)}
              >
                <div className="">
                  <newBottomSheet.component {...newBottomSheet.props} />
                </div>
              </motion.div>
            );
          })}
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
