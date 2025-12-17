import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNavigate } from 'react-router-dom';

export const InsufficientWordsNewBottomSheet = ({title}) => {
  "use memo";
  
  const { clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
  const { closeNewFullSheet } = useNewFullSheetActions();
  const navigate = useNavigate();

  const handleAddVocabulary = () => {
    clearNewBottomSheetStack();
    setTimeout(() => {
      closeNewFullSheet();
    }, 300);
  };

  const handleGoToBookStore = () => {
    clearNewBottomSheetStack();
    setTimeout(() => {
      closeNewFullSheet();
      setTimeout(() => {
        navigate('/book-store');
      }, 300);
    }, 300);
  };

  return (
    <div className="relative">
      <div className="
        flex flex-col gap-[10px]
        max-h-[calc(90vh-47px)] h-full
        pt-[40px] p-[20px] pb-[105px]
        overflow-y-auto
      ">
        <h3 className="text-center text-[18px] font-[700] leading-[1.5] whitespace-pre-line">
          {title}
        </h3>
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center gap-[10px]
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
          onClick={handleAddVocabulary}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >홈으로</motion.button>
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#FF8DD4]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={handleGoToBookStore}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >서점 보러가기</motion.button>
      </div>
    </div>
  );
};

