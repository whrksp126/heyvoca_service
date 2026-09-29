// src/plugins/questionTypes/script/ScriptChoiceQuestion.jsx
//
// 글자 학습 ② 보고 고르기(scriptSeePick) / ③ 듣고 고르기(scriptListenPick) — 학습하기
// (TakeTest) 문제 유형 플러그인. UI·재생·판정 자체는 기존 components/script/ChoiceCard.jsx를
// 그대로 재사용하고, 이 컴포넌트는 Main.jsx의 onComplete([result], opts)/onCardMatched(result)
// 계약으로 이어준다 — plugins/questionTypes/fillInTheBlank/FillInTheBlankQuestion.jsx와 같은
// 다리 역할(그 컴포넌트의 "채점 즉시 onCardMatched → 게이트 통과 후 onComplete" 패턴을 그대로 따른다).
//
// 글자 하나 = 단어 하나(2026-09-30) — /study/log·FSRS·농장 성장은 Main.jsx의 공용 경로
// (processCardWord)를 그대로 탄다. 별도 로깅 코드가 이 파일에는 없다.

import React, { useMemo, useRef, useState } from 'react';
import ChoiceCard from '../../../components/script/ChoiceCard';
import { getAdvanceDelay } from '../../../utils/studyTiming';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';

const ScriptChoiceQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  "use memo";

  const [answered, setAnswered] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const startTimeRef = useRef(Date.now());
  const advanceGate = useStudyAdvanceGate();
  // 넘어갈 때는 최신 onComplete를 부른다 — FillInTheBlankQuestion과 같은 이유
  // (채점 순간의 함수를 들고 있으면 그 사이 큐에 들어간 재출제 문제를 모르는 옛
  // testQuestions로 세션 종료를 판정하게 된다).
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const kind = question.questionType === 'scriptListenPick' ? 'listenPick' : 'seePick';
  const step = useMemo(() => ({
    id: `${question.questionType}-${question.vocaIndexId ?? question.id}`,
    script: question.script,
    item: question.item,
    options: question.options,
    answerIndex: question.resultIndex,
    type: kind,
  }), [question, kind]);

  // 농장 상태 바 — 카드 맞추기·빈칸 채우기와 같은 경로(Main.processCardWord → cardFarmByWordId[wordId]).
  // 글자는 시듦/썩음 개념이 없다(사용자 결정 2026-09-30) — 서버가 어떤 health를 보내든
  // 항상 건강한 그림만 보이도록 여기서 정규화한다(XP 막대·델타는 그대로 쓴다).
  const rawFarm = answered ? (farmByWordId?.[question.id] ?? null) : null;
  const farm = rawFarm ? { ...rawFarm, health: 'FRESH' } : null;

  const handleSelect = (index) => {
    if (answered) return;
    const correct = index === question.resultIndex;
    setSelectedIndex(index);
    setAnswered(true);

    // FSRS 업데이트는 /study/log(Main.processCardWord)에서 처리 — 여기서는 결과만 표시.
    question.isCorrect = correct;
    question.userResultIndex = index;

    const timeTakenMs = Date.now() - startTimeRef.current;
    const result = {
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: correct,
      timeTakenMs,
      updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
    };

    // 채점 즉시 부모에 알린다(카드 맞추기의 onCardMatched와 같은 경로) — 로그 전송·농장
    // payload·재출제가 이때 일어나야 상태 바가 채점 직후 뜬다.
    const processedNow = typeof onCardMatched === 'function';
    if (processedNow) onCardMatched(result);

    // ChoiceCard가 채점 후 정답 발음을 재생한다 — 그 재생이 끝날 때까지 전환을 붙잡는다
    // (ChoiceCard의 onSettled 콜백에서 advanceGate.ttsEnd()를 부른다. FillInTheBlankQuestion의
    // target==='word' 재생 게이트와 같은 원리).
    advanceGate.ttsBegin();

    advanceGate.arm({
      minDelayMs: getAdvanceDelay(correct),
      onAdvance: () => onCompleteRef.current?.([result], { processed: processedNow }),
    });
  };

  return (
    <ChoiceCard
      step={step}
      answered={answered}
      selectedIndex={selectedIndex}
      onSelect={handleSelect}
      onSettled={() => advanceGate.ttsEnd()}
      farm={farm}
      onFarmAnimStart={advanceGate.farmStarted}
      onFarmSettled={advanceGate.farmSettled}
    />
  );
};

export default ScriptChoiceQuestion;
