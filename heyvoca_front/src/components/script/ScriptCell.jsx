// src/components/script/ScriptCell.jsx — 격자(밭) 한 칸. 글자 + 숙달 단계 표시.
// level 0: 빈 흙 · 1: 씨앗 · 2: 새싹 · 3-4: 이파리 · 5: 수확(당근) — CropImage 소형 재사용.

import React from 'react';
import CropImage from '../farm/CropImage';
import { levelToCropStage, isMastered } from '../../utils/scriptData';

const ScriptCell = ({ item, size = 44 }) => {
  "use memo";
  const stage = levelToCropStage(item.level);
  const mastered = isMastered(item.level);

  return (
    <div
      className={`
        relative flex flex-col items-center justify-center gap-[1px]
        rounded-[10px] shrink-0
        ${mastered
          ? 'bg-status-success-100 dark:bg-status-success-dark'
          : 'bg-layout-gray-50 dark:bg-layout-gray-dark'}
      `}
      style={{ width: size, height: size }}
    >
      {stage && (
        <div className="absolute top-[1px] right-[1px]">
          <CropImage stage={stage} health="FRESH" solo size={14} align="center" />
        </div>
      )}
      <span className="text-[16px] font-[700] text-layout-black dark:text-layout-white">
        {item.char}
      </span>
    </div>
  );
};

export default ScriptCell;
