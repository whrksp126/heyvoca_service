import React from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../context/VocabularyContext';

const Header = ({ testType }) => {
  const { recentStudy } = useVocabulary();
  const navigate = useNavigate();


  console.log(recentStudy);

  const handleBackClick = () => {
    if (window.confirm('학습을 종료하시겠습니까?')) {
      navigate(-1);
    }
  };

  return (
    <div className='
      relative
      flex items-end justify-center
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-[#fff] 
      dark:bg-[#111]
    '>
      <div className="
        absolute left-[10px] bottom-[13px]
        flex items-center justify-center
      ">
        <motion.button
          onClick={handleBackClick}
          className="
            text-[#CCC] dark:text-[#fff]
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
      <div className="center">
        <h2 className='text-[18px] font-[700] leading-[21px]'>
          {testType ===  "today" ? "오늘의 학습" : testType === "test" ? "학습" : "테스트"}
        </h2>
      </div>
      <div className="right">

      </div>
    </div>
  );
};

export default Header; 