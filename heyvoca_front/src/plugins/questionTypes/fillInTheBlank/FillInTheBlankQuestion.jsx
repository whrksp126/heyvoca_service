import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, X, Leaf, Plant, Carrot, EggCrack, ArrowUpRight, ArrowDownRight } from '@phosphor-icons/react';
import FarmStatusBar from '../../../components/farm/FarmStatusBar';
import { vibrate } from '../../../utils/osFunction';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';
import { getAdvanceDelay } from '../../../utils/studyTiming';

const stateIconMap = {
  unlearned: <EggCrack size={10} weight="fill" />,
  leaf: <Leaf size={10} weight="fill" />,
  plant: <Plant size={10} weight="fill" />,
  carrot: <Carrot size={10} weight="fill" />,
};

const stateColorMap = {
  unlearned: { border: 'border-[#9D835A]', text: 'text-[#9D835A]', bg: 'bg-[#FFFCF3] dark:bg-[#FFFCF3]/20' },
  leaf: { border: 'border-[#77CE4F]', text: 'text-[#77CE4F]', bg: 'bg-[#F2FFEB] dark:bg-[#F2FFEB]/20' },
  plant: { border: 'border-[#38CE38]', text: 'text-[#38CE38]', bg: 'bg-[#EBFFEE] dark:bg-[#EBFFEE]/20' },
  carrot: { border: 'border-[#F68300]', text: 'text-[#F68300]', bg: 'bg-[#FFF8E8] dark:bg-[#FFF8E8]/20' },
};

const stateNameMap = { unlearned: '미학습', leaf: '단기 암기', plant: '중기 암기', carrot: '장기 암기' };

const STATE_RANK = { unlearned: 0, leaf: 1, plant: 2, carrot: 3 };

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

