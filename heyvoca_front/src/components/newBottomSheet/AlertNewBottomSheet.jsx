import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';

// title(제목) 아래 subTitle(설명)을 선택적으로 더 받는다 — ConfirmNewBottomSheet와 같은
// 규격(18px/700 제목 · 13px 옅은 회색 설명)이라 두 시트가 같은 말투로 읽힌다. subTitle이
// 없는 기존 호출부(InitialProfile 등)는 그대로 title 한 줄만 나온다.
export const AlertNewBottomSheet = ({ title, subTitle, btns }) => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheetActions();

  const handleConfirm = () => {
    resolveNewBottomSheet(true);
  };

  return (
    <div className="relative">

      <div className="
        flex flex-col gap-[10px]
        max-h-[calc(90vh-47px)]
        pt-[40px] p-[20px] pb-[105px]
        overflow-y-auto
      ">
        <h3 className="text-center text-[18px] font-[700] text-layout-black dark:text-layout-white whitespace-pre-line">
          {title}
        </h3>
        {subTitle && (
          <p className="text-center text-[13px] text-layout-gray-400 dark:text-layout-gray-200">
            {subTitle}
          </p>
        )}
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-center
        p-[20px]
      ">
        <motion.button
          className="
            w-full
            h-[52px]
            rounded-[12px]
            bg-primary-main-600
            text-layout-white text-[16px] font-[700] tracking-[-0.03em]
          "
          onClick={handleConfirm}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >{btns?.confirm || "확인"}</motion.button>
      </div>
    </div>
  );
};

