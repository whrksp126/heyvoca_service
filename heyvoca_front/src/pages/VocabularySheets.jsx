import React from 'react';
import Main from '../components/vocabularySheets/Main';
import BottomNav from '../components/component/BottomNav';
import Header from '../components/vocabularySheets/Header';

const VocabularySheets = () => {
  return (
    <>
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <Header />
      <Main />
      <BottomNav />
    </>
  );
};

export default VocabularySheets; 