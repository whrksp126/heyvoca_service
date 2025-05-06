import React from 'react';
import { PencilSimple, CaretLeft, Plus } from '@phosphor-icons/react';
import { useFullSheet } from '../../context/FullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { motion } from 'framer-motion';
import { useVocabularySetBottomSheet } from './VocabularyBottomSheet';
import { useWordSetBottomSheet } from './WordBottomSheet';

const VocabularyDetail = ({ id }) => {
  const { handleBack } = useFullSheet();
  const { isLoading, getVocabularySheet } = useVocabulary();
  const { showWordSetBottomSheet } = useWordSetBottomSheet();

  const vocabularySheet = getVocabularySheet(id);

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>로딩 중...</p>
      </div>
    );
  }

  // // updatedAt 기준으로 정렬된 단어장 목록
  // const sortedVocabularySheets = [...vocabularySheets].sort((a, b) => 
  //   new Date(b.updatedAt) - new Date(a.updatedAt)
  // );

  const handleEditClick = (id) => {
    showWordSetBottomSheet({vocabularyId: vocabularySheet.id, id: id});
  };

  const handleAddClick = () => {
    showWordSetBottomSheet({vocabularyId: vocabularySheet.id});
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="
        relative
        flex items-center justify-between
        h-[55px] 
        pt-[20px] px-[16px] pb-[14px]
      ">
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={handleBack}
            className="
              text-[#CCC] dark:text-[#fff]
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
          ">
            {vocabularySheet.title}
          </h1>
        </div>
        <div
          className="
            flex items-center gap-[8px]
            text-[#CCC] dark:text-[#fff]
          "
        >
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

      {/* Content */}
      <div className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto">
        {vocabularySheet.words.map((item, index) => {
          console.log("item:", item)
          return (
            <li
              key={item.id}
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
                <h3 className="text-[16px] font-[700]">{item.origin}</h3>
                <span className="text-[10px] font-[400] text-[#999]">{item.meanings.join(", ")}</span>
              </div>
            </li>
          )
        })}




        {/* {sortedVocabularySheets.map((item, index) => {
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
              <span className="text-[10px] font-[400] text-[#999]">{item.memorized}/{item.total}</span>
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
        )})} */}
      </div>
    </div>
  );
};

export default VocabularyDetail;   