// src/plugins/questionTypes/script/ScriptTraceQuestion.jsx
//
// 글자 학습 ④ 따라 쓰기(scriptTrace) — 학습하기(TakeTest) 문제 유형 플러그인. 획순 판정 자체는
// 기존 components/script/TraceCard.jsx(+StrokeTracer.jsx)를 그대로 재사용한다 — 손을 뗀 순간
// 자동 채점되고, 모든 획을 통과하면 항상 정답(2026-09-30 결정: "완료 시 O 후 자동 다음").
//
// TraceCard 자신의 결과 연출(ResultMark)이 끝나면 onDone이 불린다 — 그 시점에 /study/log를
// 태우는 공용 경로(onCardMatched → Main.processCardWord)로 넘기고, 다른 유형과 같은 농장
// 상태 바(XP)를 잠깐 보여준 뒤 onComplete로 다음 문제로 넘어간다.

import React, { useRef, useState } from 'react';
import TraceCard from '../../../components/script/TraceCard';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import { getAdvanceDelay } from '../../../utils/studyTiming';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';

const ScriptTraceQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  "use memo";

  const [done, setDone] = useState(false);
  const advanceGate = useStudyAdvanceGate();
  const resumeReplayKey = useResumeReplayKey();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const step = {
    id: `scriptTrace-${question.vocaIndexId ?? question.id}-${question.traceVariant || ''}`,
    script: question.script,
    item: question.item,
    traceVariant: question.traceVariant,
  };

  // 글자는 시듦/썩음 개념이 없다(사용자 결정 2026-09-30) — 항상 건강한 그림만 보인다
  // (XP 막대·델타는 그대로 쓴다).
  const rawFarm = done ? (farmByWordId?.[question.id] ?? null) : null;
  const farm = rawFarm ? { ...rawFarm, health: 'FRESH' } : null;

  const handleDone = () => {
    if (done) return;
    setDone(true);

    // 따라 쓰기는 판정 자체가 없다 — 모든 획을 통과해야만 onDone이 불리므로 항상 정답.
    question.isCorrect = true;
    question.userResultIndex = 0;

    const result = {
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: true,
      timeTakenMs: 0,
      updateData: { fsrs: question.fsrs, isCorrect: true, updatedAt: new Date().toISOString() },
    };
    const processedNow = typeof onCardMatched === 'function';
    if (processedNow) onCardMatched(result);

    advanceGate.arm({
      minDelayMs: getAdvanceDelay(true),
      onAdvance: () => onCompleteRef.current?.([result], { processed: processedNow }),
    });
  };

  return (
    <div className="flex flex-col gap-[10px] w-full h-full">
      <div className="flex-1 min-h-0">
        <TraceCard step={step} onDone={handleDone} />
      </div>
      {farm && (
        <div className="relative flex-shrink-0">
          <FarmResultBar
            farm={farm}
            replayKey={resumeReplayKey}
            className="relative"
            onAnimStart={advanceGate.farmStarted}
            onSettled={advanceGate.farmSettled}
          />
        </div>
      )}
    </div>
  );
};

export default ScriptTraceQuestion;