const FillInTheBlankQuestion = ({ question, testType, onComplete, onCardMatched, farm }) => {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [memoryStateChange, setMemoryStateChange] = useState(null);
  const [nextReviewDate, setNextReviewDate] = useState(null);
  const startTimeRef = useRef(Date.now());

  // 채점 전 현재 암기 상태 캡처 (FSRS 기반)
  const getMemoryStateKeyByStability = (stability, state) => {
    if (!state || state === 'new') return 'unlearned';
    if (stability < 10) return 'leaf';
    if (stability < 60) return 'plant';
    return 'carrot';
  };
  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const { exampleText, exampleTranslation, targetWord, options, resultIndex } = question;
  const { before, after } = parseExampleText(exampleText);

  const handleOptionClick = (index) => {
    if (isAnswered) return;
    setSelectedIndex(index);

    const correct = index === resultIndex;
    const timeTakenMs = Date.now() - startTimeRef.current;
    const timeTakenSec = Math.round(timeTakenMs / 1000);
    const q = correct ? (timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : 3) : 0;

    if (correct) {
      vibrate({ type: 'notificationSuccess' });
      playSuccessSound();
    } else {
      vibrate({ type: 'notificationError' });
      playErrorSound();
    }

    // FSRS 업데이트는 백엔드 /study/log에서 처리
    // 복습 예정일은 현재 fsrs.next_review 사용 (UI 표시용)
    question.isCorrect = correct;
    // 복습 예정일: 예측값(백엔드 사전 계산) 우선 → 채점 시 고정해 깜빡임 제거.
    // 없으면 기존 fsrs/단순 추정으로 폴백.
    const predicted = question.predictedReview?.[correct ? 'correct' : 'wrong'];
    let displayReview = predicted?.next_review ?? question.fsrs?.next_review ?? null;
    if (!displayReview) {
      const next = new Date();
      next.setDate(next.getDate() + (correct ? 3 : 1));
      displayReview = next.toISOString();
    }
    question.displayNextReview = displayReview;
    setNextReviewDate(displayReview);

    // 낙관적 암기상태 변경 알림 — 승급/강등을 화살표 배지로 즉시 표시
    {
      const prevKey = prevStateKeyRef.current;
      const optimisticStability = correct ? 3.13 : 0.5;
      const optimisticState = 'learning';
      const newKey = getMemoryStateKeyByStability(optimisticStability, optimisticState);
      // 결과 화면 '암기 상태 변화' 리스트용 낙관값 — 백엔드 응답 도착 시 확정값으로 덮임
      question.nextMemoryStateKey = newKey;
      if (prevKey && prevKey !== newKey) {
        setMemoryStateChange({
          toKey: newKey,
          dir: (STATE_RANK[newKey] ?? 0) > (STATE_RANK[prevKey] ?? 0) ? 'up' : 'down',
        });
      }
    }

    setIsCorrect(correct);
    setIsAnswered(true);
    onCardMatched?.();

    // 오답일 때는 더 천천히 다음 문제로 전환 (정답 1초 / 오답 2.5초)
    setTimeout(() => {
      onComplete([{
        sheetId: question.vocabularySheetId,
        wordId: question.id,
        isCorrect: correct,
        timeTakenMs,
        updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
      }]);
    }, getAdvanceDelay(correct));
  };

  const blankClass = isAnswered
    ? isCorrect
      ? 'border-status-success-500 text-status-success-600 bg-status-success-100'
      : 'border-status-error-500 text-status-error-600 bg-status-error-100 dark:bg-status-error-dark'
    : 'border-layout-gray-300 bg-layout-white dark:bg-layout-black';

  // 복습 예정일 텍스트 — 채점 시 고정된 displayNextReview 사용(백엔드 응답으로 덮지 않음)
  const liveNextReview = question.displayNextReview ?? nextReviewDate;
  const reviewText = (() => {
    if (!isAnswered || !liveNextReview) return null;
    const parts = liveNextReview.includes('T') ? null : liveNextReview.split('-');
    const date = parts
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : new Date(liveNextReview);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const daysDiff = Math.round((date - today) / (1000 * 60 * 60 * 24));
    // 백엔드 응답 도착 전 잔여 fsrs(이미 지난 next_review)일 가능성 → 미래일 때만 표시
    if (daysDiff < 1) return null;
    return `${daysDiff}일 후 복습 예정`;
  })();

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 한국어 + 영어 예문 전체 영역 (채점 피드백 기준점) */}
      <div className="relative flex flex-col h-full rounded-[12px] overflow-hidden">

        {/* 한국어 예문 (primary 배경, target-word 강조) */}
        <div className="flex items-center min-h-[72px] px-[20px] py-[15px] bg-primary-main-50 dark:bg-primary-main-dark">
          <p className="text-[14px] font-[400] text-layout-black dark:text-layout-white">
            {renderHighlightedText(exampleTranslation)}
          </p>
        </div>

        {/* 영어 예문 + 빈칸 박스 + O/X + 복습일 */}
        <div className="relative flex-1 bg-layout-gray-50 dark:bg-layout-gray-dark px-[20px] py-[15px]">
          {/* 예문 텍스트 + 빈칸 (O/X 위에) */}
          <p className="relative z-[2] text-[16px] font-[400] text-layout-black dark:text-layout-white leading-[2.2]">
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

        {/* 암기 상태 배지 (채점 후, 전체 영역 상단 중앙)
            농장 상태 바가 같은 것을 하단에서 말하므로 payload 가 오면 숨긴다 */}
        {isAnswered && !farm && (
          <div className="absolute top-[12px] left-[50%] translate-x-[-50%] flex items-center justify-center z-[2] whitespace-nowrap">
            {memoryStateChange ? (
              <motion.div
                className={`flex items-center gap-[3px] py-[3px] px-[8px] border rounded-[50px] whitespace-nowrap ${
                  memoryStateChange.dir === 'up'
                    ? `${stateColorMap[memoryStateChange.toKey]?.border} ${stateColorMap[memoryStateChange.toKey]?.text} ${stateColorMap[memoryStateChange.toKey]?.bg}`
                    : 'border-layout-gray-200 text-layout-gray-300 bg-layout-gray-50 dark:bg-layout-gray-dark'
                }`}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              >
                {memoryStateChange.dir === 'up'
                  ? <ArrowUpRight size={10} weight="bold" />
                  : <ArrowDownRight size={10} weight="bold" />}
                <span className="flex-shrink-0">{stateIconMap[memoryStateChange.toKey]}</span>
              </motion.div>
            ) : (
              (() => {
                const stateKey = getMemoryStateKeyByStability(
                  question.fsrs?.stability ?? 0,
                  question.fsrs?.state ?? null
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
        {/* 농장 상태 바 (채점 후, 카드 하단) — 다른 문제 유형과 같은 컴포넌트를 쓴다 */}
        {farm && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="absolute bottom-[14px] left-[14px] right-[14px] z-[2]"
            onClick={(e) => e.stopPropagation()}
          >
            <FarmStatusBar
              crop={farm.crop}
              stage={farm.stage}
              crop_from={farm.crop_from}
              stage_from={farm.stage_from}
              grew={!!farm.grew}
              pct_from={farm.pct_from}
              pct_to={farm.pct_to}
              health={farm.health}
              days_to_review={farm.days_to_review}
              wasCorrect={farm.wasCorrect}
            />
          </motion.div>
        )}

        {/* 복습 예정일 (그레이 카드 하단 중앙)
            농장 상태 바가 같은 자리에서 다음 복습일까지 말하므로 그때는 숨긴다 */}
        {reviewText && !farm && (
          <div className="absolute bottom-[12px] left-[50%] translate-x-[-50%] flex items-center justify-center z-[2]">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="flex items-center justify-center h-[18px] px-[6px] rounded-[3px] bg-primary-main-200 dark:bg-primary-main-dark text-[10px] font-[600] text-primary-main-600 whitespace-nowrap"
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
            btnStyle = 'border-status-error-500 text-status-error-600 bg-status-error-100 dark:bg-status-error-dark';
          } else if (!isAnswered && selectedIndex === index) {
            btnStyle = 'border-primary-main-600 bg-primary-main-50 dark:bg-primary-main-dark text-layout-black dark:text-layout-white';
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
