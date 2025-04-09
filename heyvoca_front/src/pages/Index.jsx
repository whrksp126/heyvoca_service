// src/pages/Home.js
// 사용자가 초기 앱에 접속 시 로그인 상태와 현재 버전, 데이터 상태를 확인하고 필요한 데이터를 정리 후 로그인 또는 해당 페이지로 이동 시켜야함
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    console.log('Index 페이지 접속')
    navigate('/home');
  }, [navigate]);
  
  return (
    <div>
    </div>
  );
};

export default Index;
