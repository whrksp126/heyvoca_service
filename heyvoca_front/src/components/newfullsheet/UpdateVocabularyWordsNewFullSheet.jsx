import React, { useState } from 'react';
import { PencilSimple, CaretLeft, Plus, Trash, SpeakerHigh } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { motion } from 'framer-motion';
import { useWordSetBottomSheet } from '../vocabularySheets/WordBottomSheet';
import { getTextSound } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';

const UpdateVocabularyWordsNewFullSheet = ({ id }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [isEditMode, setIsEditMode] = useState(false);
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet } = useNewFullSheetActions();
  const { isVocabularySheetsLoading, getVocabularySheet, deleteWord } = useVocabulary();
  const { showWordSetBottomSheet, showWordDeleteBottomSheet } = useWordSetBottomSheet();

  // React Compiler가 자동으로 메모이제이션 처리
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

  if (isVocabularySheetsLoading) {
    return (
      <div className="
        flex items-center justify-center h-full
        sm:max-w-[500px] sm:h-[90vh] sm:rounded-[20px] sm:overflow-hidden
        bg-white dark:bg-[#111]
      ">
        <p>로딩 중...</p>
      </div>
    );
  }

  // // updatedAt 기준으로 정렬된 단어장 목록
  // const sortedVocabularySheets = [...vocabularySheets].sort((a, b) => 
  //   new Date(b.updatedAt) - new Date(a.updatedAt)
  // );

  const handleEditClick = (word_id) => {
    console.log("vocabularySheet_id: ", vocabularySheet.id);
    console.log("word_id: ", word_id);
    showWordSetBottomSheet({ vocabularyId: vocabularySheet.id, id: word_id });
  };

  const handleDeleteClick = async (word_id) => {
    showWordDeleteBottomSheet({ vocabularyId: vocabularySheet.id, id: word_id });
  };

  const handleAddClick = () => {
    showWordSetBottomSheet({ vocabularyId: vocabularySheet.id });
  };

  return (
    <div className="
      flex flex-col h-full
      bg-white
    ">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div className="
        relative
        flex items-center justify-between
        h-[55px] 
        pt-[20px] px-[16px] pb-[14px]
      ">
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={() => {
              vibrate({ duration: 5 });
              popNewFullSheet();
            }}
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
              h-[30px] px-[12px]
              border-primary-main-600 text-primary-main-600 text-[13px] font-[700]
            "
            whileHover={{
              backgroundColor: 'rgba(255, 141, 212, 0.1)',
              scale: 1.02
            }}
            whileTap={{
              scale: 0.98,
              backgroundColor: 'rgba(255, 141, 212, 0.2)'
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 17
            }}
          >선택 삭제</motion.button>

        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-[15px] flex-1 py-[10px] px-[16px] overflow-y-auto">
        {vocabularySheet.words.map((item, index) => {
          return (
            <li
              key={item.id}
              className="
                flex gap-[10px] items-start
                p-[20px]
                rounded-[12px]
                bg-[#F5F5F5]
              "
            >

              <div
                className="
                  flex flex-col gap-[10px]
                  w-full
                "
              >
                <div className="flex flex-wrap">
                  <motion.h3
                    onClick={() => {
                      getTextSound(item.origin, "en");
                      const spans = document.querySelectorAll(`#word-${item.id} span`);
                      spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                      spans.forEach((span, index) => {
                        span.animate(
                          [
                            { color: "#111", offset: 0 },
                            { color: "#FFFFFF", offset: 0.5 },
                            { color: "#111", offset: 1 }
                          ],
                          {
                            duration: 1000,
                            delay: index * 50,
                            easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                          }
                        );
                      });
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 20
                    }}
                    className="
                      text-[16px] font-[700] text-[#111]
                      cursor-pointer relative
                      overflow-hidden
                      break-words 
                    "
                    id={`word-${item.id}`}
                  >
                    {item.origin.split('').map((char, index) => (
                      <motion.span
                        key={index}
                        initial={{ color: "#111" }}
                        className="inline-block"
                      >
                        {char}
                      </motion.span>
                    ))}
                  </motion.h3>
                </div>
                <div className="flex flex-wrap">
                  <motion.span
                    onClick={() => {
                      getTextSound(item.meanings.join(", "), "ko");
                      const spans = document.querySelectorAll(`#meaning-${item.id} span`);
                      spans.forEach(span => span.getAnimations().forEach(anim => anim.cancel()));
                      spans.forEach((span, index) => {
                        span.animate(
                          [
                            { color: "#111", offset: 0 },
                            { color: "#FFFFFF", offset: 0.5 },
                            { color: "#111", offset: 1 }
                          ],
                          {
                            duration: 1000,
                            delay: index * 50,
                            easing: "cubic-bezier(0.4, 0, 0.2, 1)"
                          }
                        );
                      });
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 20
                    }}
                    className="
                      text-[12px] font-[400] text-[#111]
                      cursor-pointer relative
                      overflow-hidden
                      break-words
                    "
                    id={`meaning-${item.id}`}
                  >
                    {item.meanings.join(", ").split('').map((char, index) => (
                      <motion.span
                        key={index}
                        initial={{ color: "#111" }}
                        className="inline-block"
                      >
                        {char}
                      </motion.span>
                    ))}
                  </motion.span>
                </div>
              </div>
              <div className="
                flex gap-[8px]
              text-primary-main-600 text-[20px]
              ">
                <motion.button
                  className="
                  rounded-[20px]
                    text-primary-main-600 text-[20px]
                  "
                  variants={buttonVariants}
                  whileTap="tap"
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 15
                  }}
                  onClick={() => handleEditClick(item.id)}
                  aria-label="단어 편집"
                >
                  <PencilSimple />
                </motion.button>
                <motion.button
                  className="
                rounded-[20px]
                  text-[red] text-[20px]
                "
                  variants={buttonVariants}
                  whileTap="tap"
                  transition={{
                    type: "spring",
                    stiffness: 500,
                    damping: 15
                  }}
                  onClick={() => handleDeleteClick(item.id)}
                  aria-label="단어 삭제"
                >
                  <Trash />
                </motion.button>
              </div>
            </li>
          )
        })}
      </div>
    </div>
  );
};

export default UpdateVocabularyWordsNewFullSheet;

