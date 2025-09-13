// src/pages/Home.js
// 사용자가 초기 앱에 접속 시 로그인 상태와 현재 버전, 데이터 상태를 확인하고 필요한 데이터를 정리 후 로그인 또는 해당 페이지로 이동 시켜야함
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import lottie from 'lottie-web';
import animationData from '../assets/lottie/heyvoca logo-01.json';
import '../index.css';

const Index = () => {
  const navigate = useNavigate();
  const { isLogin, isLoginChecked, userProfile } = useUser();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    if (isLoginChecked) {
      if (isLogin && userProfile) {
        if (userProfile.id == null) {
          // 유저 프로필이 없으면 로그아웃 처리
          navigate('/login');
          return;
        } else if (userProfile.username == null) {
          console.log("userProfile,", userProfile);
          navigate('/initial-profile');
          return;
        }
        navigate('/home');
      } else {
        // 로그인되지 않은 상태
        navigate('/login');
      }
      
      setIsCheckingAuth(false);
    }
  }, [navigate, isLogin, isLoginChecked, userProfile]);
  
  
  useEffect(() => {
    const container = document.getElementById("lottie-container");
    if (container) {
      const anim = lottie.loadAnimation({
        container,
        renderer: "svg",
        loop: true,
        autoplay: true,
        animationData,
      });
      return () => anim.destroy();
    }
  }, []);


  // 인증 확인 중이면 로딩 표시
  if (isCheckingAuth) {
    return (
      <div className="bg-[#FFEFFA] w-full h-screen absolute top-0 left-0 flex flex-col items-center">
        <div
          id="lottie-container"
          className="w-[240px] absolute top-[150px] left-1/2 transform -translate-x-1/2"
        ></div>
      </div>
    );
  }

  return (
    <div className="bg-[#FFEFFA] w-full h-screen absolute top-0 left-0 flex flex-col items-center">
      <div
        id="lottie-container"
        className="w-[240px] absolute top-[150px] left-1/2 transform -translate-x-1/2"
      ></div>
    </div>
  );
};

export default Index;
