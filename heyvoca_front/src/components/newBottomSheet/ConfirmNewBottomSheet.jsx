import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

export const ConfirmNewBottomSheet = ({ title, subTitle, btns }) => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheetActions();

  const handleClose = () => {
    resolveNewBottomSheet(false);
  };

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
          <p className="text-center text-[13px] text-layout-gray-400 dark:text-layout-gray-500">
            {subTitle}
          </p>
        )}
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] 
        p-[20px]
      ">
        <motion.button
          className="
            flex-1
            h-[52px]
            rounded-[12px]
            text-[16px] font-[700] tracking-[-0.03em]
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
          onClick={() => {
            vibrate({ duration: 5 });
            handleClose();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >{btns?.cancel || "취소"}</motion.button>
        <motion.button
          className="
            flex-1
            h-[52px]
            rounded-[12px]
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700] tracking-[-0.03em]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleConfirm();
          }}
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