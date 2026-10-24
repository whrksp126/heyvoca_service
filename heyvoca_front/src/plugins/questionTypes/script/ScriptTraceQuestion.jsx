// src/plugins/questionTypes/script/ScriptTraceQuestion.jsx
//
// 글자 학습 ④ 따라 쓰기(scriptTrace) — 학습하기(TakeTest) 문제 유형 플러그인. 획순 판정 자체는
// 기존 components/script/TraceCard.jsx(+StrokeTracer.jsx)를 그대로 재사용한다 — 손을 뗀 순간
// 자동 채점되고, 모든 획을 통과하면 항상 정답(2026-09-30 결정).
//
// TraceCard 자신의 결과 연출(ResultMark)이 끝나면 onDone이 불린다 — 그 시점에 /study/log를
// 태우는 공용 경로(onCardMatched → Main.processCardWord)로 넘긴다. 2026-10-24(이슈 #15):
// 자동으로 넘어가지 않고 "다음" 버튼을 눌러야 진행하며, 농장 상태 바(작물·XP)는 보여주지 않는다
// (글자 학습에는 망각곡선 개념이 맞지 않는다).

import React, { useRef, useState } from 'react';
import TraceCard from '../../../components/script/TraceCard';
import ScriptNextButton from '../../../components/script/ScriptNextButton';

const ScriptTraceQuestion = ({ question, onComplete, onCardMatched }) => {
  "use memo";

  const [done, setDone] = useState(false);
  const [awaitNext, setAwaitNext] = useState(false);
  const nextRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const step = {
    id: `scriptTrace-${question.vocaIndexId ?? question.id}-${question.traceVariant || ''}`,
    script: question.script,
    item: question.item,
    traceVariant: question.traceVariant,
  };

  // opts.manual — 카드 안의 "다음" 버튼(요음 조합 완료·획 데이터 없음)으로 끝난 경우.
  // 사용자가 이미 다음을 눌렀으니 아래 "다음" 버튼을 한 번 더 띄우지 않고 바로 넘어간다.
  const handleDone = (opts) => {
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

    const advance = () => onCompleteRef.current?.([result], { processed: processedNow });
    if (opts?.manual) { advance(); return; }
    nextRef.current = advance;
    setAwaitNext(true);
  };

  return (
    <div className="flex flex-col gap-[10px] w-full h-full">
      <div className="flex-1 min-h-0">
        <TraceCard step={step} onDone={handleDone} />
      </div>
      <ScriptNextButton show={awaitNext} onNext={() => { const go = nextRef.current; nextRef.current = null; go?.(); }} />
    </div>
  );
};

export default ScriptTraceQuestion;
