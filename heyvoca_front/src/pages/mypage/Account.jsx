import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaretLeft, SignOut } from "@phosphor-icons/react";
import googleLogo from '../../assets/images/google_logo.png';
import { useTheme } from '../../context/ThemeContext';
import Modal from '../../components/common/Modal';

const Account = () => {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const [showModal, setShowModal] = useState(false);

  const handleLogout = () => {
    setShowModal(true);
  };

  const handleModalLogout = () => {
    const userData = JSON.parse(localStorage.getItem('user'));
    localStorage.setItem('user', JSON.stringify({
      token: userData.token,
      email: userData.email,
      name: userData.name,
      state: "logout"
    }));
    navigate('/login');
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
            <SignOut className="w-4 h-4" color={isDark ? "#fff" : "#111"} />
          </li>
        </ul>
      </main>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        <h3 className="text-lg font-bold text-primary dark:text-primary-dark mb-2">
          정말 로그아웃 하시겠어요?
        </h3>
        <p className="text-[#666] dark:text-[#999] mb-6">
          로그아웃 시에는 일부 기능을 사용할 수 없어요 🥺
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowModal(false)}
            className="flex-1 py-2 px-4 rounded-lg bg-[#f5f5f5] dark:bg-[#333] text-[#666] dark:text-[#999]"
          >
            취소
          </button>
          <button
            onClick={handleModalLogout}
            className="flex-1 py-2 px-4 rounded-lg bg-heyvocaPink text-white"
          >
            로그아웃
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default Account;
