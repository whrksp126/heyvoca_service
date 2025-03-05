import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Notepad, Storefront, Exam, User } from "@phosphor-icons/react";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <footer className="fixed bottom-0 w-full bg-background dark:bg-background-dark border-t border-border dark:border-border-dark">
      <ul className="flex justify-around items-center h-[60px] max-w-md mx-auto">
        <li>
          <button onClick={() => navigate('/vocabulary')} 
                  className="flex flex-col items-center bg-background dark:bg-background-dark">
            <Notepad 
              weight={location.pathname === '/vocabulary' ? "fill" : "regular"} 
              className={`w-6 h-6 ${location.pathname === '/vocabulary' ? 'text-heyvocaPink' : 'text-[#999] dark:text-[#666]'}`} 
            />
            <span className={`text-[10px] mt-1 ${
              location.pathname === '/vocabulary' ? 'text-heyvocaPink font-bold' : 'text-[#999] dark:text-[#666]'
            }`}>
              단어장
            </span>
          </button>
        </li>
        <li>
          <button onClick={() => navigate('/store')} 
                  className="flex flex-col items-center bg-background dark:bg-background-dark">
            <Storefront 
              weight={location.pathname === '/store' ? "fill" : "regular"} 
              className={`w-6 h-6 ${location.pathname === '/store' ? 'text-heyvocaPink' : 'text-[#999] dark:text-[#666]'}`} 
            />
            <span className={`text-[10px] mt-1 ${
              location.pathname === '/store' ? 'text-heyvocaPink font-bold' : 'text-[#999] dark:text-[#666]'
            }`}>
              스토어
            </span>
          </button>
        </li>
        <li>
          <button onClick={() => navigate('/class')} 
                  className="flex flex-col items-center bg-background dark:bg-background-dark">
            <Exam 
              weight={location.pathname === '/class' ? "fill" : "regular"} 
              className={`w-6 h-6 ${location.pathname === '/class' ? 'text-heyvocaPink' : 'text-[#999] dark:text-[#666]'}`} 
            />
            <span className={`text-[10px] mt-1 ${
              location.pathname === '/class' ? 'text-heyvocaPink font-bold' : 'text-[#999] dark:text-[#666]'
            }`}>
              클래스
            </span>
          </button>
        </li>
        <li>
          <button onClick={() => navigate('/mypage')} 
                  className="flex flex-col items-center bg-background dark:bg-background-dark">
            <User 
              weight={location.pathname === '/mypage' ? "fill" : "regular"} 
              className={`w-6 h-6 ${location.pathname === '/mypage' ? 'text-heyvocaPink' : 'text-[#999] dark:text-[#666]'}`} 
            />
            <span className={`text-[10px] mt-1 ${
              location.pathname === '/mypage' ? 'text-heyvocaPink font-bold' : 'text-[#999] dark:text-[#666]'
            }`}>
              마이
            </span>
          </button>
        </li>
      </ul>
    </footer>
  );
};

export default BottomNav; 