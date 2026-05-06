import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, Plus } from '@phosphor-icons/react';
import { QUESTION_TYPE_PLUGINS } from '../../plugins/questionTypes';
import { motion, AnimatePresence } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { MIN_TEST_VOCABULARY_COUNT, MEMORY_STATES, getWordMemoryState, isWordOverdue } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';

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
    case 'overdue':
      return '복습 지연';
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

export const TestSetupNewBottomSheet = ({ onCancel, onSet, maxVocabularyCount, vocabularySheetId, testType }) => {
  const [questionTypes, setQuestionTypes] = useState(['multipleChoice']);
  const [memoryState, setMemoryState] = useState(['all']);
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

  // 단어 목록 (다른 useMemo에서 재사용)
  const allWords = useMemo(() => {
    if (vocabularySheetId === "all") {
      return vocabularySheets.flatMap(sheet => sheet.words || []);
    } else if (Array.isArray(vocabularySheetId)) {
      const idSet = new Set(vocabularySheetId);
      return vocabularySheets
        .filter(sheet => idSet.has(sheet.id))
        .flatMap(sheet => sheet.words || []);
    } else {
      const vocabularySheet = vocabularySheets.find(sheet => sheet.id === vocabularySheetId);
      return vocabularySheet ? (vocabularySheet.words || []) : [];
    }
  }, [vocabularySheets, vocabularySheetId]);

  // 암기 상태별 단어 개수 계산
  const memoryStateCounts = useMemo(() => {
    const counts = {
      all: 0,
      unlearned: 0,
      overdue: 0,
      shortTerm: 0,
      mediumTerm: 0,
      longTerm: 0
    };

    allWords.forEach(word => {
      counts.all++;
      if (isWordOverdue(word)) {
        counts.overdue++;
      } else {
        const state = getWordMemoryState(word);
        if (counts[state] !== undefined) counts[state]++;
      }
    });

    return counts;
  }, [allWords]);

  // 선택한 암기 상태(들)에 해당하는 단어 개수 (중복 제거)
  const currentMemoryStateCount = useMemo(() => {
    if (memoryState.includes('all')) return memoryStateCounts.all;

    const matchingIds = new Set();
    allWords.forEach(word => {
      for (const state of memoryState) {
        if (state === 'overdue') {
          if (isWordOverdue(word)) { matchingIds.add(word.id); break; }
        } else {
          if (!isWordOverdue(word) && getWordMemoryState(word) === state) { matchingIds.add(word.id); break; }
        }
      }
    });
    return matchingIds.size;
  }, [allWords, memoryState, memoryStateCounts]);

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
      const timer = setTimeout(() => setErrorMessage(''), 4000);
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

    if (currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT) {
      setErrorMessage('학습을 위해 4개 이상의 단어가 필요해요');
      return;
    }

    if (recentStudy.status === "learning") {

    }

    // MEMO : testType : test, exam, today
    await updateRecentStudy(testTypeData, {
      ...recentStudy[testTypeData],
      progress_index: null,
      type: testTypeData,
      status: null,
      study_data: null,
      updated_at: null,
      created_at: null,
    });

    clearNewBottomSheetStack();
    clearNewFullSheetStack();
    navigate('/take-test', { state: { data, testType: testTypeData } });
  };

  // React Compiler가 자동으로 useCallback 처리
  const setCountFun = (value) => {
    const maxCount = Math.min(currentMemoryStateCount, maxVocabularyCount);
    if (value < MIN_TEST_VOCABULARY_COUNT) {
      inputRefs.current['count'].value = MIN_TEST_VOCABULARY_COUNT;
      setCount(MIN_TEST_VOCABULARY_COUNT);
    } else if (value > maxCount) {
      inputRefs.current['count'].value = maxCount;
      setCount(maxCount);
    } else {
      inputRefs.current['count'].value = value;
      setCount(value);
    }
  };

  // 길게 누르기 시작
  const handleLongPressStart = useCallback((incrementValue, event) => {
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
        vibrate({ duration: 5 });
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
            vibrate({ duration: 5 });
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
      questionType: questionTypes,
      memoryState: memoryState,
      // initialViewType: initialViewType,
      // originFilterType: originFilterType,
      count: count
    }
  };

  return (
    <div className="relative">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
        ">
          <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">테스트 설정</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[30px]
        max-h-[calc(90vh-47px)]
        p-[20px] pb-[115px]
        overflow-y-auto
      ">
        <div
          className="
            flex justify-between flex-col gap-[8px]
          "
        >
          <h3
            className="
              text-[14px] font-[700] text-layout-black text-center
            dark:text-layout-white
            "
          >
            문제 유형
          </h3>
          <div className="grid grid-cols-2 gap-[10px]">
            {QUESTION_TYPE_PLUGINS.map((plugin, index) => {
              const isSelected = questionTypes.includes(plugin.id);
              return (
                <div
                  key={plugin.id}
                  className={`
                    flex items-center justify-center gap-[5px]
                    h-[45px]
                    px-[15px]
                    border-[1px] rounded-[8px]
                    cursor-pointer
                    ${isSelected ? 'border-primary-main-600' : 'border-layout-gray-200'}
                  `}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    vibrate({ duration: 5 });
                    setQuestionTypes(prev => {
                      if (prev.includes(plugin.id)) {
                        const next = prev.filter(t => t !== plugin.id);
                        return next.length === 0 ? [plugin.id] : next;
                      }
                      return [...prev, plugin.id];
                    });
                  }}
                >
                  {isSelected && <Check size={18} weight="bold" className="text-primary-main-600" />}
                  <span className={`text-[16px] font-[700] ${isSelected ? 'text-primary-main-600' : 'text-layout-gray-200'}`}>
                    {plugin.label}
                  </span>
                </div>
              );
            })}
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
              text-[14px] font-[700] text-layout-black text-center
            dark:text-layout-white
            "
          >
            암기 상태
          </h3>
          <div className="grid grid-cols-2 gap-[10px]">
            {['all', 'unlearned', 'overdue', 'shortTerm', 'mediumTerm', 'longTerm'].map((type) => {
              const stateCount = memoryStateCounts[type] || 0;
              const isSelected = memoryState.includes(type);
              return (
                <div
                  key={type}
                  className={`
                    flex items-center justify-center gap-[5px]
                    h-[45px]
                    px-[15px]
                    border-[1px] rounded-[8px]
                    cursor-pointer
                    ${isSelected ? 'border-primary-main-600' : 'border-layout-gray-200'}
                  `}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    vibrate({ duration: 5 });
                    if (type === 'all') {
                      setMemoryState(['all']);
                    } else {
                      setMemoryState(prev => {
                        const withoutAll = prev.filter(s => s !== 'all');
                        if (withoutAll.includes(type)) {
                          const next = withoutAll.filter(s => s !== type);
                          return next.length === 0 ? ['all'] : next;
                        } else {
                          return [...withoutAll, type];
                        }
                      });
                    }
                  }}
                >
                  {isSelected && <Check size={18} weight="bold" className="text-primary-main-600" />}
                  <span className={`text-[16px] font-[700] ${isSelected ? 'text-primary-main-600' : 'text-layout-gray-200'}`}>
                    {getMemoryStateLabel(type)}
                  </span>
                  <span className={`text-[12px] font-[500] ${isSelected ? 'text-primary-main-600' : 'text-[#999]'}`}>
                    ({stateCount})
                  </span>
                </div>
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
                className="absolute top-full left-0 right-0 text-[12px] text-[#ff4444] text-center pt-[4px]"
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
              text-[14px] font-[700] text-layout-black text-center
            dark:text-layout-white
            "
          >
            문제 개수
          </h3>
          <div className="flex items-center justify-center gap-[10px]">
            <motion.button
              className={`
                flex items-center justify-center
                w-[40px] h-[40px]
                border-[1px] rounded-[8px]
                select-none touch-none
                ${currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT || count <= MIN_TEST_VOCABULARY_COUNT ? 'border-layout-gray-200 text-layout-gray-200' : 'border-primary-main-600 text-primary-main-600'}
              `}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT) {
                  setErrorMessage('학습을 위해 4개 이상의 단어가 필요해요');
                  return;
                }
                handleLongPressStart(-1, e);
              }}
              onPointerUp={handleLongPressEnd}
              onPointerCancel={handleLongPressEnd}
              onPointerLeave={handleLongPressEnd}
              drag={false}
              style={{ touchAction: 'none' }}
            >
              <Minus size={18} />
            </motion.button>
            <input
              type="number"
              ref={el => inputRefs.current['count'] = el}
              min={MIN_TEST_VOCABULARY_COUNT}
              max={Math.min(currentMemoryStateCount, maxVocabularyCount)}
              className="w-[100px] h-[40px] px-[15px] border-[1px] border-[transparent] rounded-[8px] font-[700] text-[24px] text-primary-main-600 text-center outline-none bg-layout-white dark:bg-layout-black focus:border-primary-main-600 transition-colors"
              onChange={e => {
                vibrate({ duration: 5 });
                setCountFun(Number(e.target.value));
              }}
              value={count}
            />
            <motion.button
              className={`
                flex items-center justify-center
                w-[40px] h-[40px]
                border-[1px] rounded-[8px]
                select-none touch-none
                ${currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT || count >= Math.min(currentMemoryStateCount, maxVocabularyCount) ? 'border-layout-gray-200 text-layout-gray-200' : 'border-primary-main-600 text-primary-main-600'}
              `}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT) {
                  setErrorMessage('학습을 위해 4개 이상의 단어가 필요해요');
                  return;
                }
                handleLongPressStart(1, e);
              }}
              onPointerUp={handleLongPressEnd}
              onPointerCancel={handleLongPressEnd}
              onPointerLeave={handleLongPressEnd}
              drag={false}
              style={{ touchAction: 'none' }}
            >
              <Plus size={18} />
            </motion.button>
          </div>
        </div>
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        p-[20px] pt-[50px]
        bg-gradient-to-b from-transparent to-layout-white dark:to-layout-black
      ">
      <div className="flex items-center justify-between gap-[15px]">
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-layout-gray-200
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            onCancel || handleClose();
          }}
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
            text-layout-white dark:text-layout-black text-[16px] font-[700]
            ${currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT ? 'bg-layout-gray-200 cursor-not-allowed' : 'bg-primary-main-600'}
          `}
          onClick={() => {
            if (currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT) {
              setErrorMessage('학습을 위해 4개 이상의 단어가 필요해요');
              return;
            }

            const data = getTestSetupData();
            if (onSet) {
              onSet({ ...data, vocabularySheetId: vocabularySheetId, testType: testType });
            } else {
              handleStartTest({ ...data, vocabularySheetId: vocabularySheetId, testType: testType });
            }
          }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >시작</motion.button>
      </div>
      </div>
    </div>
  );
}; 