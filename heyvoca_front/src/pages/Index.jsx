// src/pages/Home.js
// 사용자가 초기 앱에 접속 시 로그인 상태와 현재 버전, 데이터 상태를 확인하고 필요한 데이터를 정리 후 로그인 또는 해당 페이지로 이동 시켜야함
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import lottie from 'lottie-web';
import animationData from '../assets/lottie/heyvoca logo-01.json';
import '../index.css';

const Index = () => {
  const navigate = useNavigate();
  const { getUserProfile, isUserProfileLoading, userStorageData, setUserStorageData } = useUser();

  useEffect(() => {
    if(userStorageData?.status == "login"){
      if(isUserProfileLoading) return;
      const userProfile = getUserProfile();
      if(userProfile.id == null){
        setUserStorageData({
          google_id : null,
          name : null,
          email : null,
          status : "logout",
        })
        navigate('/login');  
        return
      }else if(userProfile.userName == null){
        console.log("userProfile,",userProfile);
        navigate('/initial-profile');
        return;
      }
      navigate('/home');
    }else{
      navigate('/login');
    }
  }, [navigate, isUserProfileLoading, getUserProfile, userStorageData]);
  
  
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
