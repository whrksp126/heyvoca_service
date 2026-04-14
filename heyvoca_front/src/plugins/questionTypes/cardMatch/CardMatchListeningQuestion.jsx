import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SpeakerHigh, EggCrack, Leaf, Plant, Carrot } from '@phosphor-icons/react';
import { updateSM2, getTextSound } from '../../../utils/common';
import { vibrate } from '../../../utils/osFunction';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';

const getMemoryStateKey = (interval, repetition) => {
  if (repetition === 0 && interval === 0) return 'unlearned';
  if (interval < 10) return 'leaf';
  if (interval < 60) return 'plant';
  return 'carrot';
};

const getMemoryStateName = (interval, repetition) => {
  if (repetition === 0 && interval === 0) return '미학습';
  if (interval < 10) return '단기 암기';
  if (interval < 60) return '중기 암기';
  return '장기 암기';
};

const stateIconMap = {
  unlearned: <EggCrack size={10} weight="fill" />,
  leaf: <Leaf size={10} weight="fill" />,
  plant: <Plant size={10} weight="fill" />,
  carrot: <Carrot size={10} weight="fill" />,
};

const stateColorMap = {
  unlearned: { border: 'border-[#9D835A]', text: 'text-[#9D835A]', bg: 'bg-[#FFFCF3]' },
  leaf: { border: 'border-[#77CE4F]', text: 'text-[#77CE4F]', bg: 'bg-[#F2FFEB]' },
  plant: { border: 'border-[#38CE38]', text: 'text-[#38CE38]', bg: 'bg-[#EBFFEE]' },
  carrot: { border: 'border-[#F68300]', text: 'text-[#F68300]', bg: 'bg-[#FFF8E8]' },
};

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

