import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
export const WithdrawNewBottomSheet = () => {
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
        flex flex-col gap-[12px]
        pt-[40px] px-[20px] pb-[100px]
      ">
        <h3 className="text-center text-[18px] font-[700] text-layout-black dark:text-layout-white">
          정말 탈퇴하시겠어요?
        </h3>
        <p className="text-center text-[14px] font-[400] text-layout-gray-400 dark:text-layout-gray-300 leading-[1.5]">
          모든 기록과 데이터가 <span className="font-[700] text-status-error-600">즉시 삭제되며 복구할 수 없어요.</span>
        </p>
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
        >취소</motion.button>
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-status-error-500
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={handleConfirm}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >탈퇴하기</motion.button>
      </div>
    </div>
  );
};

