import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, X } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';
import { playSuccessSound, playErrorSound } from '../../utils/audio';

/**
 * 게스트 맛보기 학습 (온보딩 전용, 서버 로깅 없음).
 * words: /onboarding/trial-words 응답. 각 문제 multipleChoice.
 * onComplete(answers) — answers: [{ word_id, correct }]
 */
const TrialLesson = ({ words = [], onComplete }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [answered, setAnswered] = useState(false);
  const answersRef = React.useRef([]);

  const q = words[idx];
  if (!q) return null;

  const total = words.length;

  const handlePick = (i) => {
    if (answered) return;
    const correct = i === q.resultIndex;
    setSelected(i);
    setAnswered(true);
    vibrate({ type: correct ? 'notificationSuccess' : 'notificationError' });
    if (correct) playSuccessSound(); else playErrorSound();
    answersRef.current.push({ word_id: q.id, correct });

    setTimeout(() => {
      if (idx + 1 >= total) {
        onComplete?.(answersRef.current);
      } else {
        setIdx(idx + 1);
        setSelected(null);
        setAnswered(false);
      }
    }, correct ? 750 : 1400);
  };

  const optionClass = (i) => {
    if (!answered) return 'border-layout-gray-100 dark:border-layout-gray-dark';
    if (i === q.resultIndex) return 'border-status-success-500 bg-status-success-100 text-status-success-700';
    if (i === selected) return 'border-status-error-500 bg-status-error-100 dark:bg-status-error-dark text-status-error-600';
    return 'border-layout-gray-100 dark:border-layout-gray-dark opacity-50';
  };

  return (
    <div className="flex flex-col flex-1 w-full">
      {/* 진행 바 */}
      <div className="flex items-center gap-[8px] mb-[20px]">
        <div className="relative flex-1 h-[6px] rounded-[3px] bg-layout-gray-50 dark:bg-layout-gray-dark overflow-hidden">
          <motion.div
            className="absolute left-0 top-0 h-full rounded-[3px] bg-primary-main-600"
            animate={{ width: `${((idx + (answered ? 1 : 0)) / total) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-[12px] font-[600] text-layout-gray-300">{idx + 1} / {total}</span>
      </div>

      {/* 단어 카드 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          className="flex items-center justify-center rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark py-[36px] px-[16px] mb-[18px]"
        >
          <span className="text-[26px] font-[800] text-layout-black dark:text-layout-white text-center break-words">
            {q.origin}
          </span>
        </motion.div>
      </AnimatePresence>

      <p className="text-[14px] font-[700] text-layout-black dark:text-layout-white mb-[10px]">뜻을 고르세요</p>

      <div className="flex flex-col gap-[8px]">
        {q.options.map((opt, i) => (
          <motion.button
            key={i}
            type="button"
            onClick={() => handlePick(i)}
            whileTap={!answered ? { scale: 0.98 } : undefined}
            className={`
              flex items-center gap-[8px] w-full text-left
              px-[14px] py-[13px] rounded-[10px] border-[1.5px]
              text-[14px] font-[600] text-layout-black dark:text-layout-white
              ${optionClass(i)}
            `}
          >
            {answered && i === q.resultIndex && <Circle size={14} weight="bold" className="text-status-success-600 flex-shrink-0" />}
            {answered && i === selected && i !== q.resultIndex && <X size={14} weight="bold" className="text-status-error-600 flex-shrink-0" />}
            <span>{opt}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default TrialLesson;
