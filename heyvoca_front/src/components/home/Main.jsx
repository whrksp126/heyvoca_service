// src/components/home/main
import React from 'react';
import { motion } from 'framer-motion';
import logo_h from '../../assets/images/logo_h.png';
import 헤이캐릭터02 from '../../assets/images/헤이캐릭터02.png';
import 보석 from '../../assets/images/보석.png';

import { SketchLogo, Heart, Check, CircleDashed } from '@phosphor-icons/react';
import { useUser } from '../../context/UserContext';
import { useFullSheet } from '../../context/FullSheetContext';

import 초대왕 from '../../assets/images/헤이캐릭터/초대왕.png';
import 출석왕 from '../../assets/images/헤이캐릭터/출석왕.png';
import 노력왕 from '../../assets/images/헤이캐릭터/노력왕.png';
import 단어왕 from '../../assets/images/헤이캐릭터/단어왕.png';
import 끈기왕 from '../../assets/images/헤이캐릭터/끈기왕.png';
import 독서왕 from '../../assets/images/헤이캐릭터/독서왕.png';

import StoreSheet from './StoreSheet';
import TodayStudySheet from './TodayStudySheet';

const Main = () => {
  const { userMainPage , userProfile} = useUser();
  const { pushFullSheet } = useFullSheet();

  const handleStoreButtonClick = () => {
    pushFullSheet({
      component: <StoreSheet />
    });
  }

  const handleTodayStudyButtonClick = () => {
    console.log('오늘의 학습 버튼 클릭');
    pushFullSheet({
      component: <TodayStudySheet />
    });
  }

  return (
    <div className="
        flex flex-col
        h-screen
      "
      style={{
        background: 'linear-gradient(to bottom, #FF69C6 0%, #FF8DD4 22%, #FFFFFF 42%)',
      }}
    >
      <div className="
        flex justify-between items-center
        pt-[20px] px-[16px] pb-[14px]
      ">
        <img src={logo_h} alt="heyvoca logo" className="h-[25px]" />
        <div className="flex gap-[5px] items-center" onClick={handleStoreButtonClick}>
          <img src={보석} alt="보석" className="w-[20px] h-[18px]" />
          <span className="text-[#fff] text-[14px] font-bold">{userProfile.gem_cnt}</span>
        </div>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
        exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
      >
        <div className="
          relative
          flex flex-col items-start justify-center gap-[20px]
          px-[16px] py-[10px]
        ">
          <h2 className="
            text-[#fff] text-[24px]
          ">
            <strong>{userProfile.username}</strong>님,<br/>
            <strong>1,450개</strong><br/>
            단어를 학습 중이에요!
          </h2>
          <img src={헤이캐릭터02} alt="" className="
            absolute top-[-9px] right-[25px]
            h-[148px]
          " />
          <motion.div 
            className="relative flex w-[100%] h-[50px]"
            onClick={() => handleTodayStudyButtonClick()}
            whileTap={{ scale: 0.96}}
            whileHover={{ scale: 1.04}}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
          >
            <div className="
              absolute top-[0] left-[0] right-[0] bottom-[0] z-[0]
              rounded-[10px]
              bg-gradient-to-br from-[rgba(255,141,212,1)] via-[rgba(205,141,255,1)] to-[rgba(116,213,255,1)]
            "></div>
            <button className="
              absolute top-[3px] left-[3px] right-[3px] bottom-[3px] z-[1]
              flex items-center justify-center
              rounded-[7px]
              bg-white
            ">
              <span className="
                text-transparent bg-clip-text
                bg-gradient-to-br from-[rgba(255,141,212,1)] via-[rgba(205,141,255,1)] to-[rgba(116,213,255,1)]
                text-[16px] font-[800]
              ">
                오늘의 학습
              </span>
            </button>
          </motion.div>
        </div>
        <div className="
          flex flex-col gap-[15px] 
          px-[16px] py-[18px] pb-[88px]
        ">
          <div className="
            flex items-start gap-[50px]
            px-[15px] py-[12px]
            rounded-[12px]
            bg-[#FF8DD4] 
          ">
            <h2 className="text-[#fff] text-[16px] font-[700]">데일리 미션</h2>
            <div className="flex flex-col flex-1 gap-[8px]">
              <div className="flex justify-between">
                <span className="text-[#fff] text-[12px] font-[600]">접속하기</span>
                <div className="
                  flex items-center justify-center 
                  w-[60px] h-[20px] 
                  px-[6px] py-[4px] 
                  rounded-[5px] 
                  text-[#fff] text-[10px] font-[700]
                  bg-[#E569B7] 
                ">완료</div>
              </div>
              <div className="flex justify-between">
                <span className="text-[#fff] text-[12px] font-[600]">오늘의 학습</span>
                <div className="
                  flex items-center justify-center 
                  w-[60px] h-[20px] 
                  px-[6px] py-[4px] 
                  rounded-[5px] 
                  text-[#FF8DD4] text-[10px] font-[700]
                  bg-[#fff] 
                ">미완료</div>
              </div>
            </div>
          </div>  

          <div className="
            flex flex-col gap-[20px]
            px-[15px] py-[12px]
            rounded-[12px]
            bg-[#FFEFFA] 
          ">
            <h2 className="text-[#111] text-[16px] font-[700]">데일리 미션</h2>
            <div className="flex justify-between">
              {userMainPage?.dates?.map((item, index) => (
              <div key={index} className="flex flex-col gap-[10px] items-center">
                <h3 className="text-[#111] text-[12px] font-[600]">{item.date}</h3>
                {(item.attend && item.daily_mission) && (
                  <div className="w-[30px] h-[30px] flex items-center justify-center">
                    <div className="flex items-center justify-center w-[24px] h-[24px] 
                      bg-gradient-to-br from-[rgba(255,141,212,1)] via-[rgba(205,141,255,1)] to-[rgba(116,213,255,1)]
                      rounded-[50%]
                    ">
                      <Heart size={12} weight="fill" color="#fff" />
                    </div>
                  </div>
                )}
                {(item.attend && !item.daily_mission) && (
                  <div className="w-[30px] h-[30px] flex items-center justify-center">
                    <div className="flex items-center justify-center w-[24px] h-[24px] 
                      bg-[#FF8DD4]
                      rounded-[50%]
                    ">
                      <Check size={12} color="#fff" />
                    </div>
                  </div>
                )}
                {(!item.attend && !item.daily_mission) && (
                  <CircleDashed size={30} color="#FF8DD4" />
                )}
              </div>    
              ))}
            </div>
          </div>


          <div className="
            flex flex-col gap-[20px]
            px-[15px] py-[12px]
            rounded-[12px]
            bg-[#F6EFFF] 
          ">
            <h2 className="text-[#111] text-[16px] font-[700]">나의 업적</h2>
            <div
              className={`
                flex flex-wrap
                justify-center
                gap-2
              `}
              style={{
                rowGap: '16px',
                columnGap: 'auto',
              }}
            >
              {/* 업적 아이템 배열로 관리, 4개 이하일 때도 중앙 정렬 */}
              {[
                { src: 초대왕, label: '초대왕', level: 1 },
                { src: 출석왕, label: '출석왕', level: 2 },
                { src: 노력왕 , label: '노력왕', level: 3 },
                { src: 단어왕 , label: '단어왕', level: 4 },
                { src: 끈기왕 , label: '끈기왕', level: 5 },
                { src: 독서왕 , label: '독서왕', level: 6 },
                // 필요시 추가
              ].map((item, idx) => (
                <div
                  key={item.label}
                  className="flex flex-col items-center gap-[5px] w-[60px]"
                  style={{
                    flex: '0 1 25%', // 한 줄에 최대 4개
                    maxWidth: '60px',
                  }}
                >
                  <div className="relative h-[70px]">
                    <img src={item.src} alt="" className="absolute bottom-[10px] left-[50%] translate-x-[-50%]" />
                    <div className="w-[60px] h-[60px] rounded-[50%] bg-[#C0C0C0]"></div>
                    <span 
                      className="
                        absolute bottom-[0] left-[50%] 
                        translate-x-[-50%] z-[1] 
                        text-[#D4D4D4] text-[16px] font-[700]
                        font-family: 'Cafe24Ssurround', sans-serif;
                        [text-shadow:_-1.2px_-1.2px_0_#fff,_1.2px_-1.2px_0_#fff,_-1.2px_1.2px_0_#fff,_1.2px_1.2px_0_#fff]
                      "
                      >
                        <span className="text-[10px]">LV.</span>{item.level}
                    </span>
                  </div>
                  <span className="text-[#111] text-[12px] font-[600]">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      

    </div>
  )
}
export default Main;