import React from 'react';

import heyCharacter from '../../assets/images/헤이캐릭터.png';


const Step3 = ({setStep, userProfile, setUserProfile}) => {

  const handleNextBtn = (target) => {
    setUserProfile({
      ...userProfile,
      level: target,
    });
    setStep(4);
  }
  return (
    <div className="
      flex flex-col items-center gap-[45px] justify-end 
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
          좋아요! {userProfile.name}님 <br />
          시작하기 전에 맞춤 테스트를 제공할 수 있도록 <br />
          원하는 레벨을 선택해주세요!
        </div>
        <img src={heyCharacter} alt="logo" 
          className="
            w-[160px]
          "
        />
      </div>
      <ul className="
        flex flex-col items-center gap-[10px]
        w-full
      ">
        <button
          className="
            w-full h-[45px]
            border-[1px] border-[#FF8DD4] rounded-[8px]
            text-[#FF8DD4] font-[16px] font-[700]
            bg-[#FFFFFF]
          "
        onClick={() => handleNextBtn(1)}
        >
          Lv 1. 초등학생
        </button>
        <button
          className="
            w-full h-[45px]
            border-[1px] border-[#FF8DD4] rounded-[8px]
            text-[#FF8DD4] font-[16px] font-[700]
            bg-[#FFFFFF]
          "
        onClick={() => handleNextBtn(2)}
        >
          Lv 2. 중학생
        </button>
        <button
          className="
            w-full h-[45px]
            border-[1px] border-[#FF8DD4] rounded-[8px]
            text-[#FF8DD4] font-[16px] font-[700]
            bg-[#FFFFFF]
          "
        onClick={() => handleNextBtn(3)}
        >
          Lv 3. 고등학생
        </button>
        <button
          className="
            w-full h-[45px]
            border-[1px] border-[#FF8DD4] rounded-[8px]
            text-[#FF8DD4] font-[16px] font-[700]
            bg-[#FFFFFF]
          "
        onClick={() => handleNextBtn(4)}
        > 
          Lv 4. 대학생 이상
        </button>
      </ul>
    </div>
  )
};

export default Step3;
