// src/components/script/ScriptCell.jsx — 격자(밭) 한 칸. 글자만 보여 준다.
//
// 2026-10-24 개편(이슈 #15 QA): 탭하면 그 글자 소리만 들려준다 — 예전처럼 상세 바텀시트
// (ScriptCharDetailNewBottomSheet)를 열지 않는다. 글자 학습에는 망각곡선(작물 성장 단계)
// 개념이 맞지 않아 칸 아래 작물·XP 막대도 그리지 않는다(서버 progress 의 stage·xp 는 그대로
// 내려오고 쓰지 않을 뿐이다). 배운 글자만 옅은 초록 바탕으로 구분한다.
//
// 칸은 부모 CSS grid 의 열 너비를 그대로 채운다(w-full) — 세로 높이만 minHeight 로 고정.
import React, { useState } from 'react';
import { isStarted, speakScriptItem } from '../../utils/scriptData';
import { vibrate } from '../../utils/osFunction';

const ScriptCell = ({ item, script, minHeight = 52 }) => {
  "use memo";
  const learned = isStarted(item);
  const [playing, setPlaying] = useState(false);

  const handleTap = (e) => {
    e.stopPropagation();
    vibrate({ duration: 5 });
    if (playing) return;
    setPlaying(true);
    speakScriptItem(script, item).finally(() => setPlaying(false));
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label={`${item.char} 발음 듣기`}
      className={`
        relative flex w-full items-center justify-center
        rounded-[10px]
        transition-transform active:scale-90
        ${learned
          ? 'bg-status-success-100 dark:bg-status-success-dark'
          : 'bg-layout-gray-50 dark:bg-layout-gray-dark'}
      `}
      style={{ minHeight }}
    >
      <span
        className={`
          text-[18px] font-[700] leading-none
          ${playing ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}
        `}
      >
        {item.char}
      </span>
    </button>
  );
};

export default ScriptCell;
