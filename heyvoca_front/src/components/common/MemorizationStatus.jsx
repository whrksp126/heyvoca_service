import React from 'react';
import { Leaf, Plant, Carrot, EggCrack } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

const MemorizationStatus = ({ repetition, interval, ef, isCorrect=null }) => {  
  // ✅ 미학습 상태 먼저 체크
  if (repetition === 0 && interval === 0) {
    return (
      <div className="
        flex items-center gap-[3px] 
        w-[max-content]
        py-[3px] px-[5px]
        border border-[#9D835A] rounded-[3px]
        text-[#9D835A] text-[10px] font-[600]
        bg-[#FFFCF3]
      ">
        <EggCrack size={10} weight="fill" />
        <span>미학습</span>
      </div>
    );
  }

  // 암기율 계산
  let score = 0;
  score += repetition * 15;
  score += interval * 2;
  score += (ef - 1.3) * 20;

  const percent = Math.max(0, Math.min(100, Math.round(score)));

  // 아이콘과 스타일 분기
  if (percent < 30) {
    // isCorrect가 null일 때는 정적 컴포넌트
    if (isCorrect === null) {
      return (
        <div className="
          flex items-center gap-[3px] 
          w-[max-content]
          py-[3px] px-[5px]
          border border-[#77CE4F] rounded-[3px]
          text-[#77CE4F] text-[10px] font-[600]
          bg-[#F2FFEB]
        ">
          <Leaf size={10} weight="fill" />
          <span>{percent}% 암기</span>
        </div>
      );
    }
    
    // isCorrect가 true/false일 때는 애니메이션 컴포넌트
    return (
      <motion.div className={`
        flex items-center gap-[3px] 
        w-[max-content]
        py-[3px] px-[5px]
        border border-[#77CE4F] rounded-[3px]
        text-[#77CE4F] text-[10px] font-[600]
        bg-[#F2FFEB]
        ${isCorrect === false ? "border-[#F26A6A] bg-[#FFE9E9] text-[#F26A6A] " : ""}
      `}
        initial={{ opacity: 0, y: -30, scale: 1.2, rotate: 10 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 700, damping: 18, duration: 0.5 }}
      >
        <Leaf size={10} weight="fill" />
        <span>{percent}% 암기</span>
      </motion.div>
    );
  } else if (percent < 70) {
    // isCorrect가 null일 때는 정적 컴포넌트
    if (isCorrect === null) {
      return (
        <div className="
          flex items-center gap-[3px] 
          w-[max-content]
          py-[3px] px-[5px]
          border border-[#38CE38] rounded-[3px]
          text-[#38CE38] text-[10px] font-[600]
          bg-[#EBFFEE]
        ">
          <Plant size={10} weight="fill" />
          <span>{percent}% 암기</span>
        </div>
      );
    }
    
    // isCorrect가 true/false일 때는 애니메이션 컴포넌트
    return (
      <motion.div className={`
        flex items-center gap-[3px] 
        w-[max-content]
        py-[3px] px-[5px]
        border border-[#38CE38] rounded-[3px]
        text-[#38CE38] text-[10px] font-[600]
        bg-[#EBFFEE]
        ${isCorrect === false ? "border-[#F26A6A] bg-[#FFEBEB] text-[#F26A6A] " : ""}
      `}
        initial={{ opacity: 0, y: -30, scale: 1.2, rotate: 10 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 700, damping: 18, duration: 0.5 }}
      >
        <Plant size={10} weight="fill" />
        <span>{percent}% 암기</span>
      </motion.div>
    );
  } else {
    // isCorrect가 null일 때는 정적 컴포넌트
    if (isCorrect === null) {
      return (
        <div className="
          flex items-center gap-[3px] 
          w-[max-content]
          py-[3px] px-[5px]
          border border-[#F68300] rounded-[3px]
          text-[#F68300] text-[10px] font-[600]
          bg-[#FFF8E8]
        ">
          <Carrot size={10} weight="fill" />
          <span>{percent}% 암기</span>
        </div>
      );
    }
    
    // isCorrect가 true/false일 때는 애니메이션 컴포넌트
    return (
      <motion.div className={`
        flex items-center gap-[3px] 
        w-[max-content]
        py-[3px] px-[5px]
        border border-[#F68300] rounded-[3px]
        text-[#F68300] text-[10px] font-[600]
        bg-[#FFF8E8]
        ${isCorrect === false ? "border-[#F26A6A] bg-[#FFE9E9] text-[#F26A6A] " : ""}
      `}
        initial={{ opacity: 0, y: -30, scale: 1.2, rotate: 10 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 700, damping: 18, duration: 0.5 }}
      >
        <Carrot size={10} weight="fill" />
        <span>{percent}% 암기</span>
      </motion.div>
    );
  }
};

export default MemorizationStatus; 