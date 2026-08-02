import React from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import BottomNav from '../components/component/BottomNav';
import Main from '../components/farm/Main';
import { vibrate } from '../utils/osFunction';

// 당근 농장 V2 — 농장 상세. 단계별 그룹 탭 + 작물 목록.
const Farm = () => {
  const navigate = useNavigate();

  return (
    <>
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div
        data-page-header
        className="relative flex items-center justify-between w-full h-[55px] px-[16px] bg-layout-white dark:bg-layout-black"
      >
        <motion.button
          type="button"
          onClick={() => { vibrate({ duration: 5 }); navigate(-1); }}
          whileTap={{ scale: 0.95 }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          aria-label="뒤로"
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white whitespace-nowrap">
          내 농장
        </h1>
        <div className="w-[24px]" />
      </div>
      <Main />
      <BottomNav />
    </>
  );
};

export default Farm;
