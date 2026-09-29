// src/components/script/ScriptCell.jsx — 격자(밭) 한 칸. 글자 + 숙달 단계 표시.
// level 0: 빈 흙 · 1: 씨앗 · 2: 새싹 · 3-4: 이파리 · 5: 수확(당근) — CropImage 소형 재사용.
// 탭하면 그 글자를 소리 내 읽어준다(세션 IntroCard·ChoiceCard와 같은 speakScriptItem 규칙).

import React, { useState } from 'react';
import CropImage from '../farm/CropImage';
import { levelToCropStage, isMastered, speakScriptItem } from '../../utils/scriptData';
import { vibrate } from '../../utils/osFunction';

const ScriptCell = ({ item, script, size = 44 }) => {
  "use memo";
  const stage = levelToCropStage(item.level);
  const mastered = isMastered(item.level);
  const [playing, setPlaying] = useState(false);

  const handleTap = async (e) => {
    e.stopPropagation();
    if (playing) return;
    vibrate({ duration: 5 });
    setPlaying(true);
    try {
      await speakScriptItem(script, item);
    } finally {
      setPlaying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label={`${item.char} 발음 듣기`}
      className={`
        relative flex flex-col items-center justify-center gap-[1px]
        rounded-[10px] shrink-0
        transition-transform active:scale-90
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
      <span
        className={`
          text-[16px] font-[700]
          ${playing ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}
        `}
      >
        {item.char}
      </span>
    </button>
  );
};

export default ScriptCell;
