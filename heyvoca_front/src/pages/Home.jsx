// src/pages/Home.js
import React from 'react';
import Main from '../components/home/Main';
// BottomNav는 components/TabShell.jsx가 탭 전체에 걸쳐 한 번만 그린다
// (5탭이 동시에 마운트되므로 각 페이지가 각자 그리면 5개가 겹친다).
const Home = () => {

  return (
    <div>
      <Main />
    </div>
  );
};

export default Home;
