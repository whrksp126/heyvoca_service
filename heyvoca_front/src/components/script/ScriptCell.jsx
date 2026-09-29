// src/components/script/ScriptCell.jsx — 격자(밭) 한 칸. 글자 + 숙달 단계 표시.
// 단계는 서버가 단어와 똑같은 visual_stage 문자열로 내려준다(item.stage — GET
// /script/progress) — CropImage에 그대로 넘겨 학습 결과 화면(StudyResult.jsx)과 같은
// 그림 규칙을 쓴다(2026-09-30: 예전엔 level(0-5) 정수를 프론트가 따로 매핑해 두 화면의
// 작물 그림이 어긋났다). 글자는 시듦/썩음 개념이 없다(사용자 결정 2026-09-30) — health는
// 항상 건강(FRESH)으로 고정해 그림도 항상 건강한 변형만 쓴다. 탭하면 그 글자를 소리 내
// 읽어준다.
import React, { useState } from 'react';
import CropImage from '../farm/CropImage';
import { isMastered, speakScriptItem } from '../../utils/scriptData';
import { vibrate } from '../../utils/osFunction';

const ScriptCell = ({ item, script, size = 44 }) => {
  "use memo";
  const stage = item.stage;
  const mastered = isMastered(item.stage);
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
