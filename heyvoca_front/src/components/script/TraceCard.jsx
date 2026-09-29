// src/components/script/TraceCard.jsx — StrokeTracer를 세션 스텝 모양에 맞춰 감싼다.
// 알파벳은 대문자·소문자를 각각 다른 스텝(step.traceVariant)으로 받아 그에 맞는 획
// 데이터를 골라 넘긴다(2026-09-29 QA 4차 — scriptSession.js buildTraceStep 참고).

import React from 'react';
import { motion } from 'framer-motion';
import StrokeTracer from './StrokeTracer';
import { getStrokeEntry, getAlphabetStrokeEntries } from '../../utils/scriptData';
import { CARD_ENTER_INITIAL, CARD_ENTER_ANIMATE, CARD_ENTER_TRANSITION } from '../../utils/studySlideMotion';

const TraceCard = ({ step, onDone }) => {
  "use memo";
  const { script, item, traceVariant } = step;
  const compound = Array.isArray(item.compound);
  const isAlphabet = script === 'alphabet' && !compound;
  const entries = isAlphabet
    ? (getAlphabetStrokeEntries(item)[traceVariant === 'lower' ? 'lower' : 'upper'])
    : getStrokeEntry(script, item);

  return (
    // TakeTest Main.jsx 문제 카드와 같은 등장 모션(살짝 커지며 나타남, 2026-09-29 QA 5차).
    <motion.div
      initial={CARD_ENTER_INITIAL}
      animate={CARD_ENTER_ANIMATE}
      transition={CARD_ENTER_TRANSITION}
      className="flex flex-col gap-[10px] w-full h-full"
    >
      {entries.length > 0 ? (
        <StrokeTracer
          entries={entries}
          compound={compound}
          caseVariant={isAlphabet ? (traceVariant === 'lower' ? 'lower' : 'upper') : null}
          replayKey={step.id}
          onDone={onDone}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-[18px] flex-1 min-h-0 rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
          <span className="text-[72px] font-[700] text-layout-black dark:text-layout-white">
            {traceVariant === 'lower' ? (item.lower || item.char) : item.char}
          </span>
          <motion.button
            type="button"
            onClick={onDone}
            className="h-[52px] px-[32px] rounded-[12px] bg-primary-main-600 text-layout-white text-[16px] font-[700]"
            whileTap={{ scale: 0.97 }}
          >
            다음
          </motion.button>
        </div>
      )}
    </motion.div>
  );
};

export default TraceCard;
