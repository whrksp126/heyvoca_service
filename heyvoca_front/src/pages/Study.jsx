import React from 'react';
import { useLocation } from 'react-router-dom';
import StudyMain from '../components/study/StudyMain';

const Study = () => {
  "use memo";

  const { state } = useLocation();
  const words = state?.words || [];
  // plant(새 씨앗 심기) "만나기" 단계 — usePlantSession이 미리 받아 둔 5단어를 그대로
  // StudyMain에 보여준다. 끝나면(handleEnd) StudyMain이 이 세션 정보로 ② 테스트
  // (TakeTest testType='plant')를 자동으로 연다.
  const plantSession = state?.plantSession
    ? { sessionId: state.plantSessionId ?? null, words }
    : null;

  return (
    <div>
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <StudyMain words={words} plantSession={plantSession} />
    </div>
  );
};

export default Study;
