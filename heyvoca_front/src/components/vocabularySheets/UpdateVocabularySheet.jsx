import React from 'react';
import { PencilSimple, Trash, CaretLeft } from '@phosphor-icons/react';
import { useFullSheet } from '../../context/FullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { motion } from 'framer-motion';
import { useVocabularySetBottomSheet } from './VocabularyBottomSheet';

const UpdateVocabularySheet = () => {
  const { handleBack } = useFullSheet();
  const { vocabularySheets, isVocabularySheetsLoading } = useVocabulary();
  const { showVocabularySetBottomSheet, showVocabularyDeleteBottomSheet } = useVocabularySetBottomSheet();

  const getButtonVariants = (color) => ({
    tap: { 
      scale: 0.85,
      rotate: -8,
      backgroundColor: color,
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 15
      }
    }
  });

  if (isVocabularySheetsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>로딩 중...</p>
      </div>
    );
  }

  // updatedAt 기준으로 정렬된 단어장 목록
  const sortedVocabularySheets = [...vocabularySheets].sort((a, b) => 
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  const handleEditClick = (id, index) => {
    console.log("edit", id, index);
    showVocabularySetBottomSheet(id);
  };

  const handleDeleteClick = (id, index) => {
    console.log("delete", id, index);
    showVocabularyDeleteBottomSheet(id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="
        relative
        flex items-center justify-center
        h-[55px] 
        pt-[20px] px-[10px] pb-[14px]
      ">
        
        <motion.button
          onClick={handleBack}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
            p-[4px]
            rounded-[8px]
          "
          whileHover={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            scale: 1.05
          }}
          whileTap={{ 
            scale: 0.95,
            backgroundColor: 'rgba(0, 0, 0, 0.1)'
          }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 17
          }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="
          text-[18px] font-[700]
          text-[#111] dark:text-[#fff]
        ">단어장 편집</h1>
        <div
          className="
            absolute top-[18px] right-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
          "
        >
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto">
        {sortedVocabularySheets.map((item, index) => {
          return (
            <li
              key={item.id}
              style={{ backgroundColor: item.color.background }}
              className="
                flex gap-[15px] items-start
                p-[20px]
                rounded-[12px]
              "
            >
              <div 
              className="
                top
                flex flex-col
                w-full
              "
            >
              <h3 className="text-[16px] font-[700]">{item.title}</h3>
              <span className="text-[10px] font-[400] text-[#999]">{item.memorized||0}/{item.total}</span>
            </div>

            <div className="flex items-center gap-[8px]">
              <motion.button 
                className={`rounded-[20px]`}
                variants={getButtonVariants(item.color.sub)}
                whileTap="tap"
                transition={{ 
                  type: "spring", 
                  stiffness: 500, 
                  damping: 15
                }}
                onClick={() => handleEditClick(item.id, index)}
                aria-label="단어장 편집"
              >
                <PencilSimple size={18} color={item.color.main} />
              </motion.button>
              <motion.button 
                className={`rounded-[20px]`}
                variants={getButtonVariants('#ff00004d')}
                whileTap="tap"
                transition={{ 
                  type: "spring", 
                  stiffness: 500, 
                  damping: 15
                }}
                onClick={() => handleDeleteClick(item.id, index)}
                aria-label="단어장 삭제"
              >
                <Trash size={18} color="red" />
              </motion.button>
            </div>
          </li>
        )})}
      </div>
    </div>
  );
};

export default UpdateVocabularySheet; 