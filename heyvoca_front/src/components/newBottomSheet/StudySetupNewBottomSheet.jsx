import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Minus, Plus } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { MIN_TEST_VOCABULARY_COUNT } from '../../utils/common';
import { MEMORY_STAGE_ORDER, wordMemoryStage, memoryStageCounts } from '../../utils/vocaCrop';
import { sortByForgettingPriority } from '../../utils/forgettingPriority';
import { vibrate } from '../../utils/osFunction';
import MemoryStageSelector from '../common/MemoryStageSelector';

export const StudySetupNewBottomSheet = ({ onCancel, vocabularySheetId, maxVocabularyCount }) => {
  "use memo";

  const { popNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
  const { clearStack: clearNewFullSheetStack } = useNewFullSheetActions();
  const { vocabularySheets } = useVocabulary();
  const navigate = useNavigate();

  const [selectionType, setSelectionType] = useState('recommended'); // 'recommended' | 'random'
  // 어떤 단어를 — 테스트 설정과 같은 농장 작물 단계 키(unlearned/seed/sprout/leaf/carrot)
  const [memoryState, setMemoryState] = useState([...MEMORY_STAGE_ORDER]);

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

  // 작물 단계별 단어 개수 (5개 키 — 판정은 vocaCrop.wordMemoryStage 한 곳)
  const stageCounts = useMemo(() => memoryStageCounts(allWords), [allWords]);

  // 선택한 단계의 단어 수
  const currentMemoryStateCount = useMemo(() => {
    const matchingIds = new Set();
    allWords.forEach(word => {
      if (memoryState.includes(wordMemoryStage(word))) {
        matchingIds.add(word.id);
      }
    });
    return matchingIds.size;
  }, [allWords, memoryState]);

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

  const toggleMemoryState = (state) => {
    setMemoryState(prev =>
      prev.includes(state)
        ? prev.filter(s => s !== state)
        : [...prev, state]
    );
  };

  const isStartDisabled = memoryState.length === 0 || currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT;

  const handleStart = () => {
    if (isStartDisabled) return;

    // 1. 선택된 작물 단계로 필터 — 테스트 설정(/study/recommend target_states)과 같은 판정
    const candidatePool = allWords.filter(word => memoryState.includes(wordMemoryStage(word)));

    // 2. 출제 유형 분기
    const ordered = selectionType === 'recommended'
      ? sortByForgettingPriority(candidatePool)
      : [...candidatePool].sort(() => Math.random() - 0.5);

    const picked = ordered.slice(0, count);

    clearNewBottomSheetStack();
    clearNewFullSheetStack();
    navigate('/study', {
      state: {
        vocabularySheetId,
        words: picked,
      }
    });
  };

  return (
    <div className="relative bg-layout-white dark:bg-layout-black">
      {/* 스크롤 가능한 콘텐츠 */}
      <div className="overflow-y-auto scrollbar-hide flex flex-col gap-[30px] max-h-[calc(90vh-47px)] pt-[20px] pb-[115px] px-[20px]">
        {/* 타이틀 */}
        <h2 className="text-[18px] font-[700] text-center text-layout-black dark:text-layout-white">
          학습 설정
        </h2>

        {/* 출제 유형 */}
        <div className="flex flex-col gap-[8px]">
          <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white text-center">
            출제 유형
          </p>
          <div className="flex gap-[8px]">
            {[
              { value: 'recommended', label: '추천' },
              { value: 'random', label: '랜덤' },
            ].map(({ value, label }) => {
              const isSelected = selectionType === value;
              return (
                <div
                  key={value}
                  className={`
                    flex-1 flex items-center justify-center gap-[5px]
                    h-[45px] px-[15px]
                    border-[1px] rounded-[8px]
                    cursor-pointer
                    ${isSelected ? 'border-primary-main-600' : 'border-layout-gray-200'}
                  `}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => {
                    vibrate({ duration: 5 });
                    setSelectionType(value);
                  }}
                >
                  {isSelected && <Check size={18} weight="bold" className="text-primary-main-600" />}
                  <span className={`text-[16px] font-[700] ${isSelected ? 'text-primary-main-600' : 'text-layout-gray-200'}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 어떤 단어를 — 농장 작물 단계 5칸(테스트 설정과 같은 컴포넌트) */}
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">어떤 단어를</h3>
            <span className="text-[12px] text-layout-gray-300">선택 {currentMemoryStateCount}개</span>
          </div>
          <MemoryStageSelector value={memoryState} counts={stageCounts} onToggle={toggleMemoryState} />
          <p className="text-[12px] leading-[1.5] text-layout-gray-300 break-keep">
            농장 작물 단계로 골라요 — 미학습 · 씨앗 · 새싹 · 이파리 · 당근(황금 포함)
          </p>
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
            className="flex-1 h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em]
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
            whileTap={{ scale: 0.95 }}
          >
            취소
          </motion.button>
          <motion.button
            onClick={() => { vibrate({ duration: 5 }); handleStart(); }}
            className={`
              flex-1 h-[52px] rounded-[12px] text-layout-white dark:text-layout-black text-[16px] font-[700] tracking-[-0.03em]
              ${isStartDisabled ? 'bg-layout-gray-200 cursor-not-allowed' : 'bg-primary-main-600'}
            `}
            whileTap={!isStartDisabled ? { scale: 0.95 } : {}}
          >
            완료
          </motion.button>
        </div>
      </div>
    </div>
  );
};
