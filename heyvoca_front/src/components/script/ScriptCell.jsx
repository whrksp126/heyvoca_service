// src/components/script/ScriptCell.jsx — 격자(밭) 한 칸. 글자 + 숙달 단계 표시.
// 단계는 서버가 단어와 똑같은 visual_stage 문자열로 내려준다(item.stage — GET
// /script/progress) — CropImage에 그대로 넘겨 학습 결과 화면(StudyResult.jsx)과 같은
// 그림 규칙을 쓴다(2026-09-30: 예전엔 level(0-5) 정수를 프론트가 따로 매핑해 두 화면의
// 작물 그림이 어긋났다). 글자는 시듦/썩음 개념이 없다(사용자 결정 2026-09-30) — health는
// 항상 건강(FRESH)으로 고정해 그림도 항상 건강한 변형만 쓴다.
//
// 탭하면 그 글자를 소리 내 읽어주고(예전과 동일), 동시에 그 글자의 상세 바텀시트
// (ScriptCharDetailNewBottomSheet)를 연다 — 듀오링고 문자 탭처럼 칸 하나하나가 곧 학습
// 진입점이다(2026-09-30 개편, "이 줄 배우기"·"이미 알아요" 폐지). 실제 학습/연습 세션
// 시작은 상위(components/script/ScriptFieldBody.jsx)의 startSession을 그대로 받아 쓴다.
//
// 2026-09-30 재개편(이어진 격자): 칸이 더 이상 고정 픽셀 크기가 아니라 부모 CSS grid의
// 열 너비를 그대로 채운다(w-full) — 화면 폭에 맞게 균등 분할되도록. 세로 높이만
// minHeight로 고정해 예전 44px보다 작아지지 않게 한다.
import React, { useState } from 'react';
import CropImage from '../farm/CropImage';
import { isMastered, speakScriptItem } from '../../utils/scriptData';
import { xpBarPct } from '../../utils/cropXp';
import { vibrate } from '../../utils/osFunction';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import ScriptCharDetailNewBottomSheet from '../newBottomSheet/ScriptCharDetailNewBottomSheet';

const ScriptCell = ({ item, script, onStart, minHeight = 64 }) => {
  "use memo";
  const stage = item.stage;
  const mastered = isMastered(item.stage);
  const [playing, setPlaying] = useState(false);
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  const handleTap = (e) => {
    e.stopPropagation();
    vibrate({ duration: 5 });
    if (!playing) {
      setPlaying(true);
      speakScriptItem(script, item).finally(() => setPlaying(false));
    }
    pushNewBottomSheet(ScriptCharDetailNewBottomSheet, { script, item, onStart });
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label={`${item.char} 발음 듣기 · 상세 보기`}
      className={`
        relative flex flex-col w-full items-center justify-center gap-[1px]
        rounded-[10px]
        transition-transform active:scale-90
        ${mastered
          ? 'bg-status-success-100 dark:bg-status-success-dark'
          : 'bg-layout-gray-50 dark:bg-layout-gray-dark'}
      `}
      style={{ minHeight }}
    >
      <span
        className={`
          text-[16px] font-[700] leading-none
          ${playing ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}
        `}
      >
        {item.char}
      </span>
      {/* 학습 카드 하단 농장 상태 바의 축소판 — 왼쪽 작물, 옆에 단계 내 XP 막대 */}
      {stage && (
        <div className="flex items-center gap-[3px] w-full px-[6px] mt-[6px]">
          <span className="shrink-0 inline-flex">
            <CropImage stage={stage} health="FRESH" solo size={12} align="center" />
          </span>
          <span className="flex-1 h-[4px] rounded-full overflow-hidden bg-layout-gray-200 dark:bg-[#3A3A3A]">
            <span
              className="block h-full rounded-full bg-primary-main-600"
              style={{ width: `${xpBarPct(stage, item.xp)}%` }}
            />
          </span>
        </div>
      )}
    </button>
  );
};

export default ScriptCell;
