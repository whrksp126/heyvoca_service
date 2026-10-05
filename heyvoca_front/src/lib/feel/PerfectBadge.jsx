// src/lib/feel/PerfectBadge.jsx
//
// '완벽해요' 배지 — 직접 입력·문장 만들기를 한 번에 맞혔을 때 답 영역 바로 위 중앙에 수평 pill 로 살짝
// 떠오르며 나타났다 사라진다(기존 라벨 pill 규격: 둥근 pill + 토큰 색 + 아이콘·텍스트).
// 부모는 `relative` 인 답 영역 래퍼여야 한다. 래퍼 위쪽(bottom-full)에 absolute 로 얹히므로 다른 요소를
// 가리거나 밀지 않는다. 등장 타이밍은 perfect 소리의 3번째 음(≈180ms)에 맞춘다.
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Sparkle } from '@phosphor-icons/react';

const PerfectBadge = ({ show = false, className = '' }) => {
  const reducedMotion = useReducedMotion();
  if (!show) return null;
  return (
    <div
      aria-label="완벽해요"
      className={`pointer-events-none absolute inset-x-0 bottom-full z-[4] mb-[6px] flex justify-center ${className}`}
    >
      <motion.div
        className="
          inline-flex items-center gap-[4px]
          px-[10px] py-[3px] rounded-[20px]
          bg-primary-main-50 dark:bg-primary-main-dark
          text-primary-main-600 dark:text-primary-main-300
          text-[12px] font-[700] whitespace-nowrap
        "
        initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
        animate={reducedMotion
          ? { opacity: [0, 1, 1, 0] }
          : { opacity: [0, 1, 1, 0], y: [6, 0, 0, -6] }}
        transition={{ duration: 1.7, delay: 0.18, times: [0, 0.12, 0.8, 1], ease: 'easeOut' }}
      >
        <Sparkle weight="fill" className="text-[13px]" />
        완벽해요
      </motion.div>
    </div>
  );
};

export default PerfectBadge;
