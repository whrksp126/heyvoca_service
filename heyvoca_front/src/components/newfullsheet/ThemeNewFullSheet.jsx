import React, { useState } from 'react';
import { CaretLeft, Check } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useTheme } from '../../context/ThemeContext';
import { motion } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';

const ThemeNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet } = useNewFullSheetActions();
  const { theme, setTheme } = useTheme();

  const themeOptions = [
    { value: 'light', label: '라이트 모드' },
    { value: 'dark', label: '다크 모드' },
    { value: 'system', label: '시스템 설정' },
  ];

  const handleThemeChange = (newTheme) => {
    vibrate({ duration: 5 });
    setTheme(newTheme);
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div className="
        relative
        flex items-center justify-between
        h-[55px] 
        pt-[20px] px-[16px] pb-[14px]
      ">
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={() => {
              vibrate({ duration: 5 });
              popNewFullSheet();
            }}
            className="
              text-layout-gray-200 dark:text-layout-white
              rounded-[8px]
            "
            whileHover={{
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              scale: 1.05
            }}
            whileTap={{
              scale: 0.95,
              backgroundColor: 'rgba(0, 0, 0, 0.1)'
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 17
            }}
          >
            <CaretLeft size={24} />
          </motion.button>
          <h1 className="
            text-[18px] font-[700]
            text-layout-black 
          ">
          </h1>
        </div>
        <h1 className="
            absolute
            left-1/2 -translate-x-1/2
            text-[18px] font-[700]
            text-layout-black dark:text-layout-white
          ">
          테마
        </h1>
        <div
          className="
            flex items-center gap-[8px]
            text-layout-gray-200 dark:text-layout-white
          "
        >
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 py-[10px] overflow-y-auto">
        <ul className="w-full m-0 p-0 list-none">
          {themeOptions.map((option) => (
            <li
              key={option.value}
              onClick={() => handleThemeChange(option.value)}
              className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark cursor-pointer"
            >
              <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">
                {option.label}
              </span>
              {theme === option.value && (
                <Check weight="bold" className="text-[20px] text-primary-main-600" />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ThemeNewFullSheet;

