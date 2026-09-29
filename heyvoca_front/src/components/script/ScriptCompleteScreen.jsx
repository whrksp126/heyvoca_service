// src/components/script/ScriptCompleteScreen.jsx
//
// 글자 밭 세션 완료 화면 — 토끼 마스코트(당근 농장 공용 에셋) + 행 이름·글자 수가 들어간
// 동적 헤드라인("あ행 5글자를 심었어요") + 글자 칸 줄(익힌 글자=새싹, 틀린 글자=씨앗).
// 경험치·보상 연출은 없다(기존 학습 결과 화면과 같은 담백한 톤 유지).

import React from 'react';
import { motion } from 'framer-motion';
import { haptic } from '../../lib/feel';
import CropImage, { CROP_ASSETS } from '../farm/CropImage';

const ScriptCompleteScreen = ({ results, rowLabel, onFinish }) => {
  "use memo";
  const correctCount = results.filter((r) => r.correct).length;
  const total = results.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-[20px] px-[24px] pt-[32px] pb-[24px] h-full"
    >
      <img
        src={CROP_ASSETS.mascotSolo}
        alt=""
        draggable={false}
        className="w-[112px] h-[112px] object-contain select-none"
      />

      <div className="flex flex-col items-center gap-[6px]">
        <h2 className="text-[20px] font-[800] text-center text-layout-black dark:text-layout-white">
          {rowLabel ? `${rowLabel} ` : ''}{total}글자를 심었어요
        </h2>
        <p className="text-[13px] font-[600] text-layout-gray-400">
          {total}개 중 {correctCount}개를 맞혔어요
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-x-[14px] gap-y-[16px] w-full max-w-[320px]">
        {results.map((r) => (
          <div key={r.char} className="flex flex-col items-center gap-[4px] w-[52px]">
            <CropImage stage={r.correct ? 'sprout' : 'seed'} size={40} align="center" />
            <span className="text-[13px] font-[700] text-layout-black dark:text-layout-white">{r.char}</span>
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
        확인
      </button>
    </motion.div>
  );
};

export default ScriptCompleteScreen;
