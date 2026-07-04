
import React from 'react';
import { GearSix } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';
import SettingsNewFullSheet from '../newfullsheet/SettingsNewFullSheet';

const Header = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { pushNewFullSheet } = useNewFullSheetActions();

  const handleSettingsClick = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(SettingsNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  return (
    <div
      data-page-header
      className='
      flex items-center justify-between
      w-full h-[55px]
      px-[16px] py-[14px]
      border-b-[1px] border-[#ddd]
      bg-layout-white
      dark:bg-layout-black
    '>
      <div className="left w-[24px]">

      </div>
      <div className="center">
        <h2 className='text-[16px] font-[700]'>
          마이페이지
        </h2>
      </div>
      <div className="right">
        <motion.button
          onClick={handleSettingsClick}
          className="flex items-center justify-center text-layout-gray-400 dark:text-layout-gray-200 rounded-[8px]"
          whileTap={{ scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
          aria-label="설정"
        >
          <GearSix weight="fill" size={24} />
        </motion.button>
      </div>
    </div>
  );
};

export default Header;
