import React from 'react';
import { motion } from 'framer-motion';
import HeyCharacter from '../../assets/images/HeyCharacter.png';

const Step5 = ({endInitialProfile}) => {
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
    <div className="
      flex flex-col items-center justify-between
      w-full h-screen 
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
        className="
          w-full h-[45px]
          bg-[#FF8DD4]
          rounded-[8px]
          text-[#FFFFFF] font-[16px] font-[700]
        "
        onClick={() => {
          endInitialProfile();
        }}
      >
        학습하러 가기
      </motion.button>
    </div>
  )
};

export default Step5;
