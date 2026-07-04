import React from 'react';
import { Flame } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 전역 콤보 표시 바 — AI 추천 테스트 프로그래스 바 위.
 * 콤보 1 이상일 때만 위에서 슬라이드로 등장 (승인된 프로토타입).
 */
const ComboBar = ({ combo }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const current = combo?.current ?? 0;
  const best = combo?.best ?? 0;

  return (
    <AnimatePresence>
      {current >= 1 && (
        <motion.div
          initial={{ opacity: 0, y: -12, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -12, height: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="flex items-center justify-between mb-[8px] overflow-hidden"
        >
          <div className="flex items-center gap-[5px]">
            <Flame weight="fill" className="text-[18px] text-primary-main-600" />
            <motion.span
              key={current}
              initial={{ scale: 1.35 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="text-[15px] font-[800] text-primary-main-600"
            >
              {current}
            </motion.span>
            <span className="text-[12px] font-[600] text-layout-gray-300">콤보</span>
          </div>
          {best > 0 && (
            <span className="text-[11px] font-[500] text-layout-gray-300">
              최고 {best}
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ComboBar;