const CardMatchListeningQuestion = ({ question, testType, onComplete, onCardMatched }) => {
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
  const [wordResolvedStates, setWordResolvedStates] = useState({});
  const wordResultsRef = useRef({});
  const resolvedCountRef = useRef(0);

  const buildResults = (wordResults) => {
    return question.words.map(word => {
      const result = wordResults[word.id] ?? { attempts: 1, isCorrect: false };
      const q = result.isCorrect
        ? (result.attempts === 1 ? 5 : result.attempts === 2 ? 3 : 2)
        : 0;
      const sm2Input = {
        ef: word.sm2?.ef ?? word.ef ?? 2.5,
        repetition: word.sm2?.repetition ?? word.repetition ?? 0,
        interval: word.sm2?.interval ?? word.interval ?? 0,
        nextReview: word.sm2?.nextReview ?? word.nextReview,
        lastStudyDate: word.sm2?.lastStudyDate ?? word.lastStudyDate,
      };
      const newState = updateSM2(sm2Input, q, { testType, today: new Date() });
      return {
        wordId: word.id,
        sheetId: word.vocabularySheetId ?? question.vocabularySheetId,
        isCorrect: result.isCorrect,
        updateData: { ...newState, sm2: { ...newState }, updatedAt: new Date().toISOString() },
      };
    });
  };

  const resolveWordState = (word, isMatch, attempts) => {
    const q = isMatch
      ? (attempts === 1 ? 5 : attempts === 2 ? 3 : 2)
      : 0;
    const sm2Input = {
      ef: word.sm2?.ef ?? word.ef ?? 2.5,
      repetition: word.sm2?.repetition ?? word.repetition ?? 0,
      interval: word.sm2?.interval ?? word.interval ?? 0,
      nextReview: word.sm2?.nextReview ?? word.nextReview,
      lastStudyDate: word.sm2?.lastStudyDate ?? word.lastStudyDate,
    };
    const newState = updateSM2(sm2Input, q, { testType, today: new Date() });
    const prevKey = getMemoryStateKey(sm2Input.interval, sm2Input.repetition);
    const newKey = getMemoryStateKey(newState.interval, newState.repetition);
    setWordResolvedStates(prev => ({
      ...prev,
      [word.id]: {
        prevKey,
        newKey,
        to: getMemoryStateName(newState.interval, newState.repetition),
        nextReview: newState.nextReview,
        changed: prevKey !== newKey,
      },
    }));
  };

  const checkMatch = (leftIdx, rightIdx) => {
    const leftWord = leftWords[leftIdx];
    const rightWord = rightWords[rightIdx];
    const isMatch = leftWord.id === rightWord.id;

    const prev = wordResultsRef.current[leftWord.id] ?? { attempts: 0, isCorrect: false };
    const newAttempts = prev.attempts + 1;
    wordResultsRef.current[leftWord.id] = { attempts: newAttempts, isCorrect: isMatch };

    setSelectedLeft(null);
    setSelectedRight(null);
    setAnimatingWordIds(prev => new Set([...prev, leftWord.id]));

    if (isMatch) {
      vibrate({ type: 'notificationSuccess' });
      playSuccessSound();
      resolveWordState(leftWord, true, newAttempts);
      setCorrectFlashWordIds(prev => new Set([...prev, leftWord.id]));

      setTimeout(() => {
        setCorrectFlashWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });
        setMatchedWordIds(prev => new Set([...prev, leftWord.id]));
        setAnimatingWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });
        onCardMatched?.();

        resolvedCountRef.current++;
        if (resolvedCountRef.current === question.words.length) {
          setTimeout(() => onComplete(buildResults(wordResultsRef.current)), 600);
        }
      }, 800);
    } else {
      vibrate({ type: 'notificationError' });
      playErrorSound();
      resolveWordState(leftWord, false, newAttempts);
      setWrongFlashLeftWordIds(prev => new Set([...prev, leftWord.id]));
      setWrongFlashRightWordIds(prev => new Set([...prev, rightWord.id]));

      setTimeout(() => {
        setWrongFlashLeftWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });
        setWrongFlashRightWordIds(prev => { const s = new Set(prev); s.delete(rightWord.id); return s; });
        setFailedWordIds(prev => new Set([...prev, leftWord.id]));
        setAnimatingWordIds(prev => { const s = new Set(prev); s.delete(leftWord.id); return s; });
        onCardMatched?.();

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
    getTextSound(word.origin, "en").finally(() => {
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
    if (matchedWordIds.has(word.id)) return 'opacity-50 bg-status-success-100 border-status-success-500';
    if (failedWordIds.has(word.id)) return 'opacity-50 border-status-error-500 bg-status-error-100';
    if (correctFlashWordIds.has(word.id)) return 'border-[1px] border-status-success-500 bg-status-success-100';
    if (wrongFlashLeftWordIds.has(word.id)) return 'border-[1px] border-status-error-500 bg-status-error-100';
    if (selectedLeft === index) return 'border-[1px] border-primary-main-600 bg-primary-main-50';
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
    return 'text-layout-black';
  };

  const getRightStyle = (index) => {
    const word = rightWords[index];
    if (matchedWordIds.has(word.id)) return 'opacity-50 bg-status-success-100 border-status-success-500';
    if (correctFlashWordIds.has(word.id)) return 'border-status-success-500 bg-status-success-100';
    if (wrongFlashRightWordIds.has(word.id)) return 'border-status-error-500 bg-status-error-100';
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
                bg-layout-gray-50
                transition-colors duration-150
                ${getLeftCardStyle(index)}
              `}
              onClick={() => handleLeftClick(index)}
              disabled={isResolved || isAnimating}
              whileTap={!isResolved && !isAnimating ? { scale: 0.95 } : {}}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              {/* 상단 중앙 - 암기 상태 배지 (채점 후) */}
              {!!wordResolvedStates[word.id] && (() => {
                const resolved = wordResolvedStates[word.id];
                const colors = stateColorMap[resolved.newKey];
                return (
                  <div className="absolute top-[8px] left-0 right-0 flex justify-center z-[2]">
                    {resolved.changed ? (
                      <motion.div
                        className={`
                          flex items-center gap-[3px]
                          py-[2px] px-[6px]
                          border rounded-[50px]
                          text-[9px] font-[600]
                          overflow-hidden whitespace-nowrap
                          ${colors.border} ${colors.text} ${colors.bg}
                        `}
                        initial={{ maxWidth: 20 }}
                        animate={{ maxWidth: 200 }}
                        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <span className="flex-shrink-0">{stateIconMap[resolved.newKey]}</span>
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.25 }}
                        >
                          {resolved.to}로 변경!
                        </motion.span>
                      </motion.div>
                    ) : (
                      <motion.div
                        className={`
                          flex items-center justify-center
                          w-[18px] h-[18px]
                          border rounded-[18px]
                          ${colors.border} ${colors.text} ${colors.bg}
                        `}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        {stateIconMap[resolved.newKey]}
                      </motion.div>
                    )}
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
                  {isSpeaking && (
                    <>
                      <motion.div
                        className="absolute rounded-full border-2 border-primary-main-600"
                        initial={{ width: 30, height: 30, opacity: 0.7 }}
                        animate={{ width: 62, height: 62, opacity: 0 }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                      />
                      <motion.div
                        className="absolute rounded-full border-2 border-primary-main-600"
                        initial={{ width: 30, height: 30, opacity: 0.7 }}
                        animate={{ width: 62, height: 62, opacity: 0 }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                      />
                    </>
                  )}
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

              {/* 하단 중앙 - 복습 예정일 (채점 후) */}
              {!!wordResolvedStates[word.id] && (() => {
                const nextReview = wordResolvedStates[word.id].nextReview;
                if (!nextReview) return null;
                const parts = nextReview.includes('T') ? null : nextReview.split('-');
                const date = parts
                  ? new Date(parts[0], parts[1] - 1, parts[2])
                  : new Date(nextReview);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                date.setHours(0, 0, 0, 0);
                const daysDiff = Math.round((date - today) / (1000 * 60 * 60 * 24));
                const text = daysDiff <= 0 ? '오늘 복습 예정' : `${daysDiff}일 후 복습 예정`;
                return (
                  <div className="absolute bottom-[8px] left-0 right-0 flex justify-center z-[2]">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="flex items-center justify-center h-[18px] px-[6px] rounded-[3px] bg-primary-main-200 text-[10px] font-[600] text-primary-main-600 whitespace-nowrap"
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
