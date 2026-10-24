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
import ScriptNextButton from '../../../components/script/ScriptNextButton';

const ScriptChoiceQuestion = ({ question, onComplete, onCardMatched }) => {
  "use memo";

  const [answered, setAnswered] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const startTimeRef = useRef(Date.now());
  // 채점 후 "다음" 버튼으로 진행(2026-10-24 이슈 #15 — 자동 진행 폐지).
  const nextRef = useRef(null);
  // 넘어갈 때는 최신 onComplete를 부른다 — FillInTheBlankQuestion과 같은 이유
  // (채점 순간의 함수를 들고 있으면 그 사이 큐에 들어간 재출제 문제를 모르는 옛
  // testQuestions로 세션 종료를 판정하게 된다).
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // 조합 단어 문제(scriptWordRead/scriptWordListen, 2026-10 복습 응용)도 같은 카드로 —
  // 글자 대신 단어(question.wordPrompt)를 보여주거나 읽어 준다(utils/scriptQuestions.js buildScriptWordQuestion).
  const qt = question.questionType;
  const kind = (qt === 'scriptListenPick' || qt === 'scriptWordListen') ? 'listenPick' : 'seePick';
  const wp = question.wordPrompt;
  const step = useMemo(() => ({
    id: `${question.questionType}-${question.vocaIndexId ?? question.id}-${wp?.reading ?? ''}`,
    script: question.script,
    item: question.item,
    options: question.options,
    answerIndex: question.resultIndex,
    type: kind,
    prompt: wp && qt === 'scriptWordRead'
      ? { text: wp.reading, sub: wp.real ? [wp.word && wp.word !== wp.reading ? wp.word : null, wp.meaning].filter(Boolean).join(' · ') : null }
      : null,
    speakText: wp ? wp.reading : null,
  }), [question, kind, wp, qt]);

  // 글자에는 작물·성장 단계(망각곡선)를 보여주지 않는다(2026-10-24 이슈 #15) — 농장 상태 바 없음.

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

    nextRef.current = () => onCompleteRef.current?.([result], { processed: processedNow });
  };

  return (
    <div className="flex flex-col gap-[16px] w-full h-full">
      <div className="flex-1 min-h-0">
        <ChoiceCard
          step={step}
          answered={answered}
          selectedIndex={selectedIndex}
          onSelect={handleSelect}
        />
      </div>
      <ScriptNextButton show={answered} onNext={() => { const go = nextRef.current; nextRef.current = null; go?.(); }} />
    </div>
  );
};

export default ScriptChoiceQuestion;
