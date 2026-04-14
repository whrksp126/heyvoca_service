import React from 'react';
import Header from '../components/dictionary/Header';
import Main from '../components/dictionary/Main';
import BottomNav from '../components/component/BottomNav';

const Dictionary = () => {
  return (
    <div>
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <Header />
      <Main />
      <BottomNav />
    </div>
  );
};

export default Dictionary;
