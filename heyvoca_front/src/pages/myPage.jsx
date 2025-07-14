// src/pages/Home.js
import React from 'react';
import Header from '../components/myPage/Header';
import Main from '../components/myPage/Main';
import BottomNav from '../components/component/BottomNav';
const MyPage = () => {
  return (
    <div>
      <Header />
      <Main />
      <BottomNav />
    </div>
  );
};

export default MyPage;