// src/components/script/TraceCard.jsx — StrokeTracer를 세션 스텝 모양에 맞춰 감싼다.
// 알파벳은 첫 버전에서 대문자 획만 따라 쓴다(소문자는 향후 확장 — 보고 참고).

import React from 'react';
import StrokeTracer from './StrokeTracer';
import { getStrokeEntry } from '../../utils/scriptData';

const TraceCard = ({ step, onDone }) => {
  "use memo";
  const { script, item } = step;
  const compound = Array.isArray(item.compound);
  const entries = getStrokeEntry(script, item);

  return (
    <div className="flex flex-col items-center gap-[12px] w-full pt-[4px]">
      <span className="text-[13px] font-[700] text-layout-gray-400">따라 써 보세요</span>
      {entries.length > 0 ? (
        <StrokeTracer entries={entries} compound={compound} onDone={onDone} />
      ) : (
        <div className="flex flex-col items-center gap-[14px] py-[40px]">
          <span className="text-[64px] font-[700] text-layout-black dark:text-layout-white">{item.char}</span>
          <button
            type="button"
            onClick={onDone}
            className="h-[36px] px-[18px] rounded-full bg-primary-main-600 text-layout-white text-[13px] font-[700]"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
};

export default TraceCard;
