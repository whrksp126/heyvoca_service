// src/components/newBottomSheet/RescueConfirmNewBottomSheet.jsx
//
// 홈 '오늘 할 일' — 썩은 단어 살리기 확인 시트(이슈 #15). 예전에는 '살리기'를 누르는 즉시
// 회복제가 쓰였다. 쓰기 전에 필요한 아이템과 보유량을 한 번 보여 주고, 시트 안 버튼으로 실행한다.
// resolve 값: true = 살리기(회복제가 충분할 때) · 'pick' = 보관소에서 고르기(모자랄 때) · false = 닫기
import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import { CROP_ASSETS } from '../farm/CropImage';

export const RescueConfirmNewBottomSheet = ({ count = 0, nutrientCnt = 0 }) => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheetActions();
  const enough = count > 0 && nutrientCnt >= count;

  const close = (value) => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet(value);
  };

  return (
    <div className="relative">
      <div className="flex flex-col items-center gap-[10px] px-[20px] pt-[32px] pb-[105px]">
        <img src={CROP_ASSETS.nutrient} alt="" draggable={false} className="h-[64px] w-[64px] select-none object-contain" />
        <h3 className="text-center text-[18px] font-[700] text-layout-black dark:text-layout-white">
          {enough ? '영양 회복제로 살리시겠어요?' : '영양 회복제가 모자라요'}
        </h3>
        <div className="flex items-center gap-[6px] text-[13px] font-[600] text-layout-gray-400 dark:text-layout-gray-200">
          <span>필요 <b className="font-[800] tabular-nums text-primary-main-600">{count}</b>개</span>
          <span className="h-[10px] w-px bg-layout-gray-200 dark:bg-layout-gray-500" />
          <span>보유 <b className="font-[800] tabular-nums text-layout-black dark:text-layout-white">{nutrientCnt}</b>개</span>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-[15px] p-[20px]">
        <motion.button
          type="button"
          className="h-[52px] flex-1 rounded-[12px] border-[2px] border-border bg-layout-white text-[16px] font-[700] tracking-[-0.03em] text-layout-gray-400 dark:border-border-dark dark:bg-layout-black dark:text-layout-gray-100"
          onClick={() => close(false)}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          취소
        </motion.button>
        <motion.button
          type="button"
          className="h-[52px] flex-1 rounded-[12px] bg-primary-main-600 text-[16px] font-[700] tracking-[-0.03em] text-layout-white dark:text-layout-black"
          onClick={() => close(enough ? true : 'pick')}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          {enough ? '살리기' : '골라서 살리기'}
        </motion.button>
      </div>
    </div>
  );
};

export default RescueConfirmNewBottomSheet;
