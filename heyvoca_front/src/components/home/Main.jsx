// src/components/home/main
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Btn from '../component/Btn';
import * as common from '../../utils/common';
import { isLoggedIn } from '../../utils/auth';
console.log(common.backendUrl)

const Main = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Check login status and redirect if logged in
    if (isLoggedIn()) {
      navigate('/vocabulary');
    }
  }, [navigate]);

  const handleRegisterClick = () => {
    navigate('/register');
  };

  const handleLoginClick = () => {
    navigate('/login');
  };
  
  return (
    <div className="
      flex flex-col
      max-w-96 h-screen
      p-3
      pb-5
    ">
      <div className="flex flex-col flex-1">
        <h1 className="
          flex-1
          mb-4
          text-2xl font-bold text-cyan-900 text-center
          select-none
        ">
          영어 단어장으로 시작하는 새로운 영어 공부!!
        </h1>
        <div className="flex flex-col gap-3">
          <Btn color="white" text="로그인" onClick={handleLoginClick} />
        </div>
      </div>
    </div>
  )
}
export default Main;