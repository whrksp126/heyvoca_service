// src/components/script/ScriptRow.jsx — 글자 밭 그리드의 한 행(그룹).
// "이 줄 배우기" · "복습하기(N)" · "이미 알아요" 진입점을 한 곳에 묶는다.

import React from 'react';
import { Check } from '@phosphor-icons/react';
import { haptic } from '../../lib/feel';
import ScriptCell from './ScriptCell';
import { isMastered } from '../../utils/scriptData';

const ScriptRow = ({ label, items, dueItems, onLearn, onReview, onSkip }) => {
  "use memo";
  const allMastered = items.every((it) => isMastered(it.level));
  const anyStarted = items.some((it) => (it.level || 0) > 0);
  const dueCount = dueItems.length;

  return (
    <div className="flex flex-col gap-[10px] py-[14px] border-b border-[#F0F0F0] dark:border-[rgba(255,255,255,.08)]">
      <div className="flex items-center justify-between">
        <span className="text-[14.5px] font-[800] text-layout-black dark:text-layout-white">
          {label}
        </span>
        {allMastered ? (
          <span className="flex items-center gap-[4px] text-[12px] font-[700] text-status-success-600">
            <Check size={13} weight="bold" />
            완료
          </span>
        ) : (
          <div className="flex items-center gap-[8px]">
            {dueCount > 0 && (
              <button
                type="button"
                onClick={() => { haptic('light'); onReview(); }}
                className="h-[28px] px-[11px] rounded-full text-[12px] font-[700] bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600"
              >
                복습하기 {dueCount}
              </button>
            )}
            <button
              type="button"
              onClick={() => { haptic('light'); onLearn(); }}
              className="h-[28px] px-[11px] rounded-full text-[12px] font-[700] bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-500 dark:text-layout-gray-200"
            >
              {anyStarted ? '이어서 배우기' : '이 줄 배우기'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-[6px]">
        {items.map((it) => (
          <ScriptCell key={it.char} item={it} />
        ))}
      </div>

      {!allMastered && (
        <button
          type="button"
          onClick={() => { haptic('light'); onSkip(); }}
          className="self-start text-[11.5px] font-[600] text-layout-gray-300 underline underline-offset-2"
        >
          이미 알아요
        </button>
      )}
    </div>
  );
};

export default ScriptRow;
