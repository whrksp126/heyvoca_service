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
        // 화면 전체를 덮는 불투명 연출(업적 달성 등)은 뒤를 흐릴 필요도, 화면 전체를 스프링으로 키울 필요도 없다.
        // backdrop-filter 는 위 레이어가 투명도 애니메이션을 하는 동안 매 프레임 다시 계산되고, 화면 크기 레이어의
        // scale 스프링은 저사양 WebView 에서 연출 첫 0.5초를 버벅이게 했다(2026-11 QA #25 8차) — 페이드만 한다.
        if (options?.bare || OverlayComponent?.overlayBare) {
            return (
                <motion.div
                    key={id}
                    className="fixed inset-0 z-[9999]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <OverlayComponent {...props} />
                </motion.div>
            );
        }
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
