import React from 'react';
import { CaretLeft } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useExampleSettings } from '../../context/ExampleSettingsContext';
import { motion } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';

const ExampleSettingsNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { showExamples, setShowExamples } = useExampleSettings();

  const handleToggle = () => {
    vibrate({ duration: 5 });
    setShowExamples((prev) => !prev);
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="
        relative
        flex items-center justify-between
        h-[55px]
        pt-[20px] px-[16px] pb-[14px]
        border-b border-[#ddd]
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
            whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', scale: 1.05 }}
            whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
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
          예문 보기
        </h1>
        <div className="flex items-center gap-[8px] text-layout-gray-200 dark:text-layout-white"></div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 py-[10px] overflow-y-auto">
        <div
          onClick={handleToggle}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark cursor-pointer"
        >
          <div className="flex flex-col gap-[4px] pr-[16px]">
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">
              예문 항상 보기
            </span>
            <span className="text-[13px] text-layout-gray-200 dark:text-layout-white/60 leading-tight">
              단어 목록에서 예문을 항상 함께 표시합니다.
            </span>
          </div>

          {/* Toggle Button */}
          <div className={`
            relative w-[60px] h-[32px] shrink-0 rounded-full p-[3px] transition-colors duration-300
            ${showExamples ? 'bg-primary-main-600' : 'bg-layout-gray-200 dark:bg-layout-gray-500'}
          `}>
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="w-[26px] h-[26px] bg-white rounded-full shadow-md"
              animate={{ x: showExamples ? 28 : 0 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExampleSettingsNewFullSheet;
