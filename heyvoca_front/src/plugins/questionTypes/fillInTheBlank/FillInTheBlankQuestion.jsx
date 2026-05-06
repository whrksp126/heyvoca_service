import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, X, Leaf, Plant, Carrot, EggCrack } from '@phosphor-icons/react';
import { updateSM2 } from '../../../utils/common';
import { vibrate } from '../../../utils/osFunction';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';

const getMemoryStateKey = (interval, repetition) => {
  if (repetition === 0 && interval === 0) return 'unlearned';
  if (interval < 10) return 'leaf';
  if (interval < 60) return 'plant';
  return 'carrot';
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

const stateNameMap = { unlearned: '미학습', leaf: '단기 암기', plant: '중기 암기', carrot: '장기 암기' };

const renderHighlightedText = (html) => {
  if (!html) return null;
  const regex = /<strong[^>]*class="target-word"[^>]*>(.*?)<\/strong>/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{html.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <span key={`h-${match.index}`} className="text-primary-main-600 font-[700]">
        {match[1]}
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < html.length) {
    parts.push(<span key={`t-${lastIndex}`}>{html.slice(lastIndex)}</span>);
  }
  return parts;
};

const parseExampleText = (html) => {
  if (!html) return { before: '', after: '' };
  const match = html.match(/<strong[^>]*class="target-word"[^>]*>(.*?)<\/strong>/);
  if (!match) return { before: html.replace(/<[^>]*>/g, ''), after: '' };
  const before = html.slice(0, match.index).replace(/<[^>]*>/g, '');
  const after = html.slice(match.index + match[0].length).replace(/<[^>]*>/g, '');
  return { before, after };
};

const FillInTheBlankQuestion = ({ question, testType, onComplete, onCardMatched }) => {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [memoryStateChange, setMemoryStateChange] = useState(null);
  const [nextReviewDate, setNextReviewDate] = useState(null);
  const startTimeRef = useRef(Date.now());

  // 채점 전 현재 암기 상태 캡처
  const prevStateKeyRef = useRef(
    getMemoryStateKey(
      question.sm2?.interval ?? question.interval ?? 0,
      question.sm2?.repetition ?? question.repetition ?? 0
    )
  );

  const { exampleText, exampleTranslation, targetWord, options, resultIndex } = question;
  const { before, after } = parseExampleText(exampleText);

  const handleOptionClick = (index) => {
    if (isAnswered) return;
    setSelectedIndex(index);

    const correct = index === resultIndex;
    const timeTakenSec = Math.round((Date.now() - startTimeRef.current) / 1000);
    const q = correct ? (timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : 3) : 0;

    if (correct) {
      vibrate({ type: 'notificationSuccess' });
      playSuccessSound();
    } else {
      vibrate({ type: 'notificationError' });
      playErrorSound();
    }

    const newState = updateSM2({
      ef: question.sm2?.ef ?? question.ef ?? 2.5,
      repetition: question.sm2?.repetition ?? question.repetition ?? 0,
      interval: question.sm2?.interval ?? question.interval ?? 0,
      nextReview: question.sm2?.nextReview ?? question.nextReview,
      lastStudyDate: question.sm2?.lastStudyDate ?? question.lastStudyDate,
    }, q, { testType, today: new Date() });

    Object.assign(question, newState);
    question.sm2 = { ...question.sm2, ...newState };
    question.isCorrect = correct;

    // 암기 상태 변화 감지
    const newStateKey = getMemoryStateKey(newState.interval, newState.repetition);
    if (prevStateKeyRef.current !== newStateKey) {
      setMemoryStateChange({ from: stateNameMap[prevStateKeyRef.current], to: stateNameMap[newStateKey], stateKey: newStateKey });
    }

    // 복습 예정일 계산
    setNextReviewDate(newState.nextReview ?? null);

    setIsCorrect(correct);
    setIsAnswered(true);
    onCardMatched?.();

    setTimeout(() => {
      onComplete([{
        sheetId: question.vocabularySheetId,
        wordId: question.id,
        isCorrect: correct,
        updateData: { ...newState, sm2: newState },
      }]);
    }, 1000);
  };

  const blankClass = isAnswered
    ? isCorrect
      ? 'border-status-success-500 text-status-success-600 bg-status-success-100'
      : 'border-status-error-500 text-status-error-600 bg-status-error-100'
    : 'border-layout-gray-300 bg-layout-white dark:bg-layout-black';

  // 복습 예정일 텍스트
  const reviewText = (() => {
    if (!isAnswered || !nextReviewDate) return null;
    const parts = nextReviewDate.includes('T') ? null : nextReviewDate.split('-');
    const date = parts
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date(nextReviewDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const daysDiff = Math.round((date - today) / (1000 * 60 * 60 * 24));
    return daysDiff <= 0 ? '오늘 복습 예정' : `${daysDiff}일 후 복습 예정`;
  })();

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 한국어 + 영어 예문 전체 영역 (채점 피드백 기준점) */}
      <div className="relative flex flex-col h-full rounded-[12px] overflow-hidden">

        {/* 한국어 예문 (primary 배경, target-word 강조) */}
        <div className="flex items-center min-h-[72px] px-[20px] py-[15px] bg-primary-main-50">
          <p className="text-[14px] font-[400] text-layout-black">
            {renderHighlightedText(exampleTranslation)}
          </p>
        </div>

        {/* 영어 예문 + 빈칸 박스 + O/X + 복습일 */}
        <div className="relative flex-1 bg-layout-gray-50 px-[20px] py-[15px]">
          {/* 예문 텍스트 + 빈칸 (O/X 위에) */}
          <p className="relative z-[2] text-[16px] font-[400] text-layout-black leading-[2.2]">
            {before}
            <span
              className={`
                inline-flex items-center justify-center
                min-w-[70px] h-[25px] px-[15px]
                border-[1px] border-layout-gray-200 rounded-[5px]
                text-[15px] font-[600]
                align-middle
                transition-all duration-200
                ${blankClass}
              `}
            >
              {isAnswered ? targetWord : ''}
            </span>
            {after}
          </p>
        </div>

        {/* 암기 상태 배지 (채점 후, 전체 영역 상단 중앙) */}
        {isAnswered && (
          <div className="absolute top-[12px] left-[50%] translate-x-[-50%] flex items-center justify-center z-[2] whitespace-nowrap">
            {memoryStateChange ? (
              <motion.div
                className={`flex items-center gap-[3px] py-[3px] px-[8px] border rounded-[50px] text-[10px] font-[600] overflow-hidden whitespace-nowrap ${stateColorMap[memoryStateChange.stateKey]?.border} ${stateColorMap[memoryStateChange.stateKey]?.text} ${stateColorMap[memoryStateChange.stateKey]?.bg}`}
                initial={{ maxWidth: 28 }}
                animate={{ maxWidth: 300 }}
                transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
              >
                <span className="flex-shrink-0">{stateIconMap[memoryStateChange.stateKey]}</span>
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.25 }}>
                  암기 상태가 {memoryStateChange.to}로 변경되었어요!
                </motion.span>
              </motion.div>
            ) : (
              (() => {
                const stateKey = getMemoryStateKey(
                  question.sm2?.interval ?? question.interval ?? 0,
                  question.sm2?.repetition ?? question.repetition ?? 0
                );
                const colors = stateColorMap[stateKey];
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    className={`flex items-center justify-center w-[18px] h-[18px] border rounded-[18px] ${colors.border} ${colors.text} ${colors.bg}`}
                  >
                    {stateIconMap[stateKey]}
                  </motion.div>
                );
              })()
            )}
          </div>
        )}
        {/* O/X 아이콘 (그레이 카드 중앙, 텍스트 뒤) */}
        <div className="absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[1]">
          <AnimatePresence>
            {isCorrect === true && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 25, duration: 0.3 }}
                style={{ willChange: 'transform, opacity' }}
              >
                <Circle size={150} weight="bold" className="text-status-success-500 opacity-80" />
              </motion.div>
            )}
            {isCorrect === false && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 25, duration: 0.3 }}
                style={{ willChange: 'transform, opacity' }}
              >
                <X size={150} weight="bold" className="text-status-error-500 opacity-80" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* 복습 예정일 (그레이 카드 하단 중앙) */}
        {reviewText && (
          <div className="absolute bottom-[12px] left-[50%] translate-x-[-50%] flex items-center justify-center z-[2]">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="flex items-center justify-center h-[18px] px-[6px] rounded-[3px] bg-primary-main-200 text-[10px] font-[600] text-primary-main-600 whitespace-nowrap"
            >
              {reviewText}
            </motion.div>
          </div>
        )}
      </div>

      {/* 선택지 4개 */}
      <div className="flex flex-col gap-[8px]">
        {options.map((option, index) => {
          let btnStyle = 'border-layout-gray-200 text-layout-black dark:text-layout-white';
          if (isAnswered && resultIndex === index) {
            btnStyle = 'border-status-success-500 text-status-success-600 bg-status-success-100';
          } else if (isAnswered && selectedIndex === index && !isCorrect) {
            btnStyle = 'border-status-error-500 text-status-error-600 bg-status-error-100';
          } else if (!isAnswered && selectedIndex === index) {
            btnStyle = 'border-primary-main-600 bg-primary-main-50 text-layout-black dark:text-layout-white';
          }

          return (
            <motion.button
              key={index}
              onClick={() => { vibrate({ duration: 5 }); handleOptionClick(index); }}
              disabled={isAnswered}
              whileTap={{ scale: isAnswered ? 1 : 0.92, transition: { type: 'spring', stiffness: 400, damping: 17 } }}
              style={{ willChange: 'transform' }}
              className={`
                flex items-center justify-center
                w-full h-[50px]
                px-[20px]
                border-[1px] rounded-[10px]
                text-[14px] font-[700]
                ${btnStyle}
              `}
            >
              {option}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default FillInTheBlankQuestion;
