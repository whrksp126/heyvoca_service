import React from "react";
import { useNavigate } from "react-router-dom";
import { CaretLeft, Sun, Moon } from "@phosphor-icons/react";
import { useTheme } from '../../context/ThemeContext';

const Theme = () => {
  const { isDark, setIsDark } = useTheme();
  const navigate = useNavigate();

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
          <h2 className="text-primary dark:text-primary-dark">테마</h2>
        </div>
      </header>

      <main className="w-full max-w-md mx-auto mt-2">
        <ul className="divide-y divide-border dark:divide-border-dark">
          <li className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-primary dark:text-primary-dark">테마 설정</h2>
              <label 
                className="relative inline-flex items-center cursor-pointer"
                onClick={() => setIsDark(!isDark)}
              >
                <div className={`
                  w-[48.8px] h-[25px] rounded-full p-1
                  transition-colors duration-300
                  ${!isDark ? "bg-[#FF8DD4]" : "bg-[#666]"}
                  relative
                `}>
                  <div className={`
                    absolute top-[12%]
                    w-[20px] h-[20px] bg-white rounded-full
                    transition-transform duration-300
                    flex items-center justify-center
                    ${!isDark ? "left-1" : "left-[26px]"}
                  `}>
                    {!isDark ? (
                      <Sun weight="fill" size={12} className="text-[#FF8DD4]" />
                    ) : (
                      <Moon weight="fill" size={12} className="text-[#666]" />
                    )}
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

export default Theme; 