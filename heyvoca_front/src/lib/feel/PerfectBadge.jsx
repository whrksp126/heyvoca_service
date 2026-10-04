// src/lib/feel/PerfectBadge.jsx
//
// '완벽해요' 배지 — 직접 입력·문장 만들기를 한 번에 맞혔을 때 정답 위에 도장처럼 찍힌다.
// 부모는 relative 여야 한다(카드). 임팩트(스케일 1 도달)는 perfect 소리의 3번째 음(≈205ms)에 맞춘다.
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SealCheck } from '@phosphor-icons/react';

const PerfectBadge = ({ show = false, className = '' }) => {
  const reducedMotion = useReducedMotion();
  if (!show) return null;
  return (
    <motion.div
      aria-label="완벽해요"
      className={`
        pointer-events-none absolute left-1/2 top-[10px] z-[4] -translate-x-1/2
        flex items-center gap-[4px]
        px-[10px] py-[4px] rounded-[20px] border-[1.5px]
        border-secondary-yellow-400 bg-secondary-yellow-100 dark:bg-secondary-yellow-dark
        text-secondary-yellow-600 dark:text-secondary-yellow-300
        text-[13px] font-[800] whitespace-nowrap
        ${className}
      `}
      initial={{ scale: reducedMotion ? 1 : 2.4, opacity: 0, rotate: reducedMotion ? 0 : -10 }}
      animate={reducedMotion
        ? { opacity: 1 }
        : { scale: [2.4, 1, 1.1, 1], opacity: [0, 1, 1, 1], rotate: [-10, -4, -4, -4] }}
      transition={reducedMotion
        ? { duration: 0.15 }
        : { duration: 0.42, delay: 0.06, times: [0, 0.4, 0.68, 1], ease: 'easeOut' }}
    >
      <SealCheck weight="fill" className="text-[16px]" />
      완벽해요
    </motion.div>
  );
};

export default PerfectBadge;
