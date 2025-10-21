import React, { useCallback } from 'react';
import { SpeakerHigh } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { getTextSound } from '../../utils/common';

// Hook 제거 - 직접 컴포넌트 사용

export const PreviewBookStoreNewBottomSheet = ({bookStoreVocabularySheet, onCancel, onSet }) => {
  const { popNewBottomSheet, clearStack } = useNewBottomSheet();
  const { addBookStoreVocabularySheet } = useVocabulary();

  const handleClose = useCallback(() => {
    popNewBottomSheet();
  }, [popNewBottomSheet]);

  const handleAdd = useCallback(async () => {
    try {
      await addBookStoreVocabularySheet(bookStoreVocabularySheet);
      clearStack();
    } catch (error) {
      console.error('단어장 추가 실패:', error);
    }
  }, [bookStoreVocabularySheet, addBookStoreVocabularySheet, clearStack]);

  const handleSet = useCallback(() => {
    if (onSet) {
      onSet();
    } else {
      handleAdd();
    }
  }, [onSet, handleAdd]);

  console.log("bookStoreVocabularySheet", bookStoreVocabularySheet)
  return (
    <div className="relative">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">단어장 미리보기?</h1>
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
            {bookStoreVocabularySheet.category && (
              <div 
                style={{
                  backgroundColor: bookStoreVocabularySheet.color.main
                }}
              className="
                py-[3px] px-[6px]
                rounded-[50px]
                text-[8px] font-[700] text-[#fff]
              "
            >
                {bookStoreVocabularySheet.category} 
              </div>
            )}
            {bookStoreVocabularySheet.name}
          </div>
          <div className="text-[12px] font-[400] text-[#111]">
            {bookStoreVocabularySheet.words.length}개의 단어
          </div>
        </div>
        <div className="flex flex-col gap-[10px] flex-1">
          {bookStoreVocabularySheet.words.map((item, word_index) => {
          return item.meanings === null || item.origin === null ? null : (
          <li
            key={item.id}
            style={{
              backgroundColor: bookStoreVocabularySheet.color.background
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
                color: bookStoreVocabularySheet.color.main
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
          onClick={onCancel || handleClose}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >취소</motion.button>
        <motion.button 
          style={{
            backgroundColor: bookStoreVocabularySheet.color.main
          }}
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={handleSet}
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

export const AddBookStoreNewBottomSheet = ({ name, onCancel, onSet }) => {
  const { popNewBottomSheet } = useNewBottomSheet();

  const handleClose = useCallback(() => {
    popNewBottomSheet();
  }, [popNewBottomSheet]);

  const handleSet = useCallback(() => {
    if (onSet) {
      onSet();
    }
  }, [onSet]);

  return (
    <div className="">
      <div className="
        flex flex-col gap-[15px] items-center justify-center 
        pt-[40px] px-[20px] pb-[10px]
      ">
        <h3 className="
          text-[18px] font-[700] text-center
          whitespace-normal
          break-words
        ">{name}을 내 단어장에 추가하시겠어요?</h3>
        <p className="text-[14px] font-[400] text-[#111]">
        추가 후에는 내 단어장에서 수정 가능해요 😉
        </p>
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
          onClick={onCancel || handleClose}
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
          onClick={handleSet}
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