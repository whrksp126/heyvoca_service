import React, { useState, useRef, useCallback } from 'react';
import { Check, Minus, Plus } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { MIN_TEST_VOCABULARY_COUNT } from '../../utils/common';
export const useTestSetupBottomSheet = () => {
  const { pushBottomSheet, handleBack } = useBottomSheet();
  const { vocabularySheets } = useVocabulary();

  const handleClose = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const handleSet = useCallback((type) => {
    console.log("handleSet", type);
  }, []);

  const showTestSetupBottomSheet = useCallback(({type, vocabularySheetId, maxVocabularyCount}) => {
    console.log("maxVocabularyCount,",maxVocabularyCount);
    pushBottomSheet(
      <TestSetupBottomSheet 
        maxVocabularyCount={maxVocabularyCount}
        onCancel={handleClose}
        onSet={handleSet}
      />,
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [handleClose]);

  return {
    showTestSetupBottomSheet
  };
};

function getProblemTypeLabel(type) {
  switch (type) {
    case 'word':
      return '단어';
    case 'meaning':
      return '의미';
    case 'cross':
      return '교차';
    case 'random':
      return '랜덤';
    default:
      return '';
  }
}

function getWordTypeLabel(type) {
  switch (type) {
    case 'all':
      return '전체';
    case 'forget':
      return '헷갈리는 단어';
    default:
      return '';
  }
}

const TestSetupBottomSheet = ({onCancel, onSet, maxVocabularyCount}) => {
  const problemCountRef = useRef(null);
  const [selectedProblemType, setSelectedProblemType] = useState('word');
  const [selectedWordType, setSelectedWordType] = useState('all');
  const [problemCount, setProblemCount] = useState(maxVocabularyCount > 12 ? 12 : maxVocabularyCount);
  const inputRefs = useRef([]);
  const handleChangeProblemCount = useCallback((count) => {
    if (count > maxVocabularyCount) return;
    if (count < MIN_TEST_VOCABULARY_COUNT) return;
    setProblemCount(count);
  }, [maxVocabularyCount]);

  const handleSetProblemCount = useCallback((count) => {
    if (count > maxVocabularyCount) return;
    if (count < MIN_TEST_VOCABULARY_COUNT) return;
    setProblemCount(count);
  }, [maxVocabularyCount]);

  return (
    <div className="">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">테스트 설정</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[30px]
        p-[20px]
      ">
        <div 
          className="
            flex justify-between flex-col gap-[8px]
          "
        >
          <h3 
            className="
              text-[14px] font-[700] text-[#111] text-center
            dark:text-[#fff]
            "
          >
            문제 유형
          </h3>
          <div className="grid grid-cols-2 gap-[10px]">
            {['word', 'meaning', 'cross', 'random'].map((type, index) => (
              <label 
                key={type}
                htmlFor={type}
                className={`
                  flex items-center justify-center gap-[5px] 
                  h-[45px]
                  px-[15px]
                  border-[1px] rounded-[8px]
                  ${selectedProblemType === type ? 'border-[#FF8DD4]' : 'border-[#ccc]'}
                `}
                onClick={() => {
                  setSelectedProblemType(type);
                  inputRefs.current[index]?.focus();
                }}
              >
                <input 
                  id={type} 
                  type="radio" 
                  name="testType" 
                  checked={selectedProblemType === type}
                  onChange={() => setSelectedProblemType(type)}
                  ref={el => inputRefs.current[index] = el}
                  hidden 
                />
                {selectedProblemType === type && <Check size={18} weight="bold" className="text-[#FF8DD4]" />}
                <span className={`text-[16px] font-[700] ${selectedProblemType === type ? 'text-[#FF8DD4]' : 'text-[#ccc]'}`}>
                  {getProblemTypeLabel(type)}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div 
          className="
            flex justify-between flex-col gap-[8px]
          "
        >
          <h3 
            className="
              text-[14px] font-[700] text-[#111] text-center
            dark:text-[#fff]
            "
          >
            단어 유형
          </h3>
          <div className="grid grid-cols-2 gap-[10px]">
            {['all', 'forget'].map((type, index) => (
              <label 
                key={type}
                htmlFor={type}
                className={`
                  flex items-center justify-center gap-[5px] 
                  h-[45px]
                  px-[15px]
                  border-[1px] rounded-[8px]
                  ${selectedWordType === type ? 'border-[#FF8DD4]' : 'border-[#ccc]'}
                `}
                onClick={() => {
                  setSelectedWordType(type);
                  inputRefs.current[index]?.focus();
                }}
              >
                <input 
                  id={type} 
                  type="radio" 
                  name="wordType" 
                  checked={selectedWordType === type}
                  onChange={() => setSelectedWordType(type)}
                  ref={el => inputRefs.current[index] = el}
                  hidden 
                />
                {selectedWordType === type && <Check size={18} weight="bold" className="text-[#FF8DD4]" />}
                <span className={`text-[16px] font-[700] ${selectedWordType === type ? 'text-[#FF8DD4]' : 'text-[#ccc]'}`}>
                  {getWordTypeLabel(type)}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div 
          className="
            flex justify-between flex-col gap-[8px] 
          "
        >
          <h3 
            className="
              text-[14px] font-[700] text-[#111] text-center
            dark:text-[#fff]
            "
          >
            문제 개수
          </h3>
          <div className="flex items-center justify-center gap-[10px]">
            <button 
              className={`
                flex items-center justify-center
                w-[40px] h-[40px]
                border-[1px] rounded-[8px]
                ${problemCount <= MIN_TEST_VOCABULARY_COUNT ? 'border-[#ccc] text-[#ccc]' : 'border-[#FF8DD4] text-[#FF8DD4]'}
              `}
              onClick={() => setProblemCount(problemCount - 1)}
              disabled={problemCount <= MIN_TEST_VOCABULARY_COUNT}
            >
              <Minus size={18} />
            </button>
            <input 
              type="number" 
              ref={problemCountRef}
              min={MIN_TEST_VOCABULARY_COUNT}
              max={maxVocabularyCount}
              className="w-[100px] h-[40px] px-[15px] border-[1px] border-[transparent] rounded-[8px] font-[700] text-[24px] text-[#FF8DD4] text-center outline-none focus:border-[#FF8DD4] transition-colors"
              onChange={e => {
                let value = Number(e.target.value);
                if (isNaN(value)) value = MIN_TEST_VOCABULARY_COUNT;
                if (value > maxVocabularyCount) value = maxVocabularyCount;
                if (value < MIN_TEST_VOCABULARY_COUNT) value = MIN_TEST_VOCABULARY_COUNT;
                setProblemCount(value);
              }}
              value={problemCount}
            />
            <button 
              className={`
                flex items-center justify-center
                w-[40px] h-[40px]
                border-[1px] rounded-[8px]
                ${problemCount >= maxVocabularyCount ? 'border-[#ccc] text-[#ccc]' : 'border-[#FF8DD4] text-[#FF8DD4]'}
              `}
              onClick={() => setProblemCount(problemCount + 1)}
              disabled={problemCount >= maxVocabularyCount}
            >
              <Plus size={18} />
            </button>
          </div>
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
        >시작</motion.button>
      </div>
    </div>
  );
}; 