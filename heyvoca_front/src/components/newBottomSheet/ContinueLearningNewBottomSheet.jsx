import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction'; 
// Hook 제거 - 직접 컴포넌트 사용


export const ContinueLearningNewBottomSheet = ({onCancel, onSet}) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewBottomSheet } = useNewBottomSheetActions();

  // React Compiler가 자동으로 useCallback 처리
  const handleClose = () => {
    popNewBottomSheet();
  };

  const handleSet = () => {
    if (onSet) {
      onSet();
    } else {
      console.log("이어학습 클릭함");
    }
  };

  return (
    <div className="">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">최근 학습</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[30px]
        p-[20px]
      ">

      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
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
            onCancel || handleClose();
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
            bg-[#FF8DD4]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleSet();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >이어하기</motion.button>
      </div>
    </div>
  );
}; 