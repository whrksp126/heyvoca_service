import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, Plus } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { MIN_TEST_VOCABULARY_COUNT } from '../../utils/common';
import { AlertNewBottomSheet } from './AlertNewBottomSheet';

// Hook 제거 - 직접 컴포넌트 사용



function getQuestionTypeLabel(type) {
  switch (type) {
    case 'multipleChoice':
      return '사지 선다';
    case 'fillInTheBlank':
      return '빈칸 채우기';
    case 'trueOrFalse':
      return 'OX';
    case 'matchingPairs':
      return '매칭 페어';
    case 'typing':
      return '타이핑';
    case 'audioChoice':
      return '오디오 선다';
    case 'ordering':
      return '순서 맞추기';
    case 'dragAndDrop':
      return '드래그 앤 드랍';
    default:
      return '';
  }
}

function getMemoryStateLabel(type) {
  switch (type) {
    case 'all':
      return '전체';
    case 'unlearned':
      return '미학습';
    case 'shortTerm':
      return '단기 암기';
    case 'mediumTerm':
      return '중기 암기';
    case 'longTerm':
      return '장기 암기';
    default:
      return '';
  }
}

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

// SM-2 알고리즘 기준 학습 상태 정의
const MEMORY_STATES = {
  ALL: 'all',                  // 전체 (모든 암기 상태)
  UNLEARNED: 'unlearned',      // 미학습 (repetition: 0, ef: 2.5)
  SHORT_TERM: 'shortTerm',     // 단기 복습 (repetition: 1-2, interval: 1-6일)
  MEDIUM_TERM: 'mediumTerm',   // 중기 복습 (repetition: 3-4, interval: 7-30일)
  LONG_TERM: 'longTerm'        // 장기 복습 (repetition: 5+, interval: 30일+)
};

// 단어의 암기 상태를 판단하는 함수 (암기율 계산 방식 사용 - VocabularySheetNewFullSheet와 동일)
function getWordMemoryState(word) {
  // memoryState 객체가 있는 경우
  const repetition = word.memoryState?.repetition ?? word.repetition ?? 0;
  const interval = word.memoryState?.interval ?? word.interval ?? 0;
  
  // 미학습: repetition === 0 && interval === 0 (한 번도 학습하지 않은 단어만)
  if (repetition === 0 && interval === 0) return MEMORY_STATES.UNLEARNED;
  
  // 암기율 계산 (MemorizationStatus와 동일한 로직)
  const ef = word.memoryState?.ef ?? word.ef ?? 2.5;
  let score = 0;
  score += repetition * 15;
  score += interval * 2;
  score += (ef - 1.3) * 20;
  const percent = Math.max(0, Math.min(100, Math.round(score)));
  
  // 퍼센트에 따라 분류
  if (percent < 30) {
    return MEMORY_STATES.SHORT_TERM;  // 단기 암기 (0-29%)
  } else if (percent < 70) {
    return MEMORY_STATES.MEDIUM_TERM; // 중기 암기 (30-69%)
  } else {
    return MEMORY_STATES.LONG_TERM;   // 장기 암기 (70-100%)
  }
}

