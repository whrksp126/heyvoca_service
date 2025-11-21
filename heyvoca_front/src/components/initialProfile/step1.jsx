import React from 'react';
import { motion } from 'framer-motion';
import HeyCharacter from '../../assets/images/HeyCharacter.png';

const Step1 = ({ setStep }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화
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
    <>
    <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
    <div className="
      flex flex-col items-center justify-between
      w-full h-[calc(100vh-var(--status-bar-height))]
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
          안녕하세요!<br />
          오늘부터 함께할 헤이라고 해요.
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
        className="
          w-full h-[45px]
          bg-[#FF8DD4]
          rounded-[8px]
          text-[#FFFFFF] font-[16px] font-[700]
        "
        onClick={() => setStep(2)}
      >
        시작하기
      </motion.button>
    </div>
    </>
  )
};

export default Step1;
