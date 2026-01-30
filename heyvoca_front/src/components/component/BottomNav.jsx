import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Notepad, Storefront, Exam, User, House } from "@phosphor-icons/react";
import { vibrate } from '../../utils/osFunction';

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <footer
      className="
        fixed bottom-0 
        w-full 
        border-t border-border 
        bg-background 

        dark:bg-background-dark 
        dark:border-border-dark
        "
    >
      <ul className="flex justify-around items-center h-[70px] max-w-md mx-auto">
        <li
          onClick={() => {
            vibrate({ duration: 5 });
            navigate('/home');
          }}
          className="flex items-center justify-center flex-1 w-full h-full"
        >
          <div
            className="
              flex flex-col items-center bg-background dark:bg-background-dark
            "
          >
            <House
              weight="fill"
              className={`w-6 h-6 ${location.pathname === '/home' ? 'text-heyvocaPink' : 'text-[#999] dark:text-[#666]'}`}
            />
            <span className={`text-[10px] mt-1 ${location.pathname === '/home' ? 'text-heyvocaPink font-bold' : 'text-[#999] dark:text-[#666]'
              }`}>
              홈
            </span>
          </div>
        </li>
        <li
          onClick={() => {
            vibrate({ duration: 5 });
            navigate('/vocabulary-sheets');
          }}
          className="flex items-center justify-center flex-1 w-full h-full"
        >
          <div
            className="
              flex flex-col items-center bg-background dark:bg-background-dark
            "
          >
            <Notepad
              weight="fill"
              className={`w-6 h-6 ${location.pathname === '/vocabulary-sheets' ? 'text-heyvocaPink' : 'text-[#999] dark:text-[#666]'}`}
            />
            <span className={`text-[10px] mt-1 ${location.pathname === '/vocabulary-sheets' ? 'text-heyvocaPink font-bold' : 'text-[#999] dark:text-[#666]'
              }`}>
              단어장
            </span>
          </div>
        </li>
        <li
          onClick={() => {
            vibrate({ duration: 5 });
            navigate('/book-store');
          }}
          className="flex items-center justify-center flex-1 w-full h-full"
        >
          <div
            className="
              flex flex-col items-center bg-background dark:bg-background-dark
            "
          >
            <Storefront
              weight="fill"
              className={`w-6 h-6 ${location.pathname === '/book-store' ? 'text-heyvocaPink' : 'text-[#999] dark:text-[#666]'}`}
            />
            <span className={`text-[10px] mt-1 ${location.pathname === '/book-store' ? 'text-heyvocaPink font-bold' : 'text-[#999] dark:text-[#666]'
              }`}>
              서점
            </span>
          </div>
        </li>
        <li
          onClick={() => {
            vibrate({ duration: 5 });
            navigate('/class');
          }}
          className="flex items-center justify-center flex-1 w-full h-full"
        >
          <div
            className="
              flex flex-col items-center bg-background dark:bg-background-dark">
            <Exam
              weight="fill"
              className={`w-6 h-6 ${location.pathname === '/class' ? 'text-heyvocaPink' : 'text-[#999] dark:text-[#666]'}`}
            />
            <span className={`text-[10px] mt-1 ${location.pathname === '/class' ? 'text-heyvocaPink font-bold' : 'text-[#999] dark:text-[#666]'
              }`}>
              학습
            </span>
          </div>
        </li>
        <li
          onClick={() => {
            vibrate({ duration: 5 });
            navigate('/mypage');
          }}
          className="
            flex items-center justify-center flex-1 w-full h-full
          "
        >
          <div
            className="
              flex flex-col items-center bg-background dark:bg-background-dark
            "
          >
            <User
              weight="fill"
              className={`w-6 h-6 ${location.pathname === '/mypage' ? 'text-heyvocaPink' : 'text-[#999] dark:text-[#666]'}`}
            />
            <span className={`text-[10px] mt-1 ${location.pathname === '/mypage' ? 'text-heyvocaPink font-bold' : 'text-[#999] dark:text-[#666]'
              }`}>
              마이페이지
            </span>
          </div>
        </li>
      </ul>
      <div style={{ height: 'calc(var(--safe-area-bottom) - 20px)' }}></div>
    </footer>
  );
};

export default BottomNav; 