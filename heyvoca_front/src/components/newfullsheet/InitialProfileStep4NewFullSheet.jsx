import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react';
import HeyCharacter from '../../assets/images/HeyCharacter.png';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';

const InitialProfileStep4NewFullSheet = ({userInitialProfile, endInitialProfile}) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화
  const { popNewFullSheet } = useNewFullSheetActions();
  const [isLoading, setIsLoading] = useState(false);
  const buttonVariants = {
    hover: {
      scale: 1.02,
      backgroundColor: "#FF7AC4",
      boxShadow: "0 4px 8px rgba(0,0,0,0.1)"
    },
    tap: {
      scale: 0.98,
      backgroundColor: "#FF6AB4"
    }
  };

  return (
    <div className="
      flex flex-col h-full w-full
      bg-[#FFEFFA]
    ">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div className="
        relative
        flex items-center justify-center
        h-[55px] 
        pt-[20px] px-[10px] pb-[14px]
      ">
        <motion.button
          onClick={popNewFullSheet}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
            p-[4px]
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
      <div className="
        relative
        flex flex-col items-center justify-between
        w-full h-[calc(100vh-var(--status-bar-height)-55px)]
        p-[20px]
        bg-[#FFEFFA]
      ">
        <div></div>
        <div className="
          flex flex-col items-center
          gap-[10px]
        ">
          <div 
            className="
              px-[15px] py-[12px]
              bg-[#fff]
              rounded-[10px]
              font-[16px] font-[600]
            "
            style={{ boxShadow: '0px 0px 4px 0px rgba(0,0,0,0.15)' }}
          >
            모든 설정이 완료되었습니다! <br />
            이제 학습을 시작해보세요!
          </div>
          <img src={HeyCharacter} alt="logo" 
            className="
              w-[160px]
            "
          />
        </div>
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 17
          }}
          className={`
            w-full h-[45px]
            bg-[#FF8DD4]
            rounded-[8px]
            text-[#FFFFFF] font-[16px] font-[700]
            ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onClick={async () => {
            if (isLoading) return;
            setIsLoading(true);
            try {
              await endInitialProfile(userInitialProfile);
            } catch (error) {
              console.error('초기 프로필 설정 실패:', error);
              setIsLoading(false);
            }
          }}
          disabled={isLoading}
        >
          {isLoading ? '처리 중...' : '학습하러 가기'}
        </motion.button>
      </div>

    </div>
  )
};

export default InitialProfileStep4NewFullSheet;

