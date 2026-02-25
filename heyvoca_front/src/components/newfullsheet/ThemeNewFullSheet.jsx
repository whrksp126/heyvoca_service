import React from 'react';
import { CaretLeft, Sun, Moon } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useTheme } from '../../context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';

const ThemeNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { theme, setTheme, isDark } = useTheme();

  const handleToggleTheme = () => {
    vibrate({ duration: 5 });
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
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
        </div>
        <h1 className="
            absolute
            left-1/2 -translate-x-1/2
            text-[18px] font-[700]
            text-layout-black dark:text-layout-white
          ">
          테마
        </h1>
        <div className="w-[24px]"></div> {/* Spacer for symmetry */}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 py-[10px] overflow-y-auto">
        <div
          onClick={handleToggleTheme}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark cursor-pointer"
        >
          <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">
            테마 설정
          </span>

          {/* Toggle Button */}
          <div className={`
            relative w-[60px] h-[32px] rounded-full p-[3px] transition-colors duration-300
            ${isDark ? 'bg-layout-gray-500' : 'bg-primary-main-600'}
          `}>
            <motion.div
              layout
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30
              }}
              className="relative w-[26px] h-[26px] bg-white rounded-full flex items-center justify-center shadow-md"
              style={{
                x: isDark ? 28 : 0
              }}
            >
              <AnimatePresence mode="wait">
                {isDark ? (
                  <motion.div
                    key="moon"
                    initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Moon weight="bold" size={16} className="text-layout-black" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="sun"
                    initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Sun weight="bold" size={16} className="text-primary-main-600" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeNewFullSheet;

