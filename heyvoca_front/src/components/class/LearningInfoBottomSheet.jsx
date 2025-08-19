import React, { useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import { useNavigate } from 'react-router-dom';
import { useFullSheet } from '../../context/FullSheetContext';
import VocabularySheet from './VocabularySheet';

export const useLearningInfoBottomSheet = () => {
  const { pushFullSheet } = useFullSheet();
  const { pushBottomSheet, handleBack, handleReset: handleBottomSheetReset } = useBottomSheet();
  const navigate = useNavigate();
  const handleClose = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const callbacksRef = useRef({});

  // 콜백 저장 (key별)
  const handleFunction = useCallback((key, cb) => {
    callbacksRef.current[key] = cb;
  }, []);

  // 콜백 실행 (key별)
  const runCallback = useCallback((key, props) => {
    if (callbacksRef.current[key]) {
      callbacksRef.current[key](props);
    }
  }, []);

  const handleStartTest = useCallback(async (props) => {
    runCallback('onStartTest', props); 
  }, [handleBottomSheetReset, navigate, runCallback]);

  const handleCancel = (props) => {
    runCallback('onCancel', props);
  }

  const showLearningInfoBottomSheet = useCallback(({testType}) => {
    pushBottomSheet(
      <LearningInfoBottomSheet 
        onCancel={() => handleCancel({testType: testType})}
        onSet={() => handleStartTest({testType: testType})}
      />,
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [handleClose, handleStartTest, pushBottomSheet]);

  return {
    showLearningInfoBottomSheet,
    handleFunction, // (key, cb) 형태로 사용
    runCallback,    // (key) 형태로 사용
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
          <h1 className="text-[18px] font-[700]">학습 이어가기</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[30px]
        p-[20px]
      ">
        <div className="flex flex-col gap-[10px]">
          <h2 className="text-[18px] font-[700] text-center">
            이전 학습을 이어서 진행할까요?
          </h2>
          <p className="text-[14px] font-[400] text-center">
            이어 학습을 선택하면 지난번에 학습하던 내용부터<br /> 자연스럽게 이어서 학습할 수 있어요.
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
        >새로 시작</motion.button>
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