// src/components/home/main
import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import logo_h from '../../assets/images/logo_h.png';
import HeyCharacter02 from '../../assets/images/HeyCharacter02.png';
import gem from '../../assets/images/gem.png';
import { useVocabulary } from '../../context/VocabularyContext';
import { SketchLogo, Heart, Check, CircleDashed } from '@phosphor-icons/react';
import { useUser } from '../../context/UserContext';

import { useFullSheet } from '../../context/FullSheetContext';

import InviteKing from '../../assets/images/HeyCharacter/InviteKing.png';
import AttendanceKing from '../../assets/images/HeyCharacter/AttendanceKing.png';
import NoryeokKing from '../../assets/images/HeyCharacter/NoryeokKing.png';
import WordKing from '../../assets/images/HeyCharacter/WordKing.png';
import PerseveranceKing from '../../assets/images/HeyCharacter/PerseveranceKing.png';
import ReadingKing from '../../assets/images/HeyCharacter/ReadingKing.png';

import StoreSheet from './StoreSheet';
import TodayStudySheet from './TodayStudySheet';

// 업적 타입과 이미지 매핑
const ACHIEVEMENT_IMAGES = {
  '초대왕': InviteKing,
  '출석왕': AttendanceKing,
  '노력왕': NoryeokKing,
  '단어왕': WordKing,
  '끈기왕': PerseveranceKing,
  '독서왕': ReadingKing,
  '암기왕': NoryeokKing, // 암기왕은 노력왕 이미지 사용
};

// 레벨별 배경 색상 및 스타일
const getAchievementBackgroundStyle = (level) => {
  if (level >= 10) {
    // 레벨 10 이상: 그라데이션
    return {
      background: 'linear-gradient(135deg, #FF8DD4 0%, #CD8DFF 50%, #74D5FF 100%)',
    };
  } else if (level >= 6) {
    // 레벨 6~9: 노란색
    return {
      backgroundColor: '#F2D252',
    };
  } else if (level >= 3) {
    // 레벨 3~5: 회색
    return {
      backgroundColor: '#C0C0C0',
    };
  } else {
    // 레벨 0~2: 갈색
    return {
      backgroundColor: '#D3A686',
    };
  }
};

// 레벨별 글자 색상 및 스타일 (배경색과 동일)
const getAchievementTextStyle = (level) => {
  if (level >= 10) {
    // 레벨 10 이상: 그라데이션 글자 (배경과 동일)
    return {
      background: 'linear-gradient(135deg, #FF8DD4 0%, #CD8DFF 50%, #74D5FF 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      color: 'transparent',
    };
  } else if (level >= 6) {
    // 레벨 6~9: 노란색 글자
    return {
      color: '#F2D252',
    };
  } else if (level >= 3) {
    // 레벨 3~5: 회색 글자
    return {
      color: '#C0C0C0',
    };
  } else {
    // 레벨 0~2: 갈색 글자
    return {
      color: '#D3A686',
    };
  }
};

const Main = () => {
  const { userMainPage , userProfile} = useUser();
  const { vocabularySheets } = useVocabulary();

  // 오늘의 요일 확인 및 각 미션별 완료 상태 체크
  const getTodayStatus = () => {
    const today = new Date();
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']; // 영어 약어로 변경
    const todayName = dayNames[today.getDay()];
    
    // userMainPage.dates에서 오늘 요일 찾기
    const todayData = userMainPage?.dates?.find(date => date.date === todayName);
    
    return {
      attendCompleted: todayData?.attend || false,        // 접속하기는 attend 값
      dailyMissionCompleted: todayData?.daily_mission || false,  // 오늘의 학습은 daily_mission 값
      todayName
    };
  };

  const todayStatus = getTodayStatus();

  const total = useCallback(vocabularySheets.reduce((acc, sheet) => acc + sheet.total, 0), [vocabularySheets]);
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
          <img src={gem} alt="보석" className="w-[20px] h-[18px]" />
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
            <strong>{total}개</strong><br/>
            단어를 학습 중이에요!
          </h2>
          <img src={HeyCharacter02} alt="" className="
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
                <div className={`
                  flex items-center justify-center 
                  w-[60px] h-[20px] 
                  px-[6px] py-[4px] 
                  rounded-[5px] 
                  text-[10px] font-[700]
                  ${todayStatus.attendCompleted 
                    ? 'text-[#fff] bg-[#E569B7]' 
                    : 'text-[#FF8DD4] bg-[#fff]'
                  }
                `}>
                  {todayStatus.attendCompleted ? '완료' : '미완료'}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-[#fff] text-[12px] font-[600]">오늘의 학습</span>
                <div className={`
                  flex items-center justify-center 
                  w-[60px] h-[20px] 
                  px-[6px] py-[4px] 
                  rounded-[5px] 
                  text-[10px] font-[700]
                  ${todayStatus.dailyMissionCompleted 
                    ? 'text-[#fff] bg-[#E569B7]' 
                    : 'text-[#FF8DD4] bg-[#fff]'
                  }
                `}>
                  {todayStatus.dailyMissionCompleted ? '완료' : '미완료'}
                </div>
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
            <div className="flex flex-col gap-y-4">
              {/* 첫 번째 줄: 4개 아이템 */}
              <div className="grid grid-cols-4 justify-items-center gap-x-3">
                {userMainPage?.goals?.slice(0, 4).map((goal, idx) => (
                  <div
                    key={goal.type}
                    className="flex flex-col items-center gap-[5px] w-[60px]"
                  >
                    <div className="relative h-[70px]" style={goal.level === 0 ? { opacity: 0.3 } : {}}>
                      <img 
                        src={ACHIEVEMENT_IMAGES[goal.type]} 
                        alt="" 
                        className="absolute bottom-[10px] left-[50%] translate-x-[-50%]" 
                      />
                      <div 
                        className="w-[60px] h-[60px] rounded-[50%]"
                        style={getAchievementBackgroundStyle(goal.level)}
                      ></div>
                      <span 
                        className="
                          absolute bottom-[0] left-[50%] 
                          translate-x-[-50%]
                          text-[16px] font-[700]
                          font-family: 'Cafe24Ssurround', sans-serif;
                          [text-shadow:_-1.2px_-1.2px_0_#fff,_1.2px_-1.2px_0_#fff,_-1.2px_1.2px_0_#fff,_1.2px_1.2px_0_#fff]
                        "
                        style={getAchievementTextStyle(goal.level)}
                        >
                          <span className="text-[10px]">LV.</span>{goal.level}
                      </span>
                    </div>
                    <span className="text-[#111] text-[12px] font-[600]">
                      {goal.type}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* 두 번째 줄: 나머지 아이템들 (중앙 정렬) */}
              {userMainPage?.goals?.length > 4 && (
                <div className="flex justify-center gap-x-3">
                  {userMainPage.goals.slice(4).map((goal, idx) => (
                    <div
                      key={goal.type}
                      className="flex flex-col items-center gap-[5px] w-[60px]"
                    >
                      <div className="relative h-[70px]" style={goal.level === 0 ? { opacity: 0.3 } : {}}>
                        <img 
                          src={ACHIEVEMENT_IMAGES[goal.type]} 
                          alt="" 
                          className="absolute bottom-[10px] left-[50%] translate-x-[-50%]" 
                        />
                        <div 
                          className="w-[60px] h-[60px] rounded-[50%]"
                          style={getAchievementBackgroundStyle(goal.level)}
                        ></div>
                        <span 
                          className="
                            absolute bottom-[0] left-[50%] 
                            translate-x-[-50%]
                            text-[16px] font-[700]
                            font-family: 'Cafe24Ssurround', sans-serif;
                            [text-shadow:_-1.2px_-1.2px_0_#fff,_1.2px_-1.2px_0_#fff,_-1.2px_1.2px_0_#fff,_1.2px_1.2px_0_#fff]
                          "
                          style={getAchievementTextStyle(goal.level)}
                          >
                            <span className="text-[10px]">LV.</span>{goal.level}
                        </span>
                      </div>
                      <span className="text-[#111] text-[12px] font-[600]">
                        {goal.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      

    </div>
  )
}
export default Main;