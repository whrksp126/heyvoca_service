import React from 'react';
import { Leaf, Plant, Carrot, EggCrack } from '@phosphor-icons/react';

const MemorizationStatus = ({ repetition, interval, ef }) => {
  // ✅ 미학습 상태 먼저 체크
  if (repetition === 0 && interval === 0) {
    return (
      <div className="
        flex items-center gap-[3px] 
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
    return (
      <div className="
        flex items-center gap-[3px] 
        py-[3px] px-[5px]
        border border-[#77CE4F] rounded-[3px]
        text-[#77CE4F] text-[10px] font-[600]
        bg-[#F2FFEB]
      ">
        <Leaf size={10} weight="fill" />
        <span>{percent}% 암기</span>
      </div>
    );
  } else if (percent < 70) {
    return (
      <div className="
        flex items-center gap-[3px] 
        py-[3px] px-[5px]
        border border-[#38CE38] rounded-[3px]
        text-[#38CE38] text-[10px] font-[600]
        bg-[#EBFFEE]
      ">
        <Plant size={10} weight="fill" />
        <span>{percent}% 암기</span>
      </div>
    );
  } else {
    return (
      <div className="
        flex items-center gap-[3px] 
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
};

export default MemorizationStatus; 