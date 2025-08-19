import React from 'react';
import { motion } from 'framer-motion';
import heyCharacter from '../../assets/images/헤이캐릭터.png';

const SaveStudyData = ({endInitialProfile}) => {
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
      flex flex-col items-center justify-center
      w-full h-screen 
      p-[20px]
      bg-[#FFEFFA]
    ">
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
          학습 결과를 저장하고 있습니다! <br />
          잠시만 기다려 주세요!
        </div>
        <img src={heyCharacter} alt="logo" 
          className="
            w-[160px]
          "
        />
      </div>
    </div>
  )
};

export default SaveStudyData;
