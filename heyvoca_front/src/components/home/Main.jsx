// src/components/home/main
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import logo_h from '../../assets/images/logo_h.png';
import HeyCharacter02 from '../../assets/images/HeyCharacter02.png';
import gem from '../../assets/images/gem.png';
import { useVocabulary } from '../../context/VocabularyContext';
import { Heart, CheckCircle, CircleDashed } from '@phosphor-icons/react';
import { useUser } from '../../context/UserContext';

// import { useFullSheet } from '../../context/FullSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';

import InviteKing from '../../assets/images/HeyCharacter/InviteKing.png';
import AttendanceKing from '../../assets/images/HeyCharacter/AttendanceKing.png';
import NoryeokKing from '../../assets/images/HeyCharacter/NoryeokKing.png';
import PerseveranceKing from '../../assets/images/HeyCharacter/PerseveranceKing.png';
import ReadingKing from '../../assets/images/HeyCharacter/ReadingKing.png';
import MemorizedKing from '../../assets/images/HeyCharacter/MemorizedKing.png';
import { IconBell, IconBellRingingFill } from '../../assets/svg/icon';
import { getLastSeenTime, setLastSeenTime } from '../../utils/badgeStorage';
import { shouldShowDot, getOverdueCount } from '../../utils/badgeCalc';
import { vibrate } from '../../utils/osFunction';


// import StoreSheet from './StoreSheet';
// import TodayStudySheet from './TodayStudySheet';
import StoreNewFullSheet from '../newFullSheet/StoreNewFullSheet';
import TodayStudyNewFullSheet from '../newFullSheet/TodayStudyNewFullSheet';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { AchievementDetailNewBottomSheet } from '../newBottomSheet/AchievementDetailNewBottomSheet';

// 업적 타입과 이미지 매핑
const ACHIEVEMENT_IMAGES = {
  '초대왕': InviteKing,
  '출석왕': AttendanceKing,
  '노력왕': NoryeokKing,
  '끈기왕': PerseveranceKing,
  '독서왕': ReadingKing,
  '암기왕': MemorizedKing,
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
      fontFamily: 'Cafe24Ssurround',
      background: 'linear-gradient(135deg, #FF8DD4 0%, #CD8DFF 50%, #74D5FF 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      color: 'transparent',
    };
  } else if (level >= 6) {
    // 레벨 6~9: 노란색 글자
    return {
      fontFamily: 'Cafe24Ssurround',
      color: '#F2D252',
    };
  } else if (level >= 3) {
    // 레벨 3~5: 회색 글자
    return {
      fontFamily: 'Cafe24Ssurround',
      color: '#C0C0C0',
    };
  } else {
    // 레벨 0~2: 갈색 글자
    return {
      fontFamily: 'Cafe24Ssurround',
      color: '#D3A686',
    };
  }
};

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();
  const { userMainPage, userProfile } = useUser();
  const { vocabularySheets, isVocabularySheetsLoading, updateDelayedWords, getDelayedWords } = useVocabulary();
  const [now, setNow] = useState(Date.now());
  const [lastSeen, setLastSeen] = useState(getLastSeenTime());
  const [delayedWords, setDelayedWords] = useState([]);
  const [showTooltip, setShowTooltip] = useState(false);

  // React Compiler가 자동으로 메모이제이션 처리
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

  // React Compiler가 자동으로 메모이제이션 처리
  // 학습 기록이 있는 단어만 카운팅 (repetition > 0 || interval > 0 || nextReview !== null)
  const total = vocabularySheets.reduce((acc, sheet) => {
    if (!sheet.words || !Array.isArray(sheet.words)) return acc;

    const learningWordsCount = sheet.words.filter(word => {
      const repetition = word.memoryState?.repetition ?? word.repetition ?? 0;
      const interval = word.memoryState?.interval ?? word.interval ?? 0;
      const nextReview = word.memoryState?.nextReview ?? word.nextReview;

      // 학습 기록이 있는 단어: repetition > 0 또는 interval > 0 또는 nextReview가 있음
      return repetition > 0 || interval > 0 || (nextReview !== null && nextReview !== undefined);
    }).length;

    return acc + learningWordsCount;
  }, 0);
  // const { pushFullSheet } = useFullSheet();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  // 시간이 흐르면 상태가 바뀌니까 가벼운 폴링(60초)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 앱으로 다시 돌아올 때 즉시 갱신
  useEffect(() => {
    const onFocus = () => setNow(Date.now());
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  // React Compiler가 자동으로 메모이제이션 처리
  // 빨간 점 표시 여부 계산
  const showDot = (() => {
    // delayedWords가 없거나 로딩 중이면 false
    if (!delayedWords || delayedWords.length === 0) return false;

    const words = delayedWords.map(word => ({
      id: word.id,
      nextReviewAt: new Date(word.nextReview).getTime()
    }));
    return shouldShowDot(words, now, lastSeen);
  })();

  // React Compiler가 자동으로 메모이제이션 처리
  // 기한 지난 단어 개수 계산
  const overdueCount = (() => {
    // delayedWords가 없거나 로딩 중이면 0
    if (!delayedWords || delayedWords.length === 0) return 0;

    const words = delayedWords.map(word => ({
      id: word.id,
      nextReviewAt: new Date(word.nextReview).getTime()
    }));
    return getOverdueCount(words, now);
  })();

  const { fetchUserCheckin } = useUser();

  // 홈 화면 진입 시 출석 체크 호출
  useEffect(() => {
    fetchUserCheckin();
  }, []);

  // 복습 지연 단어 목록 업데이트 (데이터 로딩 완료 후에만 실행)
  useEffect(() => {
    // 로딩 중이거나 vocabularySheets가 비어있으면 실행하지 않음
    if (isVocabularySheetsLoading || !vocabularySheets || vocabularySheets.length === 0) return;
    const currentDelayedWords = updateDelayedWords();
    setDelayedWords(currentDelayedWords);
  }, [vocabularySheets, isVocabularySheetsLoading]);

  // 알림 상태가 변경되면 툴팁 자동 숨김
  useEffect(() => {
    if (!showDot) {
      setShowTooltip(false);
    }
  }, [showDot]);

  // 툴팁 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showTooltip && !event.target.closest('.relative')) {
        setShowTooltip(false);
      }
    };

    if (showTooltip) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showTooltip]);

  // React Compiler가 자동으로 useCallback 처리
  const handleStoreButtonClick = () => {
    pushNewFullSheet(StoreNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  const handleBellButtonClick = () => {
    // 알림 상태인 경우: 클릭하면 알림 해제 + 툴팁 토글
    if (showDot) {
      const currentTime = Date.now();
      setLastSeen(currentTime);
      setLastSeenTime(currentTime); // 로컬스토리지에도 저장
      setShowTooltip(!showTooltip);
    } else {
      // 일반 상태인 경우: 툴팁 토글만
      setShowTooltip(!showTooltip);
    }
  }

  const handleTodayStudyButtonClick = () => {
    if (todayStatus.dailyMissionCompleted) {
      navigate('/class');
    } else {
      // 미완료 상태라면 기존처럼 TodayStudyNewFullSheet 열기
      pushNewFullSheet(TodayStudyNewFullSheet, {}, {
        smFull: true,
        closeOnBackdropClick: true
      });
    }
  }

  const handleAchievementClick = (goalType) => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(
      AchievementDetailNewBottomSheet,
      { selectedType: goalType },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );
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
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div className="
        flex justify-between items-center
        pt-[20px] px-[16px] pb-[14px]
      ">
        <img src={logo_h} alt="heyvoca logo" className="h-[25px]" />
        <div className="flex gap-[8px] items-center">
          <div className="relative flex items-center" onClick={() => {
            vibrate({ duration: 5 });
            handleBellButtonClick();
          }}>
            {showDot ? (
              <IconBellRingingFill width={18} height={18} className="text-[#fff]" />
            ) : (
              <IconBell width={18} height={18} className="text-[#fff]" />
            )}

            {/* 툴팁 - 알림 상태일 때는 항상 표시, 일반 상태일 때는 토글 */}
            <AnimatePresence>
              {(showDot || showTooltip) && (
                <motion.div
                  className="
                  absolute top-[100%] right-[0] z-[1]
                  flex items-center
                  w-[max-content]
                  py-[5px] px-[10px]
                  mt-[5px] 
                  rounded-[8px]
                  bg-[#fff]
                  shadow-[0_0_4px_rgba(0,0,0,0.25)]
                "
                  // 툴팁 열기/닫기 애니메이션
                  initial={{
                    opacity: 0,
                    scale: 0.8,
                    y: -10
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    // 알림 상태일 때만 깜빡이는 애니메이션 추가
                    ...(showDot ? {
                      opacity: [1, 0.7, 1],
                      scale: [1, 1.05, 1],
                    } : {})
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0.8,
                    y: -10
                  }}
                  transition={{
                    // 기본 열기/닫기 애니메이션
                    duration: 0.3,
                    ease: "easeOut",
                    // 알림 상태일 때 깜빡이는 애니메이션
                    ...(showDot ? {
                      opacity: {
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                      },
                      scale: {
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }
                    } : {})
                  }}
                >
                  <span
                    className="text-[#111] text-[14px] font-[400]"
                    dangerouslySetInnerHTML={{
                      __html: overdueCount > 0
                        ? `복습 기간이 지난 단어가 <strong>${overdueCount}</strong>개 있어요!`
                        : '알림이 없습니다'
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex gap-[5px] items-center" onClick={() => {
            vibrate({ duration: 5 });
            handleStoreButtonClick();
          }}>
            <img src={gem} alt="보석" className="w-[20px] h-[18px]" />
            <span className="text-[#fff] text-[14px] font-bold">{userProfile.gem_cnt}</span>
          </div>
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
            <strong>{userProfile.username}</strong>님,<br />
            <strong>{total}개</strong><br />
            단어를 학습 중이에요!
          </h2>
          <img src={HeyCharacter02} alt="" className="
            absolute top-[-9px] right-[25px]
            h-[148px]
          " />
          <motion.div
            className="relative flex w-[100%] h-[50px]"
            onClick={() => {
              vibrate({ duration: 5 });
              handleTodayStudyButtonClick();
            }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.04 }}
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
                {todayStatus.dailyMissionCompleted ? '학습하기' : '오늘의 학습하기'}
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
            <h2 className="text-[#111] text-[16px] font-[700]">출석체크</h2>
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
                      <CheckCircle size={30} weight="fill" color="#FF8DD4" />
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
            <div className="grid grid-cols-3 gap-y-4 justify-items-center">
              {userMainPage?.goals?.map((goal, idx) => (
                <div
                  key={goal.type}
                  className="flex flex-col items-center gap-[5px] w-[60px] cursor-pointer"
                  onClick={() => handleAchievementClick(goal.type)}
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
                          [text-shadow:_-1.2px_-1.2px_0_#fff,_1.2px_-1.2px_0_#fff,_-1.2px_1.2px_0_#fff,_1.2px_1.2px_0_#fff]
                        "
                      style={{ ...getAchievementTextStyle(goal.level), fontFamily: 'Cafe24Ssurround, sans-serif' }}
                    >
                      <span className="text-[10px]" style={{ fontFamily: 'Cafe24Ssurround' }}>LV.</span>{goal.level}
                    </span>
                  </div>
                  <span className="text-[#111] text-[12px] font-[600]">
                    {goal.type}
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