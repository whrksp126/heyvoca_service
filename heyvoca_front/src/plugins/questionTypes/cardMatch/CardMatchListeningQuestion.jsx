import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import { getTextSound } from '../../../utils/common';
import { vibrate } from '../../../utils/osFunction';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';
import TtsRipple from '../../../components/common/TtsRipple';
import MemoryStateChangeBadge, {
  MEMORY_STATE_RANK as STATE_RANK,
  getMemoryStateKeyByStability,
} from '../../../components/common/MemoryStateChangeBadge';
import FarmStatusBar from '../../../components/farm/FarmStatusBar';

const FitText = ({ text, maxSize = 20, minSize = 12, className = '' }) => {
  const spanRef = useRef(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useEffect(() => {
    setFontSize(maxSize);
  }, [text, maxSize]);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;
    let size = maxSize;
    el.style.fontSize = `${size}px`;
    while (el.scrollWidth > parent.clientWidth && size > minSize) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
    setFontSize(size);
  }, [text, maxSize, minSize]);

  return (
    <span
      ref={spanRef}
      className={className}
      style={{ fontSize: `${fontSize}px` }}
    >
      {text}
    </span>
  );
};

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const CardMatchListeningQuestion = ({ question, testType, onComplete, onCardMatched, farmByWordId }) => {
  const [leftWords] = useState(() => question.words);
  const [rightWords] = useState(() => shuffleArray(question.words));
  const [selectedLeft, setSelectedLeft] = useState(null);
  const [selectedRight, setSelectedRight] = useState(null);
  const [matchedWordIds, setMatchedWordIds] = useState(new Set());
  const [failedWordIds, setFailedWordIds] = useState(new Set());
  const [correctFlashWordIds, setCorrectFlashWordIds] = useState(new Set());
  const [wrongFlashLeftWordIds, setWrongFlashLeftWordIds] = useState(new Set());
  const [wrongFlashRightWordIds, setWrongFlashRightWordIds] = useState(new Set());
  const [animatingWordIds, setAnimatingWordIds] = useState(new Set());
  const [speakingWordId, setSpeakingWordId] = useState(null);
  const [speakingDuration, setSpeakingDuration] = useState(null);
  const [wordResolvedStates, setWordResolvedStates] = useState({});
  const wordResultsRef = useRef({});
  const resolvedCountRef = useRef(0);
  const questionStartRef = useRef(Date.now());
  const wordStartRef = useRef({});

  const buildResults = (wordResults) => {
    return question.words.map(word => {
      const result = wordResults[word.id] ?? { attempts: 1, isCorrect: false, timeTakenMs: 5000 };
      return {
        wordId: word.id,
        sheetId: word.vocabularySheetId ?? question.vocabularySheetId,
        isCorrect: result.isCorrect,
        timeTakenMs: result.timeTakenMs ?? 5000,
        updateData: { fsrs: word.fsrs, isCorrect: result.isCorrect, updatedAt: new Date().toISOString() },
      };
    });
  };

  const resolveWordState = (word, isMatch, attempts) => {
    // 시각적 피드백용 — 실제 FSRS 업데이트는 백엔드 /study/log에서 처리
    const prevStability = word.fsrs?.stability ?? 0;
    const prevState = word.fsrs?.state ?? null;
    const prevKey = getMemoryStateKeyByStability(prevStability, prevState);

    // 낙관적 추정
    const optimisticStability = isMatch ? Math.max(prevStability, 3.13) : Math.max(prevStability * 0.3, 0.5);
    const optimisticState = prevState && prevState !== 'new' ? (isMatch ? 'review' : 'relearning') : 'learning';
    const newKey = getMemoryStateKeyByStability(optimisticStability, optimisticState);
    const stateNameMap = { unlearned: '미학습', leaf: '단기 암기', plant: '중기 암기', carrot: '장기 암기' };

    // 항상 미래 next_review로 새로 계산. 학습 직전 fsrs.next_review는 오늘/과거라 그대로 두면 표시 안 됨.
    const daysAhead = Math.max(1, Math.round(optimisticStability));
    const next = new Date();
    next.setDate(next.getDate() + daysAhead);
    const optimisticNextReview = next.toISOString();

    // 결과 화면 '암기 상태 변화' 리스트용 — word 객체에 직접 기록 (StudyResult가 flatten해서 읽음)
    word.prevMemoryStateKey = word.prevMemoryStateKey ?? prevKey;
    word.nextMemoryStateKey = newKey;

    setWordResolvedStates(prev => ({
      ...prev,
      [word.id]: {
        prevKey,
        newKey,
        to: stateNameMap[newKey] ?? newKey,
        dir: (STATE_RANK[newKey] ?? 0) > (STATE_RANK[prevKey] ?? 0) ? 'up' : 'down',
        nextReview: optimisticNextReview,
        changed: prevKey !== newKey,
        isCorrect: isMatch,
      },
    }));
  };

  const checkMatch = (leftIdx, rightIdx) => {
    const leftWord = leftWords[leftIdx];
    const rightWord = rightWords[rightIdx];
    const isMatch = leftWord.id === rightWord.id;

    const prev = wordResultsRef.current[leftWord.id] ?? { attempts: 0, isCorrect: false };
    const newAttempts = prev.attempts + 1;
    if (!wordStartRef.current[leftWord.id]) wordStartRef.current[leftWord.id] = questionStartRef.current;
    const timeTakenMs = Date.now() - wordStartRef.current[leftWord.id];
    wordResultsRef.current[leftWord.id] = { attempts: newAttempts, isCorrect: isMatch, timeTakenMs };

    setSelectedLeft(null);
    setSelectedRight(null);
    setAnimatingWordIds(prev => new Set([...prev, leftWord.id]));

    // 카드 1장 채점 즉시 부모에 결과 전달 → 콤보/프로그래스 바로 반영
    // (CardMatchQuestion.jsx의 notifyResolved와 동일한 데이터 구조/타이밍)
    const notifyResolved = () => {
      onCardMatched?.({
        wordId: leftWord.id,
        sheetId: leftWord.vocabularySheetId ?? question.vocabularySheetId,
        isCorrect: isMatch,
        timeTakenMs,
        updateData: { fsrs: leftWord.fsrs, isCorrect: isMatch, updatedAt: new Date().toISOString() },
      });
    };

    if (isMatch) {
      vibrate({ type: 'notificationSuccess' });
      playSuccessSound();
      resolveWordState(leftWord, true, newAttempts);
      // 카드가 풀린 **그 순간** 부모에 알린다. 800ms 뒤에 알리면 그동안 구버전 표시가
      // 먼저 떴다가 농장 상태 바로 바뀌어, 채점 결과가 두 번 다른 모습으로 나타난다.
      notifyResolved();
      setCorrectFlashWordIds(prev => new Set([...prev, leftWord.id]));

      setTimeout(() => {
        setCorrectFlashWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });
        setMatchedWordIds(prev => new Set([...prev, leftWord.id]));
        setAnimatingWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });

        resolvedCountRef.current++;
        if (resolvedCountRef.current === question.words.length) {
          setTimeout(() => onComplete(buildResults(wordResultsRef.current)), 600);
        }
      }, 800);
    } else {
      vibrate({ type: 'notificationError' });
      playErrorSound();
      resolveWordState(leftWord, false, newAttempts);
      notifyResolved();   // 정답 분기와 같은 이유 — 표시가 두 번 바뀌지 않게 즉시 알린다
      setWrongFlashLeftWordIds(prev => new Set([...prev, leftWord.id]));
      setWrongFlashRightWordIds(prev => new Set([...prev, rightWord.id]));

      setTimeout(() => {
        setWrongFlashLeftWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });
        setWrongFlashRightWordIds(prev => { const s = new Set(prev); s.delete(rightWord.id); return s; });
        setFailedWordIds(prev => new Set([...prev, leftWord.id]));
        setAnimatingWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });

        resolvedCountRef.current++;
        if (resolvedCountRef.current === question.words.length) {
          setTimeout(() => onComplete(buildResults(wordResultsRef.current)), 600);
        }
      }, 800);
    }
  };

  const handleLeftClick = (index) => {
    const word = leftWords[index];
    if (matchedWordIds.has(word.id) || failedWordIds.has(word.id) || animatingWordIds.has(word.id)) return;

    const wordId = word.id;
    setSpeakingWordId(wordId);
    setSpeakingDuration(null);
    getTextSound(word.origin, "en", setSpeakingDuration).finally(() => {
      setSpeakingWordId(prev => prev === wordId ? null : prev);
    });

    if (selectedRight !== null) {
      checkMatch(index, selectedRight);
    } else {
      setSelectedLeft(index === selectedLeft ? null : index);
    }
  };

  const handleRightClick = (index) => {
    const word = rightWords[index];
    if (matchedWordIds.has(word.id) || wrongFlashRightWordIds.has(word.id)) return;

    if (selectedLeft !== null) {
      checkMatch(selectedLeft, index);
    } else {
      setSelectedRight(index === selectedRight ? null : index);
    }
  };

  const getLeftCardStyle = (index) => {
    const word = leftWords[index];
    if (matchedWordIds.has(word.id)) return 'opacity-50 bg-status-success-100 dark:bg-status-success-dark border-status-success-500';
    if (failedWordIds.has(word.id)) return 'opacity-50 border-status-error-500 bg-status-error-100 dark:bg-status-error-dark';
    if (correctFlashWordIds.has(word.id)) return 'border-[1px] border-status-success-500 bg-status-success-100 dark:bg-status-success-dark';
    if (wrongFlashLeftWordIds.has(word.id)) return 'border-[1px] border-status-error-500 bg-status-error-100 dark:bg-status-error-dark';
    if (selectedLeft === index) return 'border-[1px] border-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark';
    return 'border-layout-gray-200';
  };

  const getLeftIconStyle = (index) => {
    const word = leftWords[index];
    if (matchedWordIds.has(word.id) || correctFlashWordIds.has(word.id)) return 'text-status-success-500';
    if (failedWordIds.has(word.id) || wrongFlashLeftWordIds.has(word.id)) return 'text-status-error-500';
    if (speakingWordId === word.id || selectedLeft === index) return 'text-primary-main-600';
    return 'text-layout-gray-300';
  };

  const getLeftTextStyle = (index) => {
    const word = leftWords[index];
    if (matchedWordIds.has(word.id) || correctFlashWordIds.has(word.id)) return 'text-status-success-600';
    if (failedWordIds.has(word.id) || wrongFlashLeftWordIds.has(word.id)) return 'text-status-error-600';
    return 'text-layout-black dark:text-layout-white';
  };

  const getRightStyle = (index) => {
    const word = rightWords[index];
    if (matchedWordIds.has(word.id)) return 'opacity-50 bg-status-success-100 dark:bg-status-success-dark border-status-success-500';
    if (correctFlashWordIds.has(word.id)) return 'border-status-success-500 bg-status-success-100 dark:bg-status-success-dark';
    if (wrongFlashRightWordIds.has(word.id)) return 'border-status-error-500 bg-status-error-100 dark:bg-status-error-dark';
    if (selectedRight === index) return 'border-primary-main-600';
    return 'border-layout-gray-200 bg-layout-white dark:bg-layout-black';
  };

  const getRightTextStyle = (index) => {
    const word = rightWords[index];
    if (matchedWordIds.has(word.id) || correctFlashWordIds.has(word.id)) return 'text-status-success-600';
    if (wrongFlashRightWordIds.has(word.id)) return 'text-status-error-600';
    return 'text-layout-black dark:text-layout-white';
  };

  return (
    <div className="grid grid-cols-2 gap-[10px] w-full h-full">
      {/* 좌측: 스피커 (채점 후 단어 텍스트 공개) */}
      <div className="flex flex-col gap-[10px]">
        {leftWords.map((word, index) => {
          const isResolved = matchedWordIds.has(word.id) || failedWordIds.has(word.id);
          const isAnimating = animatingWordIds.has(word.id);
          const showText = isResolved || !!wordResolvedStates[word.id];
          const isSpeaking = speakingWordId === word.id;
          return (
            <motion.button
              key={word.id}
              className={`
                relative overflow-hidden
                flex flex-col items-center justify-center
                flex-1 rounded-[12px] p-[10px]
                bg-layout-gray-50 dark:bg-layout-gray-dark
                transition-colors duration-150
                ${getLeftCardStyle(index)}
              `}
              onClick={() => handleLeftClick(index)}
              disabled={isResolved || isAnimating}
              whileTap={!isResolved && !isAnimating ? { scale: 0.95 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              {/* 상단 중앙 - 암기 상태 배지 (채점 후)
                  농장 상태 바가 뜨면 같은 말을 두 번 하는 것이라 배지는 숨긴다 */}
              {!!wordResolvedStates[word.id] && !farmByWordId?.[word.id] && (() => {
                const resolved = wordResolvedStates[word.id];
                return (
                  <div className="absolute top-[8px] left-0 right-0 flex justify-center z-[2]">
                    <MemoryStateChangeBadge
                      toKey={resolved.newKey}
                      dir={resolved.dir}
                      changed={resolved.changed}
                      size="small"
                    />
                  </div>
                );
              })()}

              {showText ? (
                <FitText
                  text={word.origin}
                  maxSize={20}
                  minSize={12}
                  className={`font-[800] w-full text-center ${getLeftTextStyle(index)}`}
                />
              ) : (
                <div className="relative flex items-center justify-center">
                  {isSpeaking && <TtsRipple size={62} duration={speakingDuration} />}
                  <motion.div
                    animate={isSpeaking ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                    transition={isSpeaking ? { duration: 0.6, repeat: Infinity, ease: "easeInOut" } : {}}
                  >
                    <SpeakerHigh
                      size={32}
                      weight="fill"
                      className={`${getLeftIconStyle(index)} transition-colors duration-150`}
                    />
                  </motion.div>
                </div>
              )}

              {/* 하단 - 채점 후: 농장 상태 바 좁은 형 (작물·성장 막대·다음 복습일) */}
              {!!farmByWordId?.[word.id] && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute bottom-[8px] left-[8px] right-[8px] z-[2]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FarmStatusBar
                    compact
                    crop={farmByWordId[word.id].crop}
                    stage={farmByWordId[word.id].stage}
                    crop_from={farmByWordId[word.id].crop_from}
                    stage_from={farmByWordId[word.id].stage_from}
                    grew={!!farmByWordId[word.id].grew}
                    pct_from={farmByWordId[word.id].pct_from}
                    pct_to={farmByWordId[word.id].pct_to}
                    health={farmByWordId[word.id].health}
                    days_to_review={farmByWordId[word.id].days_to_review}
                    wasCorrect={farmByWordId[word.id].wasCorrect}
                  />
                </motion.div>
              )}

              {/* 하단 중앙 - 복습 예정일 (채점 후)
                  농장 상태 바가 같은 자리에서 다음 복습일까지 말하므로 그때는 숨긴다 */}
              {!!wordResolvedStates[word.id] && !farmByWordId?.[word.id] && (() => {
                // 낙관 추정값 우선 — word.fsrs.next_review는 학습 직전 값이라 과거.
                const nextReview = wordResolvedStates[word.id].nextReview ?? word.fsrs?.next_review;
                if (!nextReview) return null;
                const parts = nextReview.includes('T') ? null : nextReview.split('-');
                const date = parts
                  ? new Date(parts[0], parts[1] - 1, parts[2])
                  : new Date(nextReview);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                date.setHours(0, 0, 0, 0);
                const daysDiff = Math.round((date - today) / (1000 * 60 * 60 * 24));
                if (daysDiff < 1) return null;
                const text = `${daysDiff}일 후 복습 예정`;
                return (
                  <div className="absolute bottom-[8px] left-0 right-0 flex justify-center z-[2]">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="flex items-center justify-center h-[18px] px-[6px] rounded-[3px] bg-primary-main-200 dark:bg-primary-main-dark text-[10px] font-[600] text-primary-main-600 whitespace-nowrap"
                    >
                      {text}
                    </motion.div>
                  </div>
                );
              })()}
            </motion.button>
          );
        })}
      </div>

      {/* 우측: 의미 */}
      <div className="flex flex-col gap-[10px]">
        {rightWords.map((word, index) => {
          const isMatchResolved = matchedWordIds.has(word.id);
          const isFlashingWrong = wrongFlashRightWordIds.has(word.id);
          const displayMeanings = (word.meanings ?? []).slice(0, 2).join(', ');
          return (
            <motion.button
              key={word.id}
              className={`
                flex flex-col items-center justify-center
                flex-1 rounded-[12px] border-[1px] border-layout-gray-200 p-[10px]
                transition-colors duration-150
                ${getRightStyle(index)}
              `}
              onClick={() => handleRightClick(index)}
              disabled={isMatchResolved || isFlashingWrong}
              whileTap={!isMatchResolved && !isFlashingWrong ? { scale: 0.95 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <span className={`text-[14px] font-[600] ${getRightTextStyle(index)} text-center leading-snug break-keep`}>
                {displayMeanings}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default CardMatchListeningQuestion;
