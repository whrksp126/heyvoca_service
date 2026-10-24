// src/components/script/ScriptNextButton.jsx — 글자 학습 문제 공통 "다음" 버튼.
//
// 2026-10-24(이슈 #15 QA): 글자 문제는 채점 후 자동으로 넘어가지 않고, 출력형 문제
// (FillInTheBlankTypingQuestion 의 확인→다음)와 같은 primary CTA 를 눌러야 다음 슬라이드로 간다.
// 채점 전에는 자리만 차지하지 않도록 아무것도 그리지 않는다(show=false).

import React from 'react';
import { motion } from 'framer-motion';
import { feel } from '../../lib/feel';

const ScriptNextButton = ({ show, onNext }) => {
  "use memo";
  if (!show) return null;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => { feel('tap'); onNext?.(); }}
      className="flex-shrink-0 w-full h-[50px] rounded-[12px] bg-primary-main-600 text-layout-white text-[16px] font-[700]"
    >
      다음
    </motion.button>
  );
};

export default ScriptNextButton;
