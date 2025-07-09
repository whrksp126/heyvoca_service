import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import { useNavigate } from 'react-router-dom';

export const useLearningInfoBottomSheet = () => {
  const { pushBottomSheet, handleBack, handleReset: handleBottomSheetReset } = useBottomSheet();
  const navigate = useNavigate();
  const handleClose = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const handleStartTest = useCallback(async () => {
    handleBottomSheetReset();
    navigate('/take-test');
  }, []);

  const showLearningInfoBottomSheet = useCallback(() => {
    pushBottomSheet(
      <LearningInfoBottomSheet 
        onCancel={handleClose}
        onSet={() => handleStartTest()}
      />,
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [handleClose, handleStartTest, pushBottomSheet]);

  return {
    showLearningInfoBottomSheet
  };
};



const LearningInfoBottomSheet = ({onCancel, onSet}) => {
  
  return (
    <div className="">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">이어 학습</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[30px]
        p-[20px]
      ">
        <div className="flex flex-col gap-[10px]">
          <h2 className="text-[18px] font-[700] text-center">
            기존 학습을 이어서 학습하시겠습니까?
          </h2>
          <p className="text-[14px] font-[400] text-center">
            이어 학습을 진행하면 이전 학습 내용을 기반으로<br /> 학습을 이어서 진행합니다.
          </p>
        </div>
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
        >이어학습</motion.button>
      </div>
    </div>
  );
}; 