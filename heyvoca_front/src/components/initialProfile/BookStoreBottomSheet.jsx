import React, { useCallback } from 'react';
import { SpeakerHigh } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import { getTextSound } from '../../utils/common';

export const useLevelBookListBottomSheet = () => {
  const { pushBottomSheet, handleBack } = useBottomSheet();

  const handleClose = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const showVocabularySheetPreviewBottomSheet = useCallback((vocabularySheet, addVocabularySheet) => {
    pushBottomSheet(
      <PreviewBookStore 
      vocabularySheet={vocabularySheet}
        onCancel={handleClose}
        onSet={() => {
          handleClose();
          addVocabularySheet(vocabularySheet);
        }}
      />,
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: false
      }
    );
  }, [handleClose]);

  return {
    showVocabularySheetPreviewBottomSheet,
  };
};

const PreviewBookStore = ({vocabularySheet, onCancel, onSet }) => {
  return (
    <div className="relative">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">단어장 미리보기</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[10px]
        max-h-[calc(90vh-47px)] h-full
        p-[20px] pb-[105px]
        overflow-y-auto
      ">
        <div className="flex flex-col gap-[5px]">
          <div className="
            flex items-center gap-[5px]
            text-[16px] font-[700] text-[#111]
          ">
            {vocabularySheet.category && (
              <div 
                style={{
                  backgroundColor: vocabularySheet.color.main
                }}
              className="
                py-[3px] px-[6px]
                rounded-[50px]
                text-[8px] font-[700] text-[#fff]
              "
            >
                {vocabularySheet.category} 
              </div>
            )}
            {vocabularySheet.name}
          </div>
          <div className="text-[12px] font-[400] text-[#111]">
            {vocabularySheet.words.length}개의 단어
          </div>
        </div>
        <div className="flex flex-col gap-[10px] flex-1">
          {vocabularySheet.words.map((item, word_index) => {
          return item.meanings === null || item.origin === null ? null : (
          <li
            key={item.id}
            style={{
              backgroundColor: vocabularySheet.color.background
            }}
            className="
              flex gap-[10px] items-start
              p-[20px]
              rounded-[12px]
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
                    cursor-pointer
                    break-words 
                  "
                  id={`word-${item.id}`}
                >
                  {item.origin}
                </motion.h3>
              </div>
              <div className="flex flex-wrap">
                <motion.span
                  onClick={() => {
                    getTextSound(item.meanings.join(", "), "ko");
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
                    cursor-pointer
                    break-words
                  "
                  id={`meaning-${item.id}`}
                >
                  {item.meanings.join(", ")}
                </motion.span>
              </div>
              {item?.examples?.map((example, example_index) => (
              <div key={`${word_index}-${example_index}`}>
                <div className="flex flex-wrap">
                  <motion.p
                    onClick={() => {
                      getTextSound(example.origin, "en");
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
                      cursor-pointer
                      break-words
                    "
                    id={`example-${word_index}-${example_index}`}
                  >
                    {example.origin}
                  </motion.p>
                </div>
                <div className="flex flex-wrap">
                  <motion.p
                    onClick={() => {
                      getTextSound(example.meaning, "ko");
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
                      cursor-pointer
                      break-words
                    "
                    id={`example-${word_index}-${example_index}-meaning`}
                  >
                    {example.meaning}
                  </motion.p>
                </div>
              </div>
              ))}
            </div>
            <div 
              style={{
                color: vocabularySheet.color.main
              }}
              className="
                flex gap-[8px]
                text-[20px]
              ">
              <button onClick={() => getTextSound(item.origin, "en")}>
                <SpeakerHigh weight="fill" />
              </button>
            </div>
          </li>
          )})}
        </div>
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px] 
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
          onClick={onCancel}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >취소</motion.button>
        <motion.button 
          style={{
            backgroundColor: vocabularySheet.color.main
          }}
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onSet}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >추가</motion.button>
      </div>
    </div>
  );
}; 
