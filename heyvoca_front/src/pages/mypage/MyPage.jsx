import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircle, SunDim, TextAlignJustify, HardDrives, Bell, CaretRight, Notepad, Storefront, Exam, User } from "@phosphor-icons/react";
import { useTheme } from '../../context/ThemeContext';

const Mypage = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [user, setUser] = useState(null);
  // const [notifications, setNotifications] = useState("on");

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("user"));
    if (userData) {
      setUser(userData);
    }
  }, []);

  return (
    <div className="flex flex-col w-full h-screen bg-background dark:bg-background-dark">
      <header className="border-b border-border dark:border-border-dark">
        <div>
          <h2 className="text-primary dark:text-primary-dark">마이페이지</h2>
        </div>
      </header>
      
      <main className="flex-grow">
        <ul className="w-full m-0 p-0 list-none">
          <li onClick={() => navigate('/mypage/account')} 
              className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
            <div className="flex items-center gap-2">
              <UserCircle weight="fill" className="text-[20px] text-heyvocaPink" />
              <span className="text-[16px] font-bold text-primary dark:text-primary-dark">계정</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">{user?.email || "로그인 필요"}</span>
              <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
            </div>
          </li>

          <li onClick={() => navigate('/mypage/theme')} 
              className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
            <div className="flex items-center gap-2">
              <SunDim weight="fill" className="text-[20px] text-heyvocaPink" />
              <span className="text-[16px] font-bold text-primary dark:text-primary-dark">테마</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">{isDark ? "다크" : "라이트"}</span>
              <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
            </div>
          </li>

          <li onClick={() => navigate('/example_settings')} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <TextAlignJustify weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-primary dark:text-primary-dark">예문 설정</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">항상 보기</span>
              <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
            </div>
          </li>

          <li onClick={() => navigate('/vocabulary_backup')} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <HardDrives weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-primary dark:text-primary-dark">단어장 백업</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
            </div>
          </li>

          <li onClick={() => navigate('/push_notifications')} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <Bell weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-primary dark:text-primary-dark">푸시 알림</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">on</span> {/* TODO: 알림 상태 표시 */}
              <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
            </div>
          </li>
        </ul>
      </main>
    </div>
  );
};

export default Mypage;