export const TestSetupNewBottomSheet = ({onCancel, onSet, maxVocabularyCount, vocabularySheetId, testType}) => {
  const [questionType, setQuestionType] = useState('multipleChoice');
  const [memoryState, setMemoryState] = useState('all');
  const [errorMessage, setErrorMessage] = useState('');
  // const [initialViewType, setInitialViewType] = useState('origin');
  // const [originFilterType, setOriginFilterType] = useState('all');
  const inputRefs = useRef({
    questionType: [],
    memoryState: [],
    // initialViewType: [],
    // originFilterType: [],
    count: []
  });

  // 길게 누르기 관련 ref
  const longPressIntervalRef = useRef(null);
  const longPressTimeoutRef = useRef(null);

  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewBottomSheet, clearStack: clearNewBottomSheetStack, pushNewBottomSheet } = useNewBottomSheetActions();
  const { clearStack: clearNewFullSheetStack } = useNewFullSheetActions();
  const navigate = useNavigate();
  const { recentStudy, updateRecentStudy, vocabularySheets } = useVocabulary();

  // 암기 상태별 단어 개수 계산
  const memoryStateCounts = useMemo(() => {
    let allWords = [];
    
    if (vocabularySheetId !== "all") {
      const vocabularySheet = vocabularySheets.find(sheet => sheet.id === vocabularySheetId);
      if (vocabularySheet) {
        allWords = vocabularySheet.words || [];
      }
    } else {
      // 전체 단어장 선택 시
      allWords = vocabularySheets.flatMap(sheet => sheet.words || []);
    }

    const counts = {
      all: 0,
      unlearned: 0,
      shortTerm: 0,
      mediumTerm: 0,
      longTerm: 0
    };

    allWords.forEach(word => {
      const state = getWordMemoryState(word);
      if (counts[state] !== undefined) {
        counts[state]++;
      }
      counts.all++; // 전체 개수 카운트
    });

    return counts;
  }, [vocabularySheets, vocabularySheetId]);

  // 선택한 암기 상태에 해당하는 단어 개수
  const currentMemoryStateCount = useMemo(() => {
    return memoryStateCounts[memoryState] || 0;
  }, [memoryStateCounts, memoryState]);

  const [count, setCount] = useState(() => {
    // 초기 렌더링 시에는 기본값 사용
    const initialMax = maxVocabularyCount > 12 ? 12 : maxVocabularyCount;
    return initialMax < MIN_TEST_VOCABULARY_COUNT ? MIN_TEST_VOCABULARY_COUNT : initialMax;
  });

  // memoryState가 변경될 때 count도 업데이트
  useEffect(() => {
    const maxCount = Math.min(currentMemoryStateCount, maxVocabularyCount);
    const newCount = maxCount > 12 ? 12 : (maxCount < MIN_TEST_VOCABULARY_COUNT ? MIN_TEST_VOCABULARY_COUNT : maxCount);
    setCount(newCount);
  }, [memoryState, currentMemoryStateCount, maxVocabularyCount]);

  // 에러 메시지 자동 제거 (4초 후)
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage('');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // 컴포넌트 언마운트 시 interval, timeout 정리
  useEffect(() => {
    return () => {
      if (longPressIntervalRef.current) {
        clearInterval(longPressIntervalRef.current);
      }
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  // React Compiler가 자동으로 useCallback 처리
  const handleClose = () => {
    popNewBottomSheet();
  };

  const handleStartTest = async (data) => {
    const testTypeData = testType || data.testType;

    console.log(testTypeData, "testType")

    // 선택한 암기 상태의 단어 개수 확인
    if (currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT) {
      pushNewBottomSheet(
        AlertNewBottomSheet,
        {
          title: `${getMemoryStateLabel(memoryState)} 단어가 부족해요!`,
          btns: { confirm: "확인" }
        }
      );
      return;
    }

    if(recentStudy.status === "learning") {

    }

    // MEMO : testType : test, exam, today
    await updateRecentStudy(testTypeData, {
      ...recentStudy[testTypeData],
      progress_index : null,
      type: testTypeData,
      status: null,
      study_data: null,
      updated_at : null,
      created_at : null,
    });
    
    clearNewBottomSheetStack();
    clearNewFullSheetStack();
    navigate('/take-test', { state: { data, testType: testTypeData } });
  };

  // React Compiler가 자동으로 useCallback 처리
  const setCountFun = (value) => {
    const maxCount = Math.min(currentMemoryStateCount, maxVocabularyCount);
    if(value < MIN_TEST_VOCABULARY_COUNT){
      inputRefs.current['count'].value = MIN_TEST_VOCABULARY_COUNT;
      setCount(MIN_TEST_VOCABULARY_COUNT);
    }else if(value > maxCount){
      inputRefs.current['count'].value = maxCount;
      setCount(maxCount);
    }else{
      inputRefs.current['count'].value = value;
      setCount(value);
    }
  };

  // 길게 누르기 시작
  const handleLongPressStart = useCallback((incrementValue, event) => {
    // 기본 동작 방지 (텍스트 선택, 컨텍스트 메뉴 등)
    if (event) {
      event.preventDefault();
    }

    // 기존 interval/timeout 정리
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
    }
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
    }

    // 첫 클릭은 즉시 실행
    setCount(prevCount => {
      const maxCount = Math.min(currentMemoryStateCount, maxVocabularyCount);
      const newValue = prevCount + incrementValue;
      
      if (newValue < MIN_TEST_VOCABULARY_COUNT) {
        return MIN_TEST_VOCABULARY_COUNT;
      } else if (newValue > maxCount) {
        return maxCount;
      } else {
        if (inputRefs.current['count']) {
          inputRefs.current['count'].value = newValue;
        }
        return newValue;
      }
    });

    // 500ms 후부터 연속 실행 시작
    longPressTimeoutRef.current = setTimeout(() => {
      longPressIntervalRef.current = setInterval(() => {
        setCount(prevCount => {
          const maxCount = Math.min(currentMemoryStateCount, maxVocabularyCount);
          const newValue = prevCount + incrementValue;
          
          if (newValue < MIN_TEST_VOCABULARY_COUNT) {
            return MIN_TEST_VOCABULARY_COUNT;
          } else if (newValue > maxCount) {
            return maxCount;
          } else {
            if (inputRefs.current['count']) {
              inputRefs.current['count'].value = newValue;
            }
            return newValue;
          }
        });
      }, 100); // 100ms마다 실행
    }, 500); // 500ms 후 시작
  }, [currentMemoryStateCount, maxVocabularyCount]);

  // 길게 누르기 종료
  const handleLongPressEnd = useCallback(() => {
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  // React Compiler가 자동으로 useCallback 처리
  const getTestSetupData = () => {
    return {
      questionType: questionType,
      memoryState: memoryState,
      // initialViewType: initialViewType,
      // originFilterType: originFilterType,
      count: count
    }
  };
  
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
            {/* {['origin', 'meanings', 'cross', 'random'].map((type, index) => ( */}
            {['multipleChoice'].map((type, index) => (
              <label 
                key={type}
                htmlFor={type}
                className={`
                  flex items-center justify-center gap-[5px] 
                  h-[45px]
                  px-[15px]
                  border-[1px] rounded-[8px]
                  ${questionType === type ? 'border-[#FF8DD4]' : 'border-[#ccc]'}
                `}
                onClick={() => {
                  inputRefs.current[`questionType`][index]?.focus();
                }}
              >
                <input 
                  id={type} 
                  type="radio" 
                  name="questionType" 
                  checked={questionType === type}
                  onChange={() => setQuestionType(type)}
                  ref={el => inputRefs.current[`questionType`][index] = el}
                  hidden 
                />
                {questionType === type && <Check size={18} weight="bold" className="text-[#FF8DD4]" />}
                <span className={`text-[16px] font-[700] ${questionType === type ? 'text-[#FF8DD4]' : 'text-[#ccc]'}`}>
                  {getQuestionTypeLabel(type)}
                </span>
              </label>
            ))}
          </div> 
        </div>
        <div 
          className="
            flex justify-between flex-col gap-[8px]
            relative
          "
        >
          <h3 
            className="
              text-[14px] font-[700] text-[#111] text-center
            dark:text-[#fff]
            "
          >
            암기 상태(복습 지연 우선)
          </h3>
          <div className="grid grid-cols-2 gap-[10px]">
            {['all', 'unlearned', 'shortTerm', 'mediumTerm', 'longTerm'].map((type, index) => {
              const count = memoryStateCounts[type] || 0;
              const isDisabled = count < MIN_TEST_VOCABULARY_COUNT;
              return (
                <label 
                  key={type}
                  htmlFor={type}
                  className={`
                    flex items-center justify-center gap-[5px] 
                    h-[45px]
                    px-[15px]
                    border-[1px] rounded-[8px]
                    ${isDisabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}
                    ${memoryState === type ? 'border-[#FF8DD4]' : 'border-[#ccc]'}
                    ${isDisabled ? 'border-[#e0e0e0]' : ''}
                  `}
                  onClick={() => {
                    if (isDisabled) {
                      setErrorMessage('최소 단어 개수가 부족하여 학습할 수 없어요');
                      return;
                    }
                    inputRefs.current[`memoryState`][index]?.focus();
                  }}
                >
                  <input 
                    id={type} 
                    type="radio" 
                    name="memoryState" 
                    checked={memoryState === type}
                    onChange={() => {
                      if (isDisabled) {
                        setErrorMessage('최소 단어 개수가 부족하여 학습할 수 없어요');
                        return;
                      }
                      setMemoryState(type);
                    }}
                    disabled={isDisabled}
                    ref={el => inputRefs.current[`memoryState`][index] = el}
                    hidden 
                  />
                  {memoryState === type && !isDisabled && <Check size={18} weight="bold" className="text-[#FF8DD4]" />}
                  <span className={`text-[16px] font-[700] ${memoryState === type && !isDisabled ? 'text-[#FF8DD4]' : isDisabled ? 'text-[#bbb]' : 'text-[#ccc]'}`}>
                    {getMemoryStateLabel(type)}
                  </span>
                  <span className={`text-[12px] font-[500] ${memoryState === type && !isDisabled ? 'text-[#FF8DD4]' : isDisabled ? 'text-[#bbb]' : 'text-[#999]'}`}>
                    ({count})
                  </span>
                </label>
              );
            })}
          </div>
          <AnimatePresence>
            {errorMessage && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="absolute top-full left-0 right-0 text-[12px] text-[#ff4444] text-center mt-[4px]"
              >
                {errorMessage}
              </motion.p>
            )}
          </AnimatePresence>
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
              onTouchStart={(e) => handleLongPressStart(-1, e)}
              onTouchEnd={handleLongPressEnd}
              onTouchCancel={handleLongPressEnd}
              disabled={count <= MIN_TEST_VOCABULARY_COUNT}
            >
              <Minus size={18} />
            </button>
            <input 
              type="number" 
              ref={el => inputRefs.current['count'] = el}
              min={MIN_TEST_VOCABULARY_COUNT}
              max={Math.min(currentMemoryStateCount, maxVocabularyCount)}
              className="w-[100px] h-[40px] px-[15px] border-[1px] border-[transparent] rounded-[8px] font-[700] text-[24px] text-[#FF8DD4] text-center outline-none focus:border-[#FF8DD4] transition-colors"
              onChange={e => setCountFun(Number(e.target.value))}
              value={count}
            />
            <button 
              className={`
                flex items-center justify-center
                w-[40px] h-[40px]
                border-[1px] rounded-[8px]
                ${count >= Math.min(currentMemoryStateCount, maxVocabularyCount) ? 'border-[#ccc] text-[#ccc]' : 'border-[#FF8DD4] text-[#FF8DD4]'}
              `}
              onTouchStart={(e) => handleLongPressStart(1, e)}
              onTouchEnd={handleLongPressEnd}
              onTouchCancel={handleLongPressEnd}
              disabled={count >= Math.min(currentMemoryStateCount, maxVocabularyCount)}
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
          onClick={onCancel || handleClose}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >취소</motion.button>
        <motion.button 
          className={`
            flex-1
            h-[45px]
            rounded-[8px]
            text-[#fff] text-[16px] font-[700]
            ${currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT ? 'bg-[#ccc] cursor-not-allowed' : 'bg-[#FF8DD4]'}
          `}
          onClick={() => {
            // 선택한 암기 상태의 단어 개수 확인
            if (currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT) {
              pushNewBottomSheet(
                AlertNewBottomSheet,
                {
                  title: `${getMemoryStateLabel(memoryState)} 단어가 부족해요!`,
                  btns: { confirm: "확인" }
                }
              );
              return;
            }

            const data = getTestSetupData();
            if (onSet) {
              onSet({...data, vocabularySheetId: vocabularySheetId, testType: testType});
            } else {
              handleStartTest({...data, vocabularySheetId: vocabularySheetId, testType: testType});
            }
          }}
          disabled={currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT}
          whileTap={currentMemoryStateCount >= MIN_TEST_VOCABULARY_COUNT ? { scale: 0.95 } : {}}
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