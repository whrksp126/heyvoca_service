import React from "react";
import { useNavigate } from "react-router-dom";
import { CaretLeft, SignOut } from "@phosphor-icons/react";
import googleLogo from '../../assets/images/google_logo.png';
import { useTheme } from '../../context/ThemeContext';

const Account = () => {
  const navigate = useNavigate();
  const { theme } = useTheme();

  const handleLogout = () => {
    console.log("로그아웃 처리");
  };

  return (
    <div className="min-h-screen bg-background dark:bg-background-dark">
      <header className="border-b border-border dark:border-border-dark">
        <div className="relative w-full max-w-md flex items-center justify-center">
          <button
            onClick={() => navigate("/mypage")}
            className="absolute left-0 flex items-center bg-transparent p-0 border-0"
          >
            <CaretLeft size={24} className="text-primary dark:text-primary-dark" />
          </button>
          <h2 className="text-primary dark:text-primary-dark">계정</h2>
        </div>
      </header>

      <main className="w-full max-w-md mx-auto mt-2">
        <ul className="divide-y divide-border dark:divide-border-dark">
          <li className="p-4">
            <h2 className="text-[#111] dark:text-white">로그인 방식</h2>
            <div className="flex items-center space-x-2">
              <img
                src={googleLogo}
                alt="Google Logo"
                className="w-4 h-4"
              />
              <span className="text-sm text-[#999] dark:text-[#999]">Google 로그인</span>
            </div>
          </li>

          <li className="p-4">
            <h2 className="text-[#111] dark:text-white">계정 이메일</h2>
            <div>
              <span className="text-sm text-[#999] dark:text-[#999]">hyeji1022@gmail.com</span>
            </div>
          </li>
        </ul>
        <ul className="divide-y divide-[#ddd] dark:divide-[#222] pt-2 bg-[#f5f5f5] dark:bg-[#222]">
          <li
            className="p-4 flex items-center justify-between cursor-pointer bg-white dark:bg-[#111]"
            onClick={handleLogout}
          >
            <h2 className="text-[#111] dark:text-white">로그아웃</h2>
            <SignOut className="w-4 h-4" color={theme === "라이트" ? "#111" : "#fff"} />
          </li>
        </ul>
      </main>
    </div>
  );
};

export default Account;
