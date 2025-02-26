import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserCircle, SunDim, TextAlignJustify, HardDrives, Bell, CaretRight, Notepad, Storefront, Exam, User, UserCirclePlus } from "@phosphor-icons/react";

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
    <div className="flex flex-col w-full h-screen bg-white">
      <header className="border-b border-[#ddd] px-4 pt-5 pb-3.5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111]">마이페이지</h2>
        </div>
      </header>
      
      <main className="flex-grow">
        <ul className="w-full m-0 p-0 list-none">
          <li onClick={() => navigate('/account')} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <UserCircle weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-[#111]">계정</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">{user?.email || "로그인 필요"}</span>
              <CaretRight className="text-[20px] text-[#111]" />
            </div>
          </li>

          <li onClick={() => setTheme(theme === "라이트" ? "다크" : "라이트")} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <SunDim weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-[#111]">테마</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">{theme}</span>
              <CaretRight className="text-[20px] text-[#111]" />
            </div>
          </li>

          <li onClick={() => navigate('/example_settings')} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <TextAlignJustify weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-[#111]">예문 설정</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">항상 보기</span>
              <CaretRight className="text-[20px] text-[#111]" />
            </div>
          </li>

          <li onClick={() => navigate('/vocabulary_backup')} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <HardDrives weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-[#111]">단어장 백업</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CaretRight className="text-[20px] text-[#111]" />
            </div>
          </li>

          <li onClick={() => setNotifications(notifications === "on" ? "off" : "on")} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <Bell weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-[#111]">푸시 알림</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">{notifications}</span>
              <CaretRight className="text-[20px] text-[#111]" />
            </div>
          </li>
        </ul>
      </main>

      <footer className="fixed bottom-0 w-full bg-white border-t border-[#ddd]">
        <nav>
          <ul className="flex justify-around pt-2.5 pb-5 m-0 list-none">
            <li onClick={() => navigate('/vocabulary_list')} className="flex flex-col items-center flex-1 text-[16px] font-bold text-[#ccc] cursor-pointer">
              <Notepad weight="fill" size={24} className="text-[#ccc]" />
              <span className="text-[10px]">단어장</span>
            </li>
            <li onClick={() => navigate('/vocabulary_store')} className="flex flex-col items-center flex-1 text-[16px] font-bold text-[#ccc] cursor-pointer">
              <Storefront weight="fill" size={24} className="text-[#ccc]" />
              <span className="text-[10px]">서점</span>
            </li>
            <li onClick={() => navigate('/test')} className="flex flex-col items-center flex-1 text-[16px] font-bold text-[#ccc] cursor-pointer">
              <Exam weight="fill" size={24} className="text-[#ccc]" />
              <span className="text-[10px]">테스트</span>
            </li>
            <li className="flex flex-col items-center flex-1 text-[#FF8DD4] text-[16px] font-bold cursor-pointer">
              <User weight="fill" size={24} className="text-[#FF8DD4]" />
              <span className="text-[10px]">마이페이지</span>
            </li>
          </ul>
        </nav>
      </footer>
    </div>
  );
};

export default Mypage;
