import React from 'react';
import { createPortal } from 'react-dom';
import { useOverlayState, useOverlayActions } from '../../context/OverlayContext';
import { AnimatePresence, motion } from 'framer-motion';

export const OverlayProvider = () => {
    const { current } = useOverlayState();
    const { resolveOverlay } = useOverlayActions();

    if (!current) {
        return (
            <AnimatePresence>
                {/* current가 없을 때 애니메이션 종료를 위해 빈 공간 유지 */}
            </AnimatePresence>
        );
    }

    const { component: OverlayComponent, props, options, id, resolve } = current;

    return createPortal(
        <AnimatePresence mode="wait">
            {current && (
                <motion.div
                    key={id}
                    className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-auto"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* 백드롭 (옵션에 따라 클릭 시 닫기 기능 추가 가능) */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
                        onClick={() => {
                            if (options?.closeOnBackdropClick !== false) {
                                if (resolve) {
                                    resolveOverlay(options?.backdropClickValue || { confirmed: false, cancelled: true });
                                } else {
                                    // 일반 오버레이는 hideOverlay가 Context에 정의되어 있어야 함 (추후 보완 가능)
                                }
                            }
                        }}
                    />

                    <motion.div
                        className="relative z-10 w-full h-full flex items-center justify-center"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    >
                        <OverlayComponent {...props} />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};
