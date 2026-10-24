// src/components/script/ScriptCell.jsx — 격자(밭) 한 칸. 글자만 보여 준다.
//
// 2026-10-24 개편(이슈 #15 QA): 탭하면 그 글자 소리만 들려준다 — 예전처럼 상세 바텀시트
// (ScriptCharDetailNewBottomSheet)를 열지 않는다. 글자 학습에는 망각곡선(작물 성장 단계)
// 개념이 맞지 않아 작물·XP 는 그리지 않는다(서버 progress 의 stage·xp 는 내려오고 쓰지 않을 뿐).
// 2026-10-24 이슈 #15 2차: 대신 듀오링고 문자표처럼 칸 아래쪽에 숙련 막대(정답 수 기반
// MASTERY_STEPS 칸, utils/scriptData masteryLevel)를 그린다. 배운 글자는 옅은 초록 바탕,
// 막대를 다 채운 글자는 글자색까지 초록으로 바꿔 "완성"을 구분한다.
//
// 칸은 부모 CSS grid 의 열 너비를 그대로 채운다(w-full) — 세로 높이만 minHeight 로 고정.
import React, { useState } from 'react';
import { isStarted, speakScriptItem, masteryLevel, MASTERY_STEPS } from '../../utils/scriptData';
import { vibrate } from '../../utils/osFunction';

const ScriptCell = ({ item, script, minHeight = 52 }) => {
  "use memo";
  const learned = isStarted(item) || (item?.attempts || 0) > 0;
  const level = masteryLevel(item);
  const complete = level >= MASTERY_STEPS;
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
      aria-label={`${item.char} 발음 듣기${learned ? ` · 숙련 ${level}/${MASTERY_STEPS}` : ''}`}
      className={`
        relative flex w-full flex-col items-center justify-center gap-[5px]
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
          ${playing
            ? 'text-primary-main-600'
            : complete
              ? 'text-status-success-600 dark:text-status-success-400'
              : 'text-layout-black dark:text-layout-white'}
        `}
      >
        {item.char}
      </span>
      {learned && (
        <span className="flex w-[64%] gap-[2px]" aria-hidden="true">
          {Array.from({ length: MASTERY_STEPS }, (_, i) => (
            <span
              key={i}
              className={`
                h-[3px] flex-1 rounded-full
                ${i < level
                  ? 'bg-status-success-500'
                  : 'bg-layout-white dark:bg-layout-black'}
              `}
            />
          ))}
        </span>
      )}
    </button>
  );
};

export default ScriptCell;
