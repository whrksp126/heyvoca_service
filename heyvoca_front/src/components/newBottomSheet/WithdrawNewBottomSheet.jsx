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
        flex flex-col gap-[15px]
        max-h-[calc(90vh-47px)] h-full
        pt-[40px] px-[20px] pb-[105px]
        overflow-y-auto
      ">
        <h3 className="text-center text-[18px] font-[700] text-[#111] dark:text-[#fff]">
          정말 회원 탈퇴를 하시겠어요?
        </h3>
        <div className="flex flex-col gap-[8px] px-[10px]">
          <p className="text-center text-[14px] font-[400] text-[#666] dark:text-[#999] leading-[1.5]">
            탈퇴하시면 <span className="font-[700] text-[#F26A6A]">모든 사용자 기록과 데이터가 즉시 삭제</span>됩니다.
          </p>
          <p className="text-center text-[14px] font-[400] text-[#666] dark:text-[#999] leading-[1.5]">
            단어장, 학습 기록, 보석, 업적 등<br/>복구할 수 없습니다.
          </p>
        </div>
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
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
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
            bg-[#F26A6A]
            text-[#fff] text-[16px] font-[700]
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

