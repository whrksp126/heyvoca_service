import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

export const ConfirmNewBottomSheet = ({ title, btns }) => {
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
        max-h-[calc(90vh-47px)] h-full
        pt-[40px] p-[20px] pb-[105px]
        overflow-y-auto
      ">
        <h3 className="text-center text-[18px] font-[700] text-layout-black dark:text-layout-white">
          {title}
        </h3>
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] 
        p-[20px]
      ">
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-layout-gray-200
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
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
            h-[45px]
            rounded-[8px]
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700]
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