// src/components/script/ScriptCompleteScreen.jsx
//
// 글자 밭 세션 완료 화면 — 행 이름·글자 수가 들어간 동적 헤드라인("あ행 5글자를 심었어요")
// + 글자 칸 줄(익힌 글자=새싹, 틀린 글자=씨앗). 경험치·보상 연출은 없다(기존 학습 결과
// 화면과 같은 담백한 톤 유지).
//
// 【2026-09-29 QA 4차】 상단 토끼 마스코트 그림을 뺐다 — 이 화면 하나만 오로라 없는 큰
// 캐릭터 그림이 있어 학습 결과 화면(components/takeTest/StudyResult.jsx)과 톤이 달랐다.
// 대신 내용을 세로 중앙에 두고, 등장 애니메이션은 학습 결과 화면의 목록형 슬라이드
// (FarmListSlide)와 같은 타이밍으로 맞췄다 — 헤드라인 묶음이 delay 0.3, 글자 칸 줄이
// delay 0.5로 순차 등장한다(그림 → 문구 → 목록 순서 중 그림만 빠진 형태).

import React from 'react';
import { motion } from 'framer-motion';
import { haptic } from '../../lib/feel';
import CropImage from '../farm/CropImage';

const ScriptCompleteScreen = ({ results, rowLabel, onFinish }) => {
  "use memo";
  const correctCount = results.filter((r) => r.correct).length;
  const total = results.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full px-[24px] pt-[24px] pb-[24px]"
    >
      {/* 학습 결과 화면과 같은 규격 — 짧은 콘텐츠는 세로 중앙에 선다(StudyResult.jsx
          "min-h-full flex flex-col justify-center" 참고). */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="min-h-full flex flex-col items-center justify-center gap-[20px]">
          <motion.div
            className="flex flex-col items-center gap-[6px]"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <h2 className="text-[20px] font-[800] text-center text-layout-black dark:text-layout-white">
              {rowLabel ? `${rowLabel} ` : ''}{total}글자를 심었어요
            </h2>
            <p className="text-[13px] font-[600] text-layout-gray-400">
              {total}개 중 {correctCount}개를 맞혔어요
            </p>
          </motion.div>

          <motion.div
            className="flex flex-wrap justify-center gap-x-[14px] gap-y-[16px] w-full max-w-[320px]"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            {results.map((r) => (
              <div key={r.char} className="flex flex-col items-center gap-[4px] w-[52px]">
                <CropImage stage={r.correct ? 'sprout' : 'seed'} size={40} align="center" />
                <span className="text-[13px] font-[700] text-layout-black dark:text-layout-white">{r.char}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { haptic('light'); onFinish(); }}
        className="
          mt-[18px] w-full h-[52px] rounded-[12px] flex-shrink-0
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
