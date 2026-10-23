// src/plugins/questionTypes/script/ScriptListenWriteQuestion.jsx
//
// 글자 복습 "듣고 쓰기"(scriptListenWrite, 2026-10) — 학습하기(TakeTest) 문제 유형 플러그인.
// 판·채점은 components/script/FreeWriteBoard.jsx(+utils/scriptWriteGrader.js). 따라 쓰기
// (ScriptTraceQuestion)와 달리 정답/오답이 있다 — 채점 순간 onCardMatched 로 공용 경로
// (Main.processCardWord → 글자 세션은 종료 시 글자당 1회 /study/log)에 알리고, 결과 연출
// (오답이면 정답 획 보여주기)이 끝나면 onComplete 로 넘어간다.

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import FreeWriteBoard from '../../../components/script/FreeWriteBoard';
import { getStrokeEntry, getAlphabetStrokeEntries } from '../../../utils/scriptData';
import { CARD_ENTER_INITIAL, CARD_ENTER_ANIMATE, CARD_ENTER_TRANSITION } from '../../../utils/studySlideMotion';

const ScriptListenWriteQuestion = ({ question, onComplete, onCardMatched }) => {
  "use memo";

  const startRef = useRef(Date.now());
  const resultRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const { script, item, traceVariant } = question;
  const isAlphabet = script === 'alphabet';
  const entry = isAlphabet
    ? getAlphabetStrokeEntries(item)[traceVariant === 'lower' ? 'lower' : 'upper'][0]
    : getStrokeEntry(script, item)[0];

  const handleGraded = (correct) => {
    question.isCorrect = correct;
    question.userResultIndex = correct ? 0 : -1;
    const result = {
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: correct,
      timeTakenMs: Date.now() - startRef.current,
      updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
    };
    resultRef.current = result;
    if (typeof onCardMatched === 'function') onCardMatched(result);
  };

  const handleDone = () => {
    const result = resultRef.current;
    if (!result) return;
    onCompleteRef.current?.([result], { processed: typeof onCardMatched === 'function' });
  };

  return (
    <motion.div
      initial={CARD_ENTER_INITIAL}
      animate={CARD_ENTER_ANIMATE}
      transition={CARD_ENTER_TRANSITION}
      className="flex flex-col w-full h-full"
    >
      {entry ? (
        <FreeWriteBoard
          script={script}
          item={item}
          entry={entry}
          caseVariant={isAlphabet ? (traceVariant === 'lower' ? 'lower' : 'upper') : null}
          replayKey={`scriptListenWrite-${question.vocaIndexId ?? question.id}-${traceVariant || ''}${question.isRetry ? '-retry' : ''}`}
          onGraded={handleGraded}
          onDone={handleDone}
        />
      ) : null}
    </motion.div>
  );
};

export default ScriptListenWriteQuestion;
