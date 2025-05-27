import React, { useRef, useState, useEffect } from 'react';
import '../index.css';
import { useUser } from '../context/UserContext';
import heyCharacter from '../assets/images/헤이캐릭터.png';
import { fetchDataAsync } from '../utils/common';

const InitialProfile = () => {
  const { getUserProfile } = useUser();
  const [step, setStep] = useState(1);
  const [levelBookList, setLevelBookList] = useState([]);
  const [userProfile, setUserProfile] = useState({
    name: null,
    level: null,
    vocabook: null,
  });
  const profileRefs = useRef();

  useEffect(() => {
    if(step == 1){
      profileRefs.current.focus();
    }
  }, [step]);

  // 다음 버튼 클릭 시 이름 저장
  const handleNextBtn = async (target) => {
    if(step == 1){
      setUserProfile({
        ...userProfile,
        name: profileRefs.current.value,
      });
      setStep(2);
    }
    else if(step == 2){
      
      const url = `/login/level_book_list`;
      const method = 'GET';
      const fetchData = {level: userProfile.level};
      const result = await fetchDataAsync( url, method, fetchData );
      if(result.code == 200){
        setLevelBookList(result.data);
        setUserProfile({
          ...userProfile,
          level: target,
        });
        setStep(3);
      }
    }else if(step == 3){
      setUserProfile({
        ...userProfile,
        vocabook: target,
      });
    }
  }
  if(step == 1){
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
            안녕하세요! <br />
            오늘부터 함께할 헤이라고 해요. <br />
            앞으로 제가 어떻게 부르면 될까요?
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
          <input type="text" placeholder="닉네임을 입력해주세요(8자 이내)" 
            id="name"
            name="name"
            ref={el => profileRefs.current = el}
            className="
              w-full h-[50px]
              rounded-[8px]
              bg-[#fff]
              border-[1px] border-[#ccc]
              px-[15px]
              font-[16px] font-[400]
            "
            autoComplete="off"
          />
          <button
          className="
            w-full h-[50px]
            rounded-[8px]
            bg-[#FF8DD4]
            text-[#fff] font-[16px] font-[700]
          "
          onClick={handleNextBtn}
          >다음</button>

        </div>
      </div>
    );
  }
  if(step == 2){
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
            좋아요! {profileRefs.current.name.value}님 <br />
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
  }
  if(step == 3){
    return (
<div className="
        flex flex-col items-center gap-[45px] justify-end 
        w-full h-screen 
        p-[20px]
        bg-[#fff]
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
            선택하신 레벨에 맞는 단어장을 선물해 드릴게요!<br />
            원하시는 단어장 하나를 선택해주세요.
          </div>
          <ul>
            <li>토익 준비용 🔥</li>
            <li>고등 수능 영단어 👀</li>
            <li>30일 완성 TEPS 👍</li>
            <li>기적의 말하기 영단어 🗣️</li>
          </ul>
        </div>
        <div className="
          flex flex-col items-center gap-[15px]
          w-full
        ">
          <button
            className="
              w-full h-[50px]
              rounded-[8px]
              bg-[#CCC]
              text-[#FFF] font-[16px] font-[700]
            "
            onClick={handleNextBtn}
          >레벨 다시 선택하기</button>

        </div>
      </div>
    )
  }
};

export default InitialProfile;
