import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, Sparkle, Shuffle, ArrowRight, SpeakerHigh } from '@phosphor-icons/react';
import { QUESTION_TYPE_PLUGINS, countFillInTheBlankCandidates, isFillInTheBlankType } from '../../plugins/questionTypes';
import { motion, AnimatePresence } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { MIN_TEST_VOCABULARY_COUNT } from '../../utils/common';
import { MEMORY_STAGE_ORDER, wordMemoryStage, memoryStageCounts } from '../../utils/vocaCrop';
import { vibrate } from '../../utils/osFunction';
import SetupTile from '../common/SetupTile';
import MemoryStageSelector from '../common/MemoryStageSelector';
import { McqGlyph, CardMatchGlyph, BlankGlyph } from '../common/QuestionTypeGlyphs';
import { Toggle } from '../newfullsheet/settingsUi';

/*
  테스트 설정 — 순서: 어떤 단어를 → 몇 문제 → 단어 고르는 방식 → 문제 유형 → 방향 → 듣기.
  브랜드색(primary)은 시작 CTA 와 듣기 스위치 ON 에만 쓴다. 선택은 검은 테두리 + 체크 배지(SetupTile).
*/

/** 섹션 껍데기 — 제목(좌) · 캡션(우) · 본문 · 주석 */
const Section = ({ title, caption, note, children }) => (
  <section className="flex flex-col gap-[10px]">
    <div className="flex items-baseline justify-between">
      <h3 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">{title}</h3>
      {caption && <span className="text-[12px] text-layout-gray-300">{caption}</span>}
    </div>
    {children}
    {note && <p className="text-[12px] leading-[1.5] text-layout-gray-300 break-keep">{note}</p>}
  </section>
);

/** 방향 타일의 글자 배지 — currentColor 테두리라 타일 선택색을 따른다 */
const LangBadge = ({ children }) => (
  <span className="flex items-center justify-center w-[34px] h-[26px] rounded-[7px] border-[1.5px] border-current text-[12px] font-[800]">
    {children}
  </span>
);

