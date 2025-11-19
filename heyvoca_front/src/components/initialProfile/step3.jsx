import React from 'react';
import { motion } from 'framer-motion';
import HeyCharacter from '../../assets/images/HeyCharacter.png';

const Step3 = ({setStep, userInitialProfile, setUserInitialProfile}) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // React Compiler가 자동으로 useCallback 처리
  const handleNextBtn = (target) => {
    setUserInitialProfile({
      ...userInitialProfile,
      level: target,
    });
    setStep(4);
  }

  const buttonVariants = {
    hover: {
      scale: 1.02,
      backgroundColor: "rgba(255, 141, 212, 0.1)",
      boxShadow: "0 4px 8px rgba(0,0,0,0.1)"
    },
    tap: {
      scale: 0.98,
      backgroundColor: "rgba(255, 141, 212, 0.2)"
    }
  };

  return (
    <div className="
      flex flex-col items-center gap-[45px] justify-end 
      w-full h-screen 
      p-[20px]
      bg-[#FFEFFA]
    ">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
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
          좋아요! {userInitialProfile.name}님 <br />
          시작하기 전에 맞춤 테스트를 제공할 수 있도록 <br />
          원하는 레벨을 선택해주세요!
        </div>
        <img src={HeyCharacter} alt="logo" 
          className="
            w-[160px]
          "
        />
      </div>
      <ul className="
        flex flex-col items-center gap-[10px]
        w-full
      ">
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 17
          }}
          className="
            w-full h-[45px]
            border-[1px] border-[#FF8DD4] rounded-[8px]
            text-[#FF8DD4] font-[16px] font-[700]
            bg-[#FFFFFF]
          "
          onClick={() => handleNextBtn(1)}
        >
          Lv 1. 초등학생
        </motion.button>
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 17
          }}
          className="
            w-full h-[45px]
            border-[1px] border-[#FF8DD4] rounded-[8px]
            text-[#FF8DD4] font-[16px] font-[700]
            bg-[#FFFFFF]
          "
          onClick={() => handleNextBtn(2)}
        >
          Lv 2. 중학생
        </motion.button>
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 17
          }}
          className="
            w-full h-[45px]
            border-[1px] border-[#FF8DD4] rounded-[8px]
            text-[#FF8DD4] font-[16px] font-[700]
            bg-[#FFFFFF]
          "
          onClick={() => handleNextBtn(3)}
        >
          Lv 3. 고등학생
        </motion.button>
        <motion.button
          variants={buttonVariants}
          whileHover="hover"
          whileTap="tap"
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 17
          }}
          className="
            w-full h-[45px]
            border-[1px] border-[#FF8DD4] rounded-[8px]
            text-[#FF8DD4] font-[16px] font-[700]
            bg-[#FFFFFF]
          "
          onClick={() => handleNextBtn(4)}
        > 
          Lv 4. 대학생 이상
        </motion.button>
      </ul>
    </div>
  )
};

export default Step3;
