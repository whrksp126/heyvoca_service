// src/components/script/TraceCard.jsx — StrokeTracer를 세션 스텝 모양에 맞춰 감싼다.
// 알파벳은 첫 버전에서 대문자 획만 따라 쓴다(소문자는 향후 확장 — 보고 참고).

import React from 'react';
import { motion } from 'framer-motion';
import StrokeTracer from './StrokeTracer';
import { getStrokeEntry } from '../../utils/scriptData';

const TraceCard = ({ step, onDone }) => {
  "use memo";
  const { script, item } = step;
  const compound = Array.isArray(item.compound);
  const entries = getStrokeEntry(script, item);

  return (
    <div className="flex flex-col gap-[10px] w-full h-full">
      <span className="flex-shrink-0 text-[13px] font-[700] text-layout-gray-400 text-center">따라 써 보세요</span>
      {entries.length > 0 ? (
        <StrokeTracer entries={entries} compound={compound} onDone={onDone} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-[18px] flex-1 min-h-0 rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
          <span className="text-[72px] font-[700] text-layout-black dark:text-layout-white">{item.char}</span>
          <motion.button
            type="button"
            onClick={onDone}
            className="h-[52px] px-[32px] rounded-[12px] bg-primary-main-600 text-layout-white text-[16px] font-[700]"
            whileTap={{ scale: 0.97 }}
          >
            다음
          </motion.button>
        </div>
      )}
    </div>
  );
};

export default TraceCard;
