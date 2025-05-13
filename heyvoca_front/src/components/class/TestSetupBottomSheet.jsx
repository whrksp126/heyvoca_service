import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, Plus } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import { useFullSheet } from '../../context/FullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { MIN_TEST_VOCABULARY_COUNT } from '../../utils/common';

export const useTestSetupBottomSheet = () => {
  const { pushBottomSheet, handleBack, handleReset: handleBottomSheetReset } = useBottomSheet();
  const { handleReset: handleFullSheetReset } = useFullSheet();
  const navigate = useNavigate();
  const { vocabularySheets } = useVocabulary();
  const [questionType, setQuestionType] = useState('multipleChoice');
  const [vocabularySheetId, setVocabularySheetId] = useState(null);
  const handleClose = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const handleStartTest = useCallback((data) => {
    handleBottomSheetReset();
    handleFullSheetReset();
    navigate('/take-test', { state: { data } });
  }, [questionType, vocabularySheetId, handleBack, navigate]);

  const showTestSetupBottomSheet = useCallback(({questionType, vocabularySheetId, maxVocabularyCount}) => {
    setQuestionType(questionType);
    setVocabularySheetId(vocabularySheetId);
    pushBottomSheet(
      <TestSetupBottomSheet 
        maxVocabularyCount={maxVocabularyCount}
        onCancel={handleClose}
        onSet={(data) => handleStartTest({
          ...data,
          questionType,
          vocabularySheetId 
        })}
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


function getInitialViewTypeLabel(type) {
  switch (type) {
    case 'origin':
      return '단어';
    case 'meanings':
      return '의미';
    case 'cross':
      return '교차';
    case 'random':
      return '랜덤';
    default:
      return '';
  }
}

function getOriginFilterTypeLabel(type) {
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
  const [initialViewType, setInitialViewType] = useState('origin');
  const [originFilterType, setOriginFilterType] = useState('all');
  const [count, setCount] = useState(maxVocabularyCount > 12 ? 12 : maxVocabularyCount);
  const inputRefs = useRef({
    initialViewType: [],
    originFilterType: [],
    count: []
  });

  const setCountFun = useCallback((value) => {
    if(value < MIN_TEST_VOCABULARY_COUNT){
      inputRefs.current['count'].value = MIN_TEST_VOCABULARY_COUNT;
      setCount(MIN_TEST_VOCABULARY_COUNT);
    }else if(value > maxVocabularyCount){
      inputRefs.current['count'].value = maxVocabularyCount;
      setCount(maxVocabularyCount);
    }else{
      inputRefs.current['count'].value = value;
      setCount(value);
    }
  }, [maxVocabularyCount]);

  const getTestSetupData = useCallback(() => {
    return {
      initialViewType: initialViewType,
      originFilterType: originFilterType,
      count: count
    }
  }, [initialViewType, originFilterType, count]);
  
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
            {['origin', 'meanings', 'cross', 'random'].map((type, index) => (
              <label 
                key={type}
                htmlFor={type}
                className={`
                  flex items-center justify-center gap-[5px] 
                  h-[45px]
                  px-[15px]
                  border-[1px] rounded-[8px]
                  ${initialViewType === type ? 'border-[#FF8DD4]' : 'border-[#ccc]'}
                `}
                onClick={() => {
                  inputRefs.current[`initialViewType`][index]?.focus();
                }}
              >
                <input 
                  id={type} 
                  type="radio" 
                  name="initialViewType" 
                  checked={initialViewType === type}
                  onChange={() => setInitialViewType(type)}
                  ref={el => inputRefs.current[`initialViewType`][index] = el}
                  hidden 
                />
                {initialViewType === type && <Check size={18} weight="bold" className="text-[#FF8DD4]" />}
                <span className={`text-[16px] font-[700] ${initialViewType === type ? 'text-[#FF8DD4]' : 'text-[#ccc]'}`}>
                  {getInitialViewTypeLabel(type)}
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
                  ${originFilterType === type ? 'border-[#FF8DD4]' : 'border-[#ccc]'}
                `}
                onClick={() => inputRefs.current[`originFilterType`][index]?.focus()}
              >
                <input 
                  id={type} 
                  type="radio" 
                  name="originFilterType" 
                  checked={originFilterType === type}
                  onChange={() => setOriginFilterType(type)}
                  ref={el => inputRefs.current[`originFilterType`][index] = el}
                  hidden 
                />
                {originFilterType === type && <Check size={18} weight="bold" className="text-[#FF8DD4]" />}
                <span className={`text-[16px] font-[700] ${originFilterType === type ? 'text-[#FF8DD4]' : 'text-[#ccc]'}`}>
                  {getOriginFilterTypeLabel(type)}
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
                ${count <= MIN_TEST_VOCABULARY_COUNT ? 'border-[#ccc] text-[#ccc]' : 'border-[#FF8DD4] text-[#FF8DD4]'}
              `}
              onClick={() => setCountFun(count - 1)}
              disabled={count <= MIN_TEST_VOCABULARY_COUNT}
            >
              <Minus size={18} />
            </button>
            <input 
              type="number" 
              ref={el => inputRefs.current['count'] = el}
              min={MIN_TEST_VOCABULARY_COUNT}
              max={maxVocabularyCount}
              className="w-[100px] h-[40px] px-[15px] border-[1px] border-[transparent] rounded-[8px] font-[700] text-[24px] text-[#FF8DD4] text-center outline-none focus:border-[#FF8DD4] transition-colors"
              onChange={e => setCountFun(Number(e.target.value))}
              value={count}
            />
            <button 
              className={`
                flex items-center justify-center
                w-[40px] h-[40px]
                border-[1px] rounded-[8px]
                ${count >= maxVocabularyCount ? 'border-[#ccc] text-[#ccc]' : 'border-[#FF8DD4] text-[#FF8DD4]'}
              `}
              onClick={() => setCountFun(count + 1)}
              disabled={count >= maxVocabularyCount}
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
          onClick={() => onSet(getTestSetupData())}
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