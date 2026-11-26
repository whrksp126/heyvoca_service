import React, { useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import SheetOptionRow from './SheetOptionRow';
import { LAB_CROPS } from '../home/labCrops';

/* 실험실 농장 — 밭 길게 누르기 메뉴: 밭 옮기기 / 작물 바꾸기 */
export const LabFieldMenuNewBottomSheet = ({ title, crop, onMove, onShape, onCrop }) => {
  "use memo";

  const { clearStack } = useNewBottomSheetActions();
  const [sub, setSub] = useState(false);

  return (
    <div className="flex flex-col px-[20px] pt-[18px] pb-[calc(20px+var(--safe-area-bottom))]">
      <h1 className="text-[16px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white truncate">
        {sub ? '어떤 작물을 키울까요?' : title}
      </h1>
      {!sub ? (
        <div className="mt-[6px]">
          <SheetOptionRow
            first
            title="밭 옮기기"
            desc="끌어서 원하는 자리에 놓아요"
            onClick={() => { clearStack(); onMove(); }}
          />
          <SheetOptionRow
            title="모양 바꾸기"
            desc="칸을 더하고 빼서 밭 모양을 만들어요"
            onClick={() => { clearStack(); onShape(); }}
          />
          <SheetOptionRow
            title="작물 바꾸기"
            desc="이 단어장에 심을 작물 종류를 골라요"
            onClick={() => setSub(true)}
          />
        </div>
      ) : (
        <div className="mt-[12px] grid grid-cols-4 gap-[8px]">
          {LAB_CROPS.map((c) => {
            const on = crop === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { clearStack(); onCrop(c.id); }}
                className={`h-[44px] rounded-[10px] text-[14px] font-[700] flex items-center justify-center gap-[3px] ${
                  on
                    ? 'bg-primary-main-100 text-primary-main-600'
                    : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white'
                }`}
              >
                {on && <Check size={12} weight="bold" />}
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LabFieldMenuNewBottomSheet;
