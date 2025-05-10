import React, { useCallback, useRef, useState } from 'react';
import { Check, SpeakerHigh } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { getTextSound } from '../../utils/common';

export const useBookStoreBottomSheet = () => {
  const { pushBottomSheet, handleBack } = useBottomSheet();
  const { getBookStoreVocabularySheet, bookStore } = useVocabulary();
  const [bookStoreVocabularySheetId, setBookStoreVocabularySheetId] = useState(null);

  const handleClose = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const handleAdd = useCallback(async () => {
    try {
      // handleClose();
    } catch (error) {
      console.error('단어장 추가 실패:', error);
    }
  }, [handleClose]);

  const showBookStoreAddBottomSheet = useCallback(() => {
    console.log("bookStoreVocabularySheetId", bookStoreVocabularySheetId)
  
    const bookStoreVocabularySheet = getBookStoreVocabularySheet(bookStoreVocabularySheetId);
    pushBottomSheet(
      <AddBookStore name={bookStoreVocabularySheet.name} onCancel={handleClose} onSet={handleAdd} />,
      { isBackdropClickClosable: false, isDragToCloseEnabled: true }
    );
  }, [bookStore, bookStoreVocabularySheetId, pushBottomSheet, handleClose]);

  const showBookStorePreviewBottomSheet = useCallback((BookStoreVocabularySheetId) => {
    console.log("BookStoreVocabularySheetId", BookStoreVocabularySheetId)
    setBookStoreVocabularySheetId(BookStoreVocabularySheetId);
    const bookStoreVocabularySheet = getBookStoreVocabularySheet(BookStoreVocabularySheetId);
    pushBottomSheet(
      <PreviewBookStore 
        bookStoreVocabularySheet={bookStoreVocabularySheet}
        onCancel={handleClose}
        onSet={showBookStoreAddBottomSheet}
      />,
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: false
      }
    );
  }, [handleClose, showBookStoreAddBottomSheet, bookStore]);

  return {
    showBookStorePreviewBottomSheet,
    showBookStoreAddBottomSheet,
  };
};

const PreviewBookStore = ({bookStoreVocabularySheet, onCancel, onSet }) => {
  console.log("bookStoreVocabularySheet", bookStoreVocabularySheet)
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
            {bookStoreVocabularySheet.name}
          </div>
          <div className="text-[12px] font-[400] text-[#111]">
            {bookStoreVocabularySheet.words.length}개의 단어
          </div>
        </div>
        <div className="flex flex-col gap-[10px] flex-1">
          {bookStoreVocabularySheet.words.map((item, word_index) => {return (
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
                    const scanElement = document.querySelector(`#scan-${item.id}`);
                    const textLength = item.origin.length;
                    const duration = Math.max(1000, Math.min(3000, textLength * 50)); // Adjust duration based on text length
                    scanElement.animate(
                      [
                        { left: '-100%' },
                        { left: '100%' }
                      ],
                      {
                        duration: duration,
                        easing: "linear"
                      }
                    );
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
                  {item.origin}
                  <span
                    id={`scan-${item.id}`}
                    className="
                      absolute top-[5%] bottom-[5%] left-[-100%] w-full
                      bg-gradient-to-r from-transparent via-white to-transparent
                      pointer-events-none
                    "
                  />
                </motion.h3>
              </div>
              <div className="flex flex-wrap">
                <motion.span
                  onClick={() => {
                    getTextSound(item.meanings.join(", "), "ko");
                    const scanElement = document.querySelector(`#meaning-scan-${item.id}`);
                    const textLength = item.meanings.join(", ").length;
                    const duration = Math.max(1000, Math.min(3000, textLength * 50)); // Adjust duration based on text length
                    scanElement.animate(
                      [
                        { left: '-100%' },
                        { left: '100%' }
                      ],
                      {
                        duration: duration,
                        easing: "linear"
                      }
                    );
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
                  {item.meanings.join(", ")}
                  <span
                    id={`meaning-scan-${item.id}`}
                    className="
                      absolute top-[5%] bottom-[5%] left-[-100%] w-full
                      bg-gradient-to-r from-transparent via-white to-transparent
                      pointer-events-none
                    "
                  />
                </motion.span>
              </div>
              {item?.examples?.map((example, example_index) => (
              <div key={`${word_index}-${example_index}`}>
                <div className="flex flex-wrap">
                  <motion.p
                    onClick={() => {
                      getTextSound(example.origin, "en");
                      const scanElement = document.querySelector(`#example-scan-${word_index}-${example_index}`);
                      const textLength = example.origin.length;
                      const duration = Math.max(1000, Math.min(3000, textLength * 50)); // Adjust duration based on text length
                      scanElement.animate(
                        [
                          { left: '-100%' },
                          { left: '100%' }
                        ],
                        {
                          duration: duration,
                          easing: "linear"
                        }
                      );
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
                    id={`example-${word_index}-${example_index}`}
                  >
                    {example.origin.split(' ').map((word, wordIndex) => (
                      <span key={wordIndex} style={{ 
                        fontWeight: word.toLowerCase() === item.origin.toLowerCase() ? '700' : '400'
                      }}>
                        {word}{' '}
                      </span>
                    ))}
                    <span
                      id={`example-scan-${word_index}-${example_index}`}
                      className="
                        absolute top-[5%] bottom-[5%] left-[-100%] w-full
                        bg-gradient-to-r from-transparent via-white to-transparent
                        pointer-events-none
                      "
                    />
                  </motion.p>
                </div>
                <div className="flex flex-wrap">
                  <motion.p
                    onClick={() => {
                      getTextSound(example.meaning, "ko");
                      const scanElement = document.querySelector(`#example-meaning-scan-${word_index}-${example_index}`);
                      const textLength = example.meaning.length;
                      const duration = Math.max(1000, Math.min(3000, textLength * 50)); // Adjust duration based on text length
                      scanElement.animate(
                        [
                          { left: '-100%' },
                          { left: '100%' }
                        ],
                        {
                          duration: duration,
                          easing: "linear"
                        }
                      );
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
                    id={`example-${word_index}-${example_index}-meaning`}
                  >
                    {example.meaning}
                    <span
                      id={`example-meaning-scan-${word_index}-${example_index}`}
                      className="
                        absolute top-[5%] bottom-[5%] left-[-100%] w-full
                        bg-gradient-to-r from-transparent via-white to-transparent
                        pointer-events-none
                      "
                    />
                  </motion.p>
                </div>
              </div>
              ))}
            </div>
            <div className="
              flex gap-[8px]
            text-[#FF8DD4] text-[20px]
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
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#FF8DD4]
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

const AddBookStore = ({ name, onCancel, onSet }) => {
  

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
        ">
          '{name}'을 내 단어장에 추가하시겠어요?
        </h3>
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
          onClick={onSet}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >삭제</motion.button>
      </div>
    </div>
  );
};