// src/components/script/ScriptCompleteScreen.jsx
//
// 글자 밭 세션 완료 화면 — 경험치·보상 연출 없이 맞힌 글자만 담백하게 보여준다
// (기존 학습 결과 화면과 같은 톤의 상태색·아이콘만 재사용).

import React from 'react';
import { motion } from 'framer-motion';
import { Check, X } from '@phosphor-icons/react';
import { haptic } from '../../lib/feel';

const ScriptCompleteScreen = ({ results, onFinish }) => {
  "use memo";
  const correctCount = results.filter((r) => r.correct).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-[22px] px-[24px] pt-[40px] pb-[24px] h-full"
    >
      <div className="flex flex-col items-center gap-[6px]">
        <h2 className="text-[22px] font-[800] text-layout-black dark:text-layout-white">학습 완료!</h2>
        <p className="text-[14px] font-[600] text-layout-gray-400">
          {results.length}개 중 {correctCount}개를 맞혔어요
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-[8px] w-full max-w-[320px]">
        {results.map((r) => (
          <div
            key={r.char}
            className={`
              flex items-center gap-[4px] h-[38px] pl-[10px] pr-[12px] rounded-full
              ${r.correct
                ? 'bg-status-success-100 dark:bg-status-success-dark text-status-success-600'
                : 'bg-status-error-100 dark:bg-status-error-dark text-status-error-600'}
            `}
          >
            {r.correct ? <Check size={13} weight="bold" /> : <X size={13} weight="bold" />}
            <span className="text-[16px] font-[700]">{r.char}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => { haptic('light'); onFinish(); }}
        className="
          mt-auto w-full h-[52px] rounded-[12px]
          bg-[linear-gradient(180deg,#FF88DC_0%,#FF70D4_100%)]
          text-layout-white text-[16px] font-[700]
        "
      >
        완료
      </button>
    </motion.div>
  );
};

export default ScriptCompleteScreen;
