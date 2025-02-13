/*
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { removeToken } from '../utils/auth';
import Btn from '../components/component/Btn';

const MyPage = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    removeToken();
    navigate('/');
  };

  return (
    <div 
      className="
        flex flex-col items-center 
        min-h-screen 
        mx-auto
        bg-gray-50
        pb-20
      "
    >
      <div className="w-full max-w-md p-4">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">마이페이지</h2>
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <div className="flex items-center mb-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold">테스트 계정</h3>
              <p className="text-gray-500">test@example.com</p>
            </div>
          </div>
          <Btn text="로그아웃" color="red" onClick={handleLogout} />
        </div>
      </div>
    </div>
  );
};

export default MyPage; 
*/


/*
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { removeToken } from '../utils/auth';
import Btn from '../components/component/Btn';

const MyPage = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    removeToken();
    navigate('/');
  };

  return (
    <div 
      className="
        flex flex-col items-center 
        min-h-screen 
        mx-auto
        bg-gray-50
        pb-20
      "
    >
      <div className="w-full max-w-md p-4">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">마이페이지</h2>
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <div className="flex items-center mb-4">
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-semibold">테스트 계정</h3>
              <p className="text-gray-500">test@example.com</p>
            </div>
          </div>
          <Btn text="로그아웃" color="red" onClick={handleLogout} />
        </div>
      </div>
    </div>
  );
};

export default MyPage; 
*/


import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../myPage.css';
import { UserCircle, SunDim, TextAlignJustify, HardDrives, Bell, CaretRight, Notepad, Storefront, Exam, User } from "@phosphor-icons/react";

const Mypage = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState("라이트");
  const [notifications, setNotifications] = useState("on");

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("user"));
    if (userData) {
      setUser(userData);
    }
  }, []);

  return (
    <div className="mypage-container">
      <header>
        <div className="container">
          <h2>마이페이지</h2>
        </div>
      </header>
      <main>
        <ul>
          <li onClick={() => navigate('/account')}>
            <div className="left">
              <UserCircle className="icon" />
              <span>계정</span>
            </div>
            <div className="right">
              <span className="user_email">{user?.email || "로그인 필요"}</span>
              <CaretRight className="icon" />
            </div>
          </li>
          <li onClick={() => setTheme(theme === "라이트" ? "다크" : "라이트") }>
            <div className="left">
              <SunDim className="icon" />
              <span>테마</span>
            </div>
            <div className="right">
              <span>{theme}</span>
              <CaretRight className="icon" />
            </div>
          </li>
          <li onClick={() => navigate('/example_settings')}>
            <div className="left">
              <TextAlignJustify className="icon" />
              <span>예문 설정</span>
            </div>
            <div className="right">
              <span>항상 보기</span>
              <CaretRight className="icon" />
            </div>
          </li>
          <li onClick={() => navigate('/vocabulary_backup')}>
            <div className="left">
              <HardDrives className="icon" />
              <span>단어장 백업</span>
            </div>
            <div className="right">
              <CaretRight className="icon" />
            </div>
          </li>
          <li onClick={() => setNotifications(notifications === "on" ? "off" : "on") }>
            <div className="left">
              <Bell className="icon" />
              <span>푸시 알림</span>
            </div>
            <div className="right">
              <span>{notifications}</span>
              <CaretRight className="icon" />
            </div>
          </li>
        </ul>
      </main>
      <footer>
        <nav>
          <ul>
            <li onClick={() => navigate('/vocabulary_list')}>
              <Notepad className="icon" />
              <span>단어장</span>
            </li>
            <li onClick={() => navigate('/vocabulary_store')}>
              <Storefront className="icon" />
              <span>서점</span>
            </li>
            <li onClick={() => navigate('/test')}>
              <Exam className="icon" />
              <span>테스트</span>
            </li>
            <li className="active">
              <User className="icon" />
              <span>마이페이지</span>
            </li>
          </ul>
        </nav>
      </footer>
    </div>
  );
};

export default Mypage;
