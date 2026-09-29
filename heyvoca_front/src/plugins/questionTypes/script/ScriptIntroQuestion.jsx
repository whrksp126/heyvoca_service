// src/plugins/questionTypes/script/ScriptIntroQuestion.jsx
//
// 글자 학습 ① 만나기 — 채점 없음. Main.jsx는 이 유형(questionType==='scriptIntro')을
// wordIntro와 같은 방식으로 처리한다(NO_GRADE_QUESTION_TYPES — plugins/questionTypes/index.js):
// onComplete를 전용 핸들러로 바꿔 넘겨 정오답 집계·재출제·로깅을 전혀 타지 않는다.
//
// UI·TTS는 기존 components/script/IntroCard.jsx를 그대로 재사용한다 — 이 컴포넌트는
// question(학습하기 word 모양)을 IntroCard가 기대하는 step 모양으로 감싸기만 한다.
// confusables는 utils/scriptQuestions.js buildScriptIntroQuestion이 빌드 시점에
// 이미 계산해 question.confusables에 붙여 둔다.

import React, { useMemo } from 'react';
import IntroCard from '../../../components/script/IntroCard';

const ScriptIntroQuestion = ({ question, onComplete }) => {
  "use memo";

  const step = useMemo(() => ({
    id: `scriptIntro-${question.vocaIndexId ?? question.id}`,
    script: question.script,
    item: question.item,
    confusables: question.confusables || [],
  }), [question]);

  return <IntroCard step={step} onNext={onComplete} />;
};

export default ScriptIntroQuestion;
