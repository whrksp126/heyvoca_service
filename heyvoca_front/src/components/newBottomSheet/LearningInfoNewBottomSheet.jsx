import React, { useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNavigate } from 'react-router-dom';
import { vibrate } from '../../utils/osFunction';

// import { useFullSheet } from '../../context/FullSheetContext';
// import VocabularySheet from './VocabularySheet';

// Hook 제거 - 직접 컴포넌트 사용



export const LearningInfoNewBottomSheet = ({ onCancel, onSet, testType }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewBottomSheet } = useNewBottomSheetActions();

  // React Compiler가 자동으로 useCallback 처리
  const handleClose = () => {
    popNewBottomSheet();
  };

  const handleSet = () => {
    if (onSet) {
      onSet({ testType });
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
          <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">학습 이어가기</h1>
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
            bg-layout-gray-200
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={() => {
            onCancel ? onCancel() : handleClose();
          }}
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
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700]
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
        >이어학습</motion.button>
      </div>
    </div>
  );
}; 