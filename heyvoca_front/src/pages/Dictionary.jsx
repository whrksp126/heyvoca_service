import React from 'react';
import Header from '../components/dictionary/Header';
import Main from '../components/dictionary/Main';
// BottomNav는 components/TabShell.jsx가 탭 전체에 걸쳐 한 번만 그린다
// (5탭이 동시에 마운트되므로 각 페이지가 각자 그리면 5개가 겹친다).

const Dictionary = () => {
  return (
    <div>
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <Header />
      <Main />
    </div>
  );
};

export default Dictionary;
