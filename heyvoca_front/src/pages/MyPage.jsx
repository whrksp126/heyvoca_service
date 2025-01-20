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