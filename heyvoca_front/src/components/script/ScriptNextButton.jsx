// src/components/script/ScriptNextButton.jsx — 글자 학습 문제 공통 "다음" 버튼.
//
// 2026-10-24(이슈 #15 QA): 글자 문제는 채점 후 자동으로 넘어가지 않고, 출력형 문제
// (FillInTheBlankTypingQuestion 의 확인→다음)와 같은 primary CTA 를 눌러야 다음 슬라이드로 간다.
// 2026-10-24(이슈 #15 2차): 채점 전에도 비활성(회색)으로 자리를 잡아 둔다 — 채점 순간 버튼 영역이
// 새로 생겨 위 콘텐츠 크기가 바뀌지 않게(Main.jsx 공통 '다음' 버튼과 같은 규칙).

import React from 'react';
import { motion } from 'framer-motion';
import { feel } from '../../lib/feel';

const ScriptNextButton = ({ show, onNext }) => {
  "use memo";
  return (
    <motion.button
      type="button"
      disabled={!show}
      whileTap={show ? { scale: 0.97 } : undefined}
      onClick={() => { if (!show) return; feel('tap'); onNext?.(); }}
      className={`
        flex-shrink-0 w-full h-[50px] rounded-[12px] text-[16px] font-[700]
        transition-colors duration-150
        ${show
          ? 'bg-primary-main-600 text-layout-white'
          : 'bg-layout-gray-200 dark:bg-[#2A2A2A] text-layout-gray-400 dark:text-layout-gray-300 pointer-events-none'}
      `}
    >
      다음
    </motion.button>
  );
};

export default ScriptNextButton;
