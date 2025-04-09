import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import BottomNav from '../../components/component/BottomNav';
import Header from '../../components/myPage/Header';
import Main from '../../components/myPage/Main';
const Mypage = () => {
  return (
    <div>
      <Header />
      <Main />
      
      <BottomNav />
    </div>
  );
};

export default Mypage;
