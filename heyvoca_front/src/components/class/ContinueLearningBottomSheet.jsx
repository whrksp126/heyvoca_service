import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';

export const useContinueLearningBottomSheet = () => {
  const { pushBottomSheet, handleBack, handleReset: handleBottomSheetReset } = useBottomSheet();
  const navigate = useNavigate();
  const handleClose = useCallback(() => {
    handleBack();
  }, [handleBack]);


  const showContinueLearningBottomSheet = useCallback(() => {
    pushBottomSheet(
      <ContinueLearningBottomSheet 
        onCancel={handleClose}
        onSet={() => {
          console.log("이어학습 클릭함")
        }}
      />,

      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [handleClose]);

  return {
    showContinueLearningBottomSheet
  };
};


const ContinueLearningBottomSheet = ({onCancel, onSet}) => {
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
          onClick={onCancel}
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
          onClick={() => onSet()}
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