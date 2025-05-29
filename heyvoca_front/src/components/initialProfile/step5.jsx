import React from 'react';
import heyCharacter from '../../assets/images/헤이캐릭터.png';


const Step5 = ({ saveUserProfile }) => {
  const handleNextBtn = async () => {
    saveUserProfile();
  }

  return (
    <div className="
      flex flex-col items-center gap-[100px] justify-end 
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
          이제 준비가 완료됐어요! 시작해볼까요?
        </div>
        <img src={heyCharacter} alt="logo" 
          className="
            w-[173px]
          "
        />
      </div>
      <div className="
        flex flex-col items-center gap-[15px]
        w-full
      ">
        <button
        className="
          w-full h-[50px]
          rounded-[8px]
          bg-[#FF8DD4]
          text-[#fff] font-[16px] font-[700]
        "
        onClick={handleNextBtn}
        >학습하러 가기</button>

      </div>
    </div>
  );
};

export default Step5;
