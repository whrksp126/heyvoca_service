import React from 'react';
import { Plus, PencilSimple } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useVocabularySetBottomSheet } from './VocabularyBottomSheet';
import { useFullSheet } from '../../context/FullSheetContext';
import VocabularyListView from './VocabularyListView';
import { useVocabulary } from '../../context/VocabularyContext';

const Header = () => {
  const { showVocabularySetBottomSheet } = useVocabularySetBottomSheet();
  const { push } = useFullSheet();
  const { vocabularySheets } = useVocabulary();
  
  const buttonVariants = {
    tap: { 
      scale: 0.85,
      rotate: -8,
      backgroundColor: "rgba(255, 141, 212, 0.2)",
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 15
      }
    }
  };

  const handleAddClick = () => {
    console.log('추가 버튼 클릭');
    showVocabularySetBottomSheet();
  };

  const handleEditClick = () => {
    push({
      component: <VocabularyListView list={{ vocabularyItems: vocabularySheets }} />,
      title: "단어장 편집"
    });
  };

  return (
    <div className='
      flex items-center justify-between
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-[#fff] 
      dark:bg-[#111]
    '>
      <div className="left">
        <h2
          className="
            text-[16px] font-[400] text-[#000] dark:text-[#fff]
          "
        >
          <strong className="
            text-[#FF8DD4] font-[700]
          ">헤이</strong>의 단어장
          </h2>
      </div>
      <div className="center">

      </div>
      <div className="right">
        <div className="btns flex items-center gap-[10px]">
          <motion.button 
            className="
            rounded-[20px]
              text-[#FF8DD4] text-[20px]
            "
            variants={buttonVariants}
            whileTap="tap"
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 15
            }}
            onClick={handleEditClick}
            aria-label="단어장 편집"
          >
            <PencilSimple />
          </motion.button>
          <motion.button 
            className="
            rounded-[20px]
              text-[#FF8DD4] text-[20px]
            "
            variants={buttonVariants}
            whileTap="tap"
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 15
            }}
            onClick={handleAddClick}
            aria-label="새 단어 추가"
          >
            <Plus />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default Header; 