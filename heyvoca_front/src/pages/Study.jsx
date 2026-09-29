import React from 'react';
import { useLocation } from 'react-router-dom';
import StudyMain from '../components/study/StudyMain';

const Study = () => {
  "use memo";

  const { state } = useLocation();
  const words = state?.words || [];

  return (
    <div>
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <StudyMain words={words} />
    </div>
  );
};

export default Study;
