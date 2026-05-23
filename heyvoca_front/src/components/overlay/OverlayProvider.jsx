import React from 'react';
import { createPortal } from 'react-dom';
import { useOverlayState, useOverlayActions } from '../../context/OverlayContext';
import { AnimatePresence, motion } from 'framer-motion';

export const OverlayProvider = () => {
    const { current } = useOverlayState();
    const { resolveOverlay } = useOverlayActions();

    const renderCurrent = () => {
        if (!current) return null;
        const { component: OverlayComponent, props, options, id, resolve } = current;
        return (
            <motion.div
                key={id}
                className="fixed inset-0 z-[9999] flex items-center justify-center"
                initial={{ opacity: 0, pointerEvents: 'none' }}
                animate={{ opacity: 1, pointerEvents: 'auto' }}
                exit={{ opacity: 0, pointerEvents: 'none' }}
                transition={{ duration: 0.3 }}
            >
                {/* 백드롭 (옵션에 따라 클릭 시 닫기 기능 추가 가능) */}
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
                    onClick={() => {
                        if (options?.closeOnBackdropClick !== false) {
                            if (resolve) {
                                resolveOverlay(options?.backdropClickValue || { confirmed: false, cancelled: true });
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
        );
    };

    return createPortal(
        <AnimatePresence mode="wait">
            {renderCurrent()}
        </AnimatePresence>,
        document.body
    );
};
