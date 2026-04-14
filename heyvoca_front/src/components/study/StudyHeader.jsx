import React from 'react';
import { CaretLeft, GearSix } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { vibrate } from '../../utils/osFunction';

const StudyHeader = ({ onBackClick, onSettingsClick }) => {
  "use memo";

  const navigate = useNavigate();

  const handleBackClick = () => {
    vibrate({ duration: 5 });
    if (onBackClick) {
      onBackClick();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className='
      relative
      flex items-end justify-center
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-layout-white
      dark:bg-layout-black
    '>
      <div className="absolute left-[10px] bottom-[13px] flex items-center justify-center">
        <motion.button
          onClick={handleBackClick}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px] p-[4px]"
          whileHover={{ backgroundColor: 'rgba(0,0,0,0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0,0,0,0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
      </div>

      <h2 className='text-[18px] font-[700] leading-[21px]'>학습</h2>

      <div className="absolute right-[10px] bottom-[13px] flex items-center justify-center">
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            onSettingsClick?.();
          }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px] p-[4px]"
          whileHover={{ backgroundColor: 'rgba(0,0,0,0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0,0,0,0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <GearSix size={24} />
        </motion.button>
      </div>
    </div>
  );
};

export default StudyHeader;
