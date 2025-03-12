import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CaretLeft } from "@phosphor-icons/react";
import { useTheme } from '../../context/ThemeContext';

const PushNotifications = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [isOn, setIsOn] = useState(true);

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
          <h2 className="text-primary dark:text-primary-dark">알림</h2>
        </div>
      </header>

      <main className="w-full max-w-md mx-auto mt-2">
        <ul className="divide-y divide-border dark:divide-border-dark">
          <li className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-primary dark:text-primary-dark">항상 보기</h2>
              <label 
                className="relative inline-flex items-center cursor-pointer"
                onClick={() => setIsOn(!isOn)}
              >
                <div className={`
                  w-[48.8px] h-[25px] rounded-full p-1
                  transition-colors duration-300
                  ${isOn ? "bg-heyvocaPink" : "bg-[#666]"}
                  relative
                `}>
                  <div className={`
                    absolute top-[12%]
                    w-[20px] h-[20px] bg-white rounded-full
                    transition-transform duration-300
                    flex items-center justify-center
                    ${isOn ? "left-[26px]" : "left-1"}
                  `}>
                  </div>
                </div>
              </label>
            </div>
          </li>
        </ul>
      </main>
    </div>
  );
};

export default PushNotifications; 