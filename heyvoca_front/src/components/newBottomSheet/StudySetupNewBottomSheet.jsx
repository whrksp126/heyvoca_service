import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, Plus } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { MIN_TEST_VOCABULARY_COUNT, MEMORY_STATES, getWordMemoryState, isWordOverdue } from '../../utils/common';
import { AlertNewBottomSheet } from './AlertNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

function getMemoryStateLabel(type) {
  switch (type) {
    case 'all': return '전체';
    case 'unlearned': return '미학습';
    case 'overdue': return '복습 지연';
    case 'shortTerm': return '단기 암기';
    case 'mediumTerm': return '중기 암기';
    case 'longTerm': return '장기 암기';
    default: return '';
  }
}

export const StudySetupNewBottomSheet = ({ onCancel, vocabularySheetId, maxVocabularyCount }) => {
  "use memo";

  const { popNewBottomSheet, clearStack: clearNewBottomSheetStack, pushNewBottomSheet } = useNewBottomSheetActions();
  const { clearStack: clearNewFullSheetStack } = useNewFullSheetActions();
  const { vocabularySheets } = useVocabulary();
  const navigate = useNavigate();

  const [memoryState, setMemoryState] = useState(['all']);

  const longPressIntervalRef = useRef(null);
  const longPressTimeoutRef = useRef(null);

  // 선택된 단어장의 모든 단어
  const allWords = useMemo(() => {
    if (vocabularySheetId === 'all') {
      return vocabularySheets.flatMap(sheet => sheet.words || []);
    } else if (Array.isArray(vocabularySheetId)) {
      const idSet = new Set(vocabularySheetId);
      return vocabularySheets
        .filter(sheet => idSet.has(sheet.id))
        .flatMap(sheet => sheet.words || []);
    } else {
      const sheet = vocabularySheets.find(s => s.id === vocabularySheetId);
      return sheet ? (sheet.words || []) : [];
    }
  }, [vocabularySheets, vocabularySheetId]);

  // 암기 상태별 단어 개수
  const memoryStateCounts = useMemo(() => {
    const counts = { all: 0, unlearned: 0, overdue: 0, shortTerm: 0, mediumTerm: 0, longTerm: 0 };
    allWords.forEach(word => {
      counts.all++;
      if (isWordOverdue(word)) {
        counts.overdue++;
      } else {
        const s = getWordMemoryState(word);
        if (counts[s] !== undefined) counts[s]++;
      }
    });
    return counts;
  }, [allWords]);

  // 선택한 암기 상태의 단어 수
  const currentMemoryStateCount = useMemo(() => {
    if (memoryState.includes('all')) return memoryStateCounts.all;
    const matchingIds = new Set();
    allWords.forEach(word => {
      for (const s of memoryState) {
        if (s === 'overdue') {
          if (isWordOverdue(word)) { matchingIds.add(word.id); break; }
        } else {
          if (!isWordOverdue(word) && getWordMemoryState(word) === s) { matchingIds.add(word.id); break; }
        }
      }
    });
    return matchingIds.size;
  }, [allWords, memoryState, memoryStateCounts]);

  const [count, setCount] = useState(() => {
    const initialMax = maxVocabularyCount > 12 ? 12 : maxVocabularyCount;
    return initialMax < MIN_TEST_VOCABULARY_COUNT ? MIN_TEST_VOCABULARY_COUNT : initialMax;
  });

  useEffect(() => {
    const maxCount = Math.min(currentMemoryStateCount, maxVocabularyCount);
    const newCount = maxCount > 12 ? 12 : (maxCount < MIN_TEST_VOCABULARY_COUNT ? MIN_TEST_VOCABULARY_COUNT : maxCount);
    setCount(newCount);
  }, [memoryState, currentMemoryStateCount, maxVocabularyCount]);

  useEffect(() => {
    return () => {
      if (longPressIntervalRef.current) clearInterval(longPressIntervalRef.current);
      if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
    };
  }, []);

  const handleLongPressStart = useCallback((incrementValue) => {
    if (longPressIntervalRef.current) clearInterval(longPressIntervalRef.current);
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);

    setCount(prev => {
      const maxCount = Math.min(currentMemoryStateCount, maxVocabularyCount);
      const next = prev + incrementValue;
      if (next < MIN_TEST_VOCABULARY_COUNT) return MIN_TEST_VOCABULARY_COUNT;
      if (next > maxCount) return maxCount;
      vibrate({ duration: 5 });
      return next;
    });

    longPressTimeoutRef.current = setTimeout(() => {
      longPressIntervalRef.current = setInterval(() => {
        setCount(prev => {
          const maxCount = Math.min(currentMemoryStateCount, maxVocabularyCount);
          const next = prev + incrementValue;
          if (next < MIN_TEST_VOCABULARY_COUNT) return MIN_TEST_VOCABULARY_COUNT;
          if (next > maxCount) return maxCount;
          vibrate({ duration: 5 });
          return next;
        });
      }, 100);
    }, 500);
  }, [currentMemoryStateCount, maxVocabularyCount]);

  const handleLongPressEnd = useCallback(() => {
    if (longPressIntervalRef.current) { clearInterval(longPressIntervalRef.current); longPressIntervalRef.current = null; }
    if (longPressTimeoutRef.current) { clearTimeout(longPressTimeoutRef.current); longPressTimeoutRef.current = null; }
  }, []);

  const handleStart = () => {
    if (currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT) {
      pushNewBottomSheet(AlertNewBottomSheet, {
        title: '선택한 암기 상태의 단어가 부족해요!',
        btns: { confirm: '확인' }
      });
      return;
    }

    // 선택된 단어 필터링
    let selectedWords;
    if (memoryState.includes('all')) {
      selectedWords = allWords;
    } else {
      selectedWords = allWords.filter(word => {
        for (const s of memoryState) {
          if (s === 'overdue' && isWordOverdue(word)) return true;
          if (s !== 'overdue' && !isWordOverdue(word) && getWordMemoryState(word) === s) return true;
        }
        return false;
      });
    }

    // count만큼 셔플해서 자르기
    const shuffled = [...selectedWords].sort(() => Math.random() - 0.5).slice(0, count);

    clearNewBottomSheetStack();
    clearNewFullSheetStack();
    navigate('/study', {
      state: {
        vocabularySheetId,
        words: shuffled,
      }
    });
  };

  const memoryStateOrder = ['all', 'overdue', 'unlearned', 'shortTerm', 'mediumTerm', 'longTerm'];

  return (
    <div className="relative bg-layout-white dark:bg-layout-black">
      {/* 스크롤 가능한 콘텐츠 */}
      <div className="overflow-y-auto scrollbar-hide flex flex-col gap-[30px] max-h-[calc(90vh-47px)] pt-[20px] pb-[115px] px-[20px]">
        {/* 타이틀 */}
        <h2 className="text-[18px] font-[700] text-center text-layout-black dark:text-layout-white">
          학습 설정
        </h2>

        {/* 암기 상태 */}
        <div className="flex flex-col gap-[15px]">
          <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white text-center">
            암기 상태
          </p>
          <div className="grid grid-cols-2 gap-[10px] relative">
            {memoryStateOrder.map(type => {
              const stateCount = memoryStateCounts[type] || 0;
              const isSelected = memoryState.includes(type);
              return (
                <div
                  key={type}
                  className={`
                    flex items-center justify-center gap-[5px]
                    h-[45px] px-[15px]
                    border-[1px] rounded-[8px]
                    cursor-pointer
                    ${isSelected ? 'border-primary-main-600' : 'border-layout-gray-200'}
                  `}
                  onPointerDown={e => e.stopPropagation()}
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
                        }
                        return [...withoutAll, type];
                      });
                    }
                  }}
                >
                  {isSelected && (
                    <Check size={18} weight="bold" className="text-primary-main-600" />
                  )}
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
        </div>

        {/* 학습 개수 */}
        <div className="flex flex-col gap-[15px]">
          <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white text-center">
            학습 개수
          </p>
          <div className="flex items-center justify-center gap-[16px]">
            <motion.button
              className={`
                flex items-center justify-center w-[40px] h-[40px]
                border-[1px] rounded-[8px] select-none touch-none
                ${count <= MIN_TEST_VOCABULARY_COUNT
                  ? 'border-layout-gray-200 text-layout-gray-200'
                  : 'border-primary-main-600 text-primary-main-600'
                }
              `}
              onPointerDown={e => { e.stopPropagation(); handleLongPressStart(-1); }}
              onPointerUp={handleLongPressEnd}
              onPointerCancel={handleLongPressEnd}
              onPointerLeave={handleLongPressEnd}
              drag={false}
              style={{ touchAction: 'none' }}
            >
              <Minus size={18} />
            </motion.button>

            <span className="w-[80px] text-center text-[28px] font-[700] text-primary-main-600">
              {count}
            </span>

            <motion.button
              className={`
                flex items-center justify-center w-[40px] h-[40px]
                border-[1px] rounded-[8px] select-none touch-none
                ${count >= Math.min(currentMemoryStateCount, maxVocabularyCount)
                  ? 'border-layout-gray-200 text-layout-gray-200'
                  : 'border-primary-main-600 text-primary-main-600'
                }
              `}
              onPointerDown={e => { e.stopPropagation(); handleLongPressStart(1); }}
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

      {/* 하단 고정 버튼 */}
      <div className="absolute bottom-0 left-0 right-0 px-[20px] pt-[30px] pb-[20px] bg-gradient-to-b from-transparent to-layout-white dark:to-layout-black pointer-events-none">
        <div className="flex gap-[10px] pointer-events-auto">
          <motion.button
            onClick={() => { vibrate({ duration: 5 }); onCancel?.(); popNewBottomSheet(); }}
            className="flex-1 h-[45px] rounded-[8px] bg-layout-gray-200 text-layout-white text-[16px] font-[700]"
            whileTap={{ scale: 0.95 }}
          >
            취소
          </motion.button>
          <motion.button
            onClick={() => { vibrate({ duration: 5 }); handleStart(); }}
            className={`
              flex-1 h-[45px] rounded-[8px] text-layout-white text-[16px] font-[700]
              ${currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT ? 'bg-layout-gray-200 cursor-not-allowed' : 'bg-primary-main-600'}
            `}
            whileTap={currentMemoryStateCount >= MIN_TEST_VOCABULARY_COUNT ? { scale: 0.95 } : {}}
          >
            완료
          </motion.button>
        </div>
      </div>
    </div>
  );
};