export const TestSetupNewBottomSheet = ({ onCancel, onSet, maxVocabularyCount, vocabularySheetId, testType }) => {
  // 문제 유형 선택은 [유형 묶음 × 방향 × 듣기] 세 축으로 받고, 실제 questionType id 배열은
  // 플러그인 메타데이터(family/direction/listening)로 파생한다(아래 questionTypes).
  // 기본값(사지선다 · 양방향 · 듣기 없음) → ['multipleChoice', 'reverseMultipleChoice'] — 예전 기본값과 같다.
  const [selectedFamilies, setSelectedFamilies] = useState(['multipleChoice']);
  const [selectedDirections, setSelectedDirections] = useState(['en2ko', 'ko2en']);
  const [listeningOn, setListeningOn] = useState(false);
  const [selectionType, setSelectionType] = useState('recommended'); // 'recommended' | 'random'
  // 어떤 단어를 — 농장 작물 단계 키(unlearned/seed/sprout/leaf/carrot). 백엔드도 같은 키를 받는다.
  const [memoryState, setMemoryState] = useState([...MEMORY_STAGE_ORDER]);
  const [errorMessage, setErrorMessage] = useState('');
  const inputRefs = useRef({
    questionType: [],
    memoryState: [],
    count: []
  });

  // 길게 누르기 관련 ref
  const longPressIntervalRef = useRef(null);
  const longPressTimeoutRef = useRef(null);

  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewBottomSheet, clearStack: clearNewBottomSheetStack } = useNewBottomSheetActions();
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

  // 선택 축 → questionType id 배열. 듣기 변형은 일반 유형을 대체하지 않고 **추가**된다.
  const questionTypes = useMemo(() => {
    const derived = QUESTION_TYPE_PLUGINS
      .filter(p => p.enabled
        && selectedFamilies.includes(p.family)
        && (p.direction === null || selectedDirections.includes(p.direction))
        && (!p.listening || listeningOn))
      .map(p => p.id);
    // 방어: 비면 최소 1개는 남긴다(정상 선택 조합에서는 발생하지 않음)
    return derived.length > 0 ? derived : ['multipleChoice'];
  }, [selectedFamilies, selectedDirections, listeningOn]);

  const isFillSelected = selectedFamilies.includes('fillInTheBlank');
  // 빈칸 채우기 출제 가능 단어 수 — 선택한 방향 중 하나라도 자격 예문이 있는 단어
  const fillCandidateCount = useMemo(
    () => countFillInTheBlankCandidates(allWords, selectedDirections),
    [allWords, selectedDirections]
  );

  // 작물 단계별 단어 개수 (5개 키 — 판정은 vocaCrop.wordMemoryStage 한 곳)
  const stageCounts = useMemo(() => memoryStageCounts(allWords), [allWords]);

  // 선택한 단계(들)에 해당하는 단어 개수 (중복 제거)
  const currentMemoryStateCount = useMemo(() => {
    const matchingIds = new Set();
    allWords.forEach(word => {
      if (memoryState.includes(wordMemoryStage(word))) {
        matchingIds.add(word.id);
      }
    });
    return matchingIds.size;
  }, [allWords, memoryState]);

  const maxCount = Math.min(currentMemoryStateCount, maxVocabularyCount);

  const [count, setCount] = useState(() => {
    // 초기 렌더링 시에는 기본값 사용
    const initialMax = maxVocabularyCount > 12 ? 12 : maxVocabularyCount;
    return initialMax < MIN_TEST_VOCABULARY_COUNT ? MIN_TEST_VOCABULARY_COUNT : initialMax;
  });

  // memoryState가 변경될 때 count도 업데이트
  useEffect(() => {
    const max = Math.min(currentMemoryStateCount, maxVocabularyCount);
    const newCount = max > 12 ? 12 : (max < MIN_TEST_VOCABULARY_COUNT ? MIN_TEST_VOCABULARY_COUNT : max);
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

    if (currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT) {
      setErrorMessage('학습을 위해 4개 이상의 단어가 필요해요');
      return;
    }

    // 빈칸 채우기만 선택했을 때 강조 처리된 예문이 있는 단어가 충분한지 검사
    const onlyFill = Array.isArray(data.questionType)
      && data.questionType.length > 0
      && data.questionType.every(isFillInTheBlankType);
    if (onlyFill && fillCandidateCount < MIN_TEST_VOCABULARY_COUNT) {
      setErrorMessage('빈칸 채우기는 예문에 강조 표시가 있는 단어가 필요해요. 다른 유형도 함께 선택해주세요');
      return;
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
    const max = Math.min(currentMemoryStateCount, maxVocabularyCount);
    if (value < MIN_TEST_VOCABULARY_COUNT) {
      inputRefs.current['count'].value = MIN_TEST_VOCABULARY_COUNT;
      setCount(MIN_TEST_VOCABULARY_COUNT);
    } else if (value > max) {
      inputRefs.current['count'].value = max;
      setCount(max);
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
      const max = Math.min(currentMemoryStateCount, maxVocabularyCount);
      const newValue = prevCount + incrementValue;

      if (newValue < MIN_TEST_VOCABULARY_COUNT) {
        return MIN_TEST_VOCABULARY_COUNT;
      } else if (newValue > max) {
        return max;
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
          const max = Math.min(currentMemoryStateCount, maxVocabularyCount);
          const newValue = prevCount + incrementValue;

          if (newValue < MIN_TEST_VOCABULARY_COUNT) {
            return MIN_TEST_VOCABULARY_COUNT;
          } else if (newValue > max) {
            return max;
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
      selectionType,
      memoryState: memoryState,
      count: count
    }
  };

  // 다중 선택 토글 — 마지막 1개는 해제되지 않는다(≥1 보장)
  const toggleKeepOne = (setter) => (value) => {
    setter(prev => {
      if (prev.includes(value)) {
        const next = prev.filter(v => v !== value);
        return next.length === 0 ? prev : next;
      }
      return [...prev, value];
    });
  };
  const toggleFamily = toggleKeepOne(setSelectedFamilies);
  const toggleDirection = toggleKeepOne(setSelectedDirections);

  const toggleMemoryState = (state) => {
    setMemoryState(prev =>
      prev.includes(state)
        ? prev.filter(s => s !== state)
        : [...prev, state]
    );
  };

  const isStartDisabled = memoryState.length === 0 || currentMemoryStateCount < MIN_TEST_VOCABULARY_COUNT;

  // 몇 문제 — 미리 정한 개수 칩. max 보다 큰 값은 빼고, '전체'와 같은 값은 숫자 칩을 뺀다(같은 칩 둘).
  const presetChips = useMemo(() => {
    if (maxCount < MIN_TEST_VOCABULARY_COUNT) return [];
    const chips = [10, 20]
      .filter(n => n < maxCount)
      .map(n => ({ value: n, label: String(n) }));
    chips.push({ value: maxCount, label: `전체 ${maxCount}` });
    return chips;
  }, [maxCount]);

  const stepperBtnClass = (disabled) => `
    flex items-center justify-center
    w-[44px] h-[44px] rounded-[12px]
    border-[1px] border-layout-gray-200 dark:border-[#3A3A3A]
    select-none touch-none
    ${disabled ? 'text-layout-gray-200' : 'text-layout-black dark:text-layout-white'}
  `;

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
        flex flex-col gap-[28px]
        max-h-[calc(90vh-47px)]
        p-[20px] pb-[115px]
        overflow-y-auto
      ">
        {/* 1. 어떤 단어를 — 농장 작물 단계 5칸 */}
        <div className="relative">
          <Section
            title="어떤 단어를"
            caption={`선택 ${currentMemoryStateCount}개`}
            note="농장 작물 단계로 골라요 — 미학습 · 씨앗 · 새싹 · 이파리 · 당근(황금 포함)"
          >
            <MemoryStageSelector value={memoryState} counts={stageCounts} onToggle={toggleMemoryState} />
          </Section>
          <AnimatePresence>
            {errorMessage && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="absolute top-full left-0 right-0 text-[12px] text-status-error-500 text-center pt-[4px] break-keep"
              >
                {errorMessage}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* 2. 몇 문제 — 스테퍼 + 미리 정한 개수 칩 */}
        <Section title="몇 문제">
          <div className="flex items-center justify-center gap-[14px]">
            <motion.button
              type="button"
              aria-label="문제 수 줄이기"
              className={stepperBtnClass(isStartDisabled || count <= MIN_TEST_VOCABULARY_COUNT)}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (isStartDisabled) {
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
              <Minus size={18} weight="bold" />
            </motion.button>
            <div className="flex flex-col items-center w-[110px]">
              <input
                type="number"
                ref={el => inputRefs.current['count'] = el}
                min={MIN_TEST_VOCABULARY_COUNT}
                max={maxCount}
                className="w-full h-[40px] text-[32px] font-[800] leading-none text-layout-black dark:text-layout-white text-center outline-none bg-transparent"
                onChange={e => {
                  vibrate({ duration: 5 });
                  setCountFun(Number(e.target.value));
                }}
                value={count}
              />
              <span className="text-[11px] text-layout-gray-300">최대 {maxCount}문제</span>
            </div>
            <motion.button
              type="button"
              aria-label="문제 수 늘리기"
              className={stepperBtnClass(isStartDisabled || count >= maxCount)}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (isStartDisabled) {
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
              <Plus size={18} weight="bold" />
            </motion.button>
          </div>
          {presetChips.length > 0 && (
            <div className="flex items-center justify-center gap-[8px]">
              {presetChips.map(({ value, label }) => {
                const selected = count === value;
                return (
                  <motion.button
                    key={label}
                    type="button"
                    aria-pressed={selected}
                    whileTap={{ scale: 0.96 }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      vibrate({ duration: 5 });
                      setCountFun(value);
                    }}
                    className={`
                      h-[30px] px-[14px] rounded-[15px]
                      border-[1px] text-[12px] font-[700]
                      ${selected
                        ? 'border-layout-black dark:border-layout-white text-layout-black dark:text-layout-white'
                        : 'border-layout-gray-200 dark:border-[#3A3A3A] text-layout-gray-300'}
                    `}
                  >
                    {label}
                  </motion.button>
                );
              })}
            </div>
          )}
        </Section>

        {/* 3. 단어 고르는 방식 — 추천 / 랜덤 */}
        <Section title="단어 고르는 방식">
          <div className="flex gap-[8px]">
            {[
              { value: 'recommended', label: '추천', sub: '복습 시기·약점 순', icon: <Sparkle size={22} weight="fill" /> },
              { value: 'random', label: '랜덤', sub: '무작위로 섞어요', icon: <Shuffle size={22} weight="bold" /> },
            ].map(({ value, label, sub, icon }) => (
              <SetupTile
                key={value}
                role="radio"
                selected={selectionType === value}
                onClick={() => setSelectionType(value)}
                className="h-[96px]"
              >
                {icon}
                <span className="flex flex-col items-center gap-[2px]">
                  <span className="text-[14px] font-[700]">{label}</span>
                  <span className="text-[11px] text-layout-gray-300 text-center">{sub}</span>
                </span>
              </SetupTile>
            ))}
          </div>
        </Section>

        {/* 4. 문제 유형 — 유형 묶음(다중) */}
        <Section
          title="문제 유형"
          caption="복수 선택"
          note={isFillSelected ? `빈칸 채우기: 이 단어장 ${allWords.length}개 중 ${fillCandidateCount}개 출제 가능` : undefined}
        >
          <div className="flex gap-[8px]">
            {[
              { value: 'multipleChoice', label: '사지선다', Glyph: McqGlyph },
              { value: 'cardMatch', label: '카드 맞추기', Glyph: CardMatchGlyph },
              { value: 'fillInTheBlank', label: '빈칸 채우기', Glyph: BlankGlyph },
            ].map(({ value, label, Glyph }) => (
              <SetupTile
                key={value}
                selected={selectedFamilies.includes(value)}
                onClick={() => toggleFamily(value)}
                className="h-[104px]"
              >
                <Glyph size={44} />
                <span className="text-[14px] font-[700] break-keep">{label}</span>
              </SetupTile>
            ))}
          </div>
        </Section>

        {/* 5. 방향 — 다중 */}
        <Section
          title="방향"
          caption="복수 선택"
          note="사지선다·빈칸 채우기에 적용돼요. 카드 맞추기는 양쪽 카드가 함께 보여요."
        >
          <div className="flex gap-[8px]">
            {[
              { value: 'en2ko', label: '영어 보고 한글', from: 'Aa', to: '가' },
              { value: 'ko2en', label: '한글 보고 영어', from: '가', to: 'Aa' },
            ].map(({ value, label, from, to }) => (
              <SetupTile
                key={value}
                selected={selectedDirections.includes(value)}
                onClick={() => toggleDirection(value)}
                className="h-[96px]"
              >
                <span className="flex items-center gap-[6px]" aria-hidden>
                  <LangBadge>{from}</LangBadge>
                  <ArrowRight size={16} weight="bold" />
                  <LangBadge>{to}</LangBadge>
                </span>
                <span className="text-[14px] font-[700]">{label}</span>
              </SetupTile>
            ))}
          </div>
        </Section>

        {/* 6. 듣기 — 스위치 한 줄 */}
        <Section title="듣기">
          <div
            className="
              flex items-center gap-[12px]
              h-[64px] px-[14px] rounded-[12px]
              border-[1px] border-layout-gray-200 dark:border-[#3A3A3A]
              bg-layout-white dark:bg-[#1A1A1A]
              cursor-pointer
            "
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              vibrate({ duration: 5 });
              setListeningOn(prev => !prev);
            }}
          >
            <span className="flex items-center justify-center flex-shrink-0 w-[36px] h-[36px] rounded-full bg-layout-gray-50 dark:bg-[#2A2A2A]">
              <SpeakerHigh size={20} weight="fill" className="text-layout-gray-300" />
            </span>
            <span className="flex flex-col flex-1 min-w-0 gap-[2px]">
              <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white">듣기 문제 포함</span>
              <span className="text-[12px] text-layout-gray-300 break-keep">사지선다·카드 맞추기에 발음 듣고 맞히기가 섞여요</span>
            </span>
            {/* Toggle 은 자체 stopPropagation + haptic 을 가진다 — 행 onClick 과 이중 토글되지 않는다 */}
            <Toggle on={listeningOn} onClick={() => setListeningOn(prev => !prev)} />
          </div>
        </Section>
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
            h-[52px]
            rounded-[12px]
            text-[16px] font-[700] tracking-[-0.03em]
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
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
            h-[52px]
            rounded-[12px]
            text-layout-white dark:text-layout-black text-[16px] font-[700] tracking-[-0.03em]
            ${isStartDisabled ? 'bg-layout-gray-200 cursor-not-allowed' : 'bg-primary-main-600'}
          `}
          onClick={() => {
            if (isStartDisabled) {
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
        >{isStartDisabled ? '시작' : `시작 · ${count}문제`}</motion.button>
      </div>
      </div>
    </div>
  );
};
