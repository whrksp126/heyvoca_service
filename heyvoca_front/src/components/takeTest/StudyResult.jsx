import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, X, Check, Star } from '@phosphor-icons/react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useUser } from '../../context/UserContext';
import gemImg from '../../assets/images/gem.png';
import DailyMissionComplete from '../../assets/images/DailyMissionComplete.svg';
import WordsStudied from '../../assets/images/WordsStudied.svg';
import ResultItemBackground01 from '../../assets/images/ResultItemBackground01.svg';
import ResultItemBackground02 from '../../assets/images/ResultItemBackground02.svg';
import { vibrate } from '../../utils/osFunction';
import { getTextSound } from '../../utils/common';
import MemorizationStatus from '../common/MemorizationStatus';
import { useTheme } from '../../context/ThemeContext';

// 업적 이미지 import
import InviteKing from '../../assets/images/HeyCharacter/InviteKing.png';
import AttendanceKing from '../../assets/images/HeyCharacter/AttendanceKing.png';
import NoryeokKing from '../../assets/images/HeyCharacter/NoryeokKing.png';
import WordKing from '../../assets/images/HeyCharacter/WordKing.png';
import PerseveranceKing from '../../assets/images/HeyCharacter/PerseveranceKing.png';
import ReadingKing from '../../assets/images/HeyCharacter/ReadingKing.png';
import MemorizedKing from '../../assets/images/HeyCharacter/MemorizedKing.png';

// 업적 타입과 이미지 매핑
const ACHIEVEMENT_IMAGES = {
  '초대왕': InviteKing,
  '출석왕': AttendanceKing,
  '노력왕': NoryeokKing,
  '단어왕': WordKing,
  '끈기왕': PerseveranceKing,
  '독서왕': ReadingKing,
  '암기왕': MemorizedKing,
};

// 레벨별 배경 색상 및 스타일
const getAchievementBackgroundStyle = (level) => {
  if (level >= 10) {
    // 레벨 10 이상: 그라데이션
    return {
      background: 'linear-gradient(135deg, var(--primary-main-600) 0%, #CD8DFF 50%, #74D5FF 100%)',
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
      background: 'linear-gradient(135deg, var(--primary-main-600) 0%, #CD8DFF 50%, #74D5FF 100%)',
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

const StudyResult = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { isDark } = useTheme();
  const { recentStudy, updateRecentStudy, isRecentStudyLoading } = useVocabulary();
  const { updateUserHistory } = useUser();
  const navigate = useNavigate();
  const { state } = useLocation();
  const testQuestions = state.testQuestions;
  const testType = state.testType;

  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [resultData, setResultData] = useState(null);
  const [screenList, setScreenList] = useState([]); // 표시할 화면 리스트

  // 학습 결과 저장
  useEffect(() => {
    if (recentStudy && recentStudy[testType] && recentStudy[testType].status === "end") {
      updateUserHistoryAndNavigate()
    }
  }, [])

  const updateUserHistoryAndNavigate = async () => {
    const correctCnt = testQuestions.filter(question => question.isCorrect).length;
    const incorrectCnt = testQuestions.filter(question => !question.isCorrect).length;
    try {
      const result = await updateUserHistory({
        'today_study_complete': testType === "today" ? true : false,
        'correct_cnt': correctCnt,
        'incorrect_cnt': incorrectCnt
      })

      if (!result) return;

      setResultData(result);

      // 표시할 화면 리스트 생성
      const screens = [];

      // 1. 단어 학습 갯수와 정답 수를 이용해서 멘트 표현 (항상 표시)
      screens.push({
        type: 'words',
        data: { totalCnt: testQuestions.length }
      });

      // 2. 데일리 미션 달성 표현 페이지
      if (result.today_study_complete) {
        screens.push({
          type: 'dailyMission',
          data: {}
        });
      }

      // 3. 업적 달성 표현 페이지 (각 업적마다 별도 화면 추가)
      if (result.goals && result.goals.length > 0) {
        result.goals.forEach((goal) => {
          screens.push({
            type: 'achievement',
            data: { goal }
          });
        });
      }

      // 4. 보석 획득 표현 페이지
      if (result.gem && result.gem.after > result.gem.before) {
        screens.push({
          type: 'gem',
          data: { gemCount: result.gem.after - result.gem.before }
        });
      }

      // 5. 학습 결과 페이지 (항상 마지막)
      screens.push({
        type: 'result',
        data: {}
      });

      setScreenList(screens);
      setCurrentScreenIndex(0); // 첫 번째 화면부터 시작

    } catch (err) {
      console.log("오류 발생함")
    }
  }

  const handleNextScreen = () => {
    if (currentScreenIndex < screenList.length - 1) {
      setCurrentScreenIndex(currentScreenIndex + 1);
    }
  }

  useEffect(() => {
    if (recentStudy && recentStudy[testType] && recentStudy[testType].status === "learning") {
      navigate('/class');
    }
  }, [isRecentStudyLoading]);

  const onClickTestAgain = async () => {
    // 요소의 순서를 랜덤으로 섞어서 반환
    // options을 랜덤으로 섞고, 정답의 index(resultIndex)도 새로 계산
    const tempTestQuestions = recentStudy[testType].study_data
      .map((question) => {
        // 기존 정답(원래 options에서 resultIndex로 찾음)
        const correctAnswer = question.options[question.resultIndex];
        // options을 랜덤으로 섞음
        const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5);
        // 섞인 options에서 정답의 index를 다시 찾음
        const newResultIndex = shuffledOptions.findIndex(opt => opt.id === correctAnswer.id);
        return {
          ...question,
          isCorrect: null,
          userResultIndex: null,
          options: shuffledOptions,
          resultIndex: newResultIndex,
        };
      })
      .sort(() => Math.random() - 0.5);
    await updateRecentStudy(testType, {
      ...recentStudy[testType],
      status: "learning",
      progress_index: 0,
      study_data: tempTestQuestions,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    navigate('/take-test', {
      state: {
        testType: testType
      }
    });
  }

  const onClickEndStudy = async () => {
    testType === "today" ? navigate('/home') : navigate('/class');
  }

  // 화면별 렌더링
  const renderScreenContent = () => {
    if (screenList.length === 0 || currentScreenIndex >= screenList.length) return null;

    const currentScreen = screenList[currentScreenIndex];
    if (!currentScreen) return null;

    // 학습 결과 화면 (마지막 화면)
    if (currentScreen.type === 'result') {
      const totalQuestions = testQuestions.length;
      const correctQuestions = testQuestions.filter(q => q.isCorrect).length;
      const score = Math.round((correctQuestions / totalQuestions) * 100);

      return (
        <motion.div
          key={currentScreenIndex}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            duration: 0.5
          }}
          className='relative flex flex-col h-[100dvh] bg-layout-white dark:bg-layout-black'
        >
          <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
          <div className='
            relative
            flex items-end justify-center
            w-full h-[55px]
            px-[16px] py-[14px]
          '>
            <div className="center">
              <h2 className='text-[18px] font-[700] leading-[21px]'>
                학습 결과
              </h2>
            </div>
          </div>

          <div className='flex flex-col flex-1 overflow-y-auto scrollbar-hide pb-[100px]'>
            {/* 프로그레스 서클 영역 */}
            <div className='flex flex-col items-center justify-center py-[40px]'>
              <div className='relative w-[238px] h-[238px] flex items-center justify-center'>
                {/* SVG 영역: 반시계 방향을 위해 scaleY(-1)과 rotate(-90) 적용 */}
                <svg
                  className='absolute w-full h-full transform -rotate-90 -scale-y-100'
                  viewBox="0 0 238 238"
                >
                  {/* 안쪽 배경 회색 원 (프로그레스 바가 지나갈 길) */}
                  <circle
                    cx="119"
                    cy="119"
                    r="104.8"
                    fill="none"
                    stroke="var(--layout-gray-50)"
                    strokeWidth="28.4"
                  />
                  {/* 실제 핑크색 프로그레스 바 (반시계 방향으로 채워짐) */}
                  {correctQuestions > 0 && (
                    <motion.circle
                      cx="119"
                      cy="119"
                      r="104.8"
                      fill="none"
                      stroke="var(--primary-main-600)"
                      strokeWidth="28.4"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: correctQuestions / totalQuestions }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                  )}
                </svg>
                {/* 중앙 텍스트 */}
                <div className='flex flex-col items-center justify-center z-10'>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                    className='text-[36px] font-[700] text-primary-main-600'
                  >
                    {score}점
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 0.5 }}
                  >
                    <span className='text-[14px] font-[700] text-primary-main-600'>{correctQuestions}</span>
                    <span className='text-[14px] font-[400] text-layout-gray-200'>/{totalQuestions}</span>
                  </motion.div>
                </div>
              </div>
            </div>

            {/* 단어 목록 영역 */}
            <div className='flex flex-col gap-[12px] px-[20px]'>
              {testQuestions.map((question, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.2 + (index * 0.1) }}
                  className={`
                    flex flex-col gap-[10px] 
                    px-[20px] py-[18px]
                    rounded-[12px]
                    ${question.isCorrect ? 'bg-status-success-100' : 'bg-status-error-50'}  
                  `}
                >
                  <div className='flex items-center gap-[10px]'>
                    <div className='flex-shrink-0'>
                      {question.isCorrect ? (
                        <Circle size={24} weight="bold" className='text-status-success-500' />
                      ) : (
                        <X size={24} weight="bold" className='text-status-error-500' />
                      )}
                    </div>
                    <div className='flex flex-col flex-1 gap-[5px]'>
                      <div className="flex items-center justify-between">
                        <h3
                          onClick={() => getTextSound(question.origin, "en")}
                          className="text-[16px] font-[700] text-layout-black cursor-pointer"
                        >
                          {question.origin}
                        </h3>
                        <MemorizationStatus
                          repetition={question.sm2?.repetition ?? question.repetition ?? 0}
                          interval={question.sm2?.interval ?? question.interval ?? 0}
                          ef={question.sm2?.ef ?? question.ef ?? 2.5}
                          nextReview={question.sm2?.nextReview ?? question.nextReview}
                          wordId={question.id}
                          useRandomMessages={false}
                        />
                      </div>
                      <p
                        onClick={() => getTextSound(question.meanings.join(", "), "ko")}
                        className="text-[12px] font-[400] text-layout-gray-400 cursor-pointer"
                      >
                        {question.meanings.join(', ')}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <div
            className="
              absolute bottom-0 left-0 right-0
              flex items-center justify-between gap-[15px] 
              p-[16px] py-[20px]
            "
            style={{
              background: `${isDark ? 'var(--layout-black)' : 'linear-gradient(0deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 25%, var(--layout-white) 100%)'}`
            }}
          >
            {testType !== "today" && (
              <motion.button
                className="
                    flex-1
                    h-[45px]
                    rounded-[8px]
                    bg-layout-gray-200
                    text-layout-white dark:text-layout-black text-[16px] font-[700]
                  "
                onClick={() => {
                  vibrate({ duration: 5 });
                  onClickTestAgain();
                }}
                whileTap={{ scale: 0.95 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 15
                }}
              >테스트 다시 하기</motion.button>
            )}
            <motion.button
              className="
                  flex-1
                  h-[45px]
                  rounded-[8px]
                  bg-primary-main-600
                  text-layout-white dark:text-layout-black text-[16px] font-[700]
                "
              onClick={() => {
                vibrate({ duration: 5 });
                onClickEndStudy();
              }}
              whileTap={{ scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 15
              }}
            >학습 종료</motion.button>
          </div>
        </motion.div>
      );
    }

    // 나머지 화면들 (words, dailyMission, achievement, gem)
    let content = null;

    if (currentScreen.type === 'words') {
      // 단어 학습 갯수와 정답 수를 이용한 멘트
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px]'>
          <motion.img
            src={WordsStudied}
            alt="단어 학습"
            className='w-[100px] h-[100px] object-contain'
            initial={{ scale: 0, opacity: 0, rotate: -180 }}
            animate={{
              scale: 1,
              opacity: 1,
              rotate: 0,
              y: [0, -10, 0]
            }}
            transition={{
              scale: {
                type: "spring",
                stiffness: 200,
                damping: 15,
                duration: 0.6
              },
              rotate: {
                type: "spring",
                stiffness: 200,
                damping: 15,
                duration: 0.6
              },
              opacity: {
                duration: 0.6
              },
              y: {
                delay: 0.8,
                duration: 2,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut"
              }
            }}
          />
          <motion.p
            className='text-[16px] font-[700]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.3,
              duration: 0.5
            }}
          >
            <strong className='text-primary-main-600'>단어 {currentScreen.data.totalCnt}개</strong>를 학습했어요!
          </motion.p>
        </div>
      );
    } else if (currentScreen.type === 'dailyMission') {
      // 데일리 미션 달성
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px]'>
          <motion.img
            src={DailyMissionComplete}
            alt="데일리 미션 완료"
            className='w-[100px] h-[100px] object-contain'
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.2, 1, 1.1, 1],
              opacity: 1,
              rotate: [0, 5, -5, 0]
            }}
            transition={{
              scale: {
                type: "tween",
                ease: "easeOut",
                duration: 0.6,
                times: [0, 0.5, 0.7, 0.85, 1]
              },
              opacity: {
                duration: 0.6
              },
              rotate: {
                delay: 0.8,
                duration: 3,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut"
              }
            }}
          />
          <motion.p
            className='text-[16px] font-[700]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.3,
              duration: 0.5
            }}
          >
            <strong className='text-primary-main-600'>데일리 미션</strong>을 완료했어요!
          </motion.p>
        </div>
      );
    } else if (currentScreen.type === 'achievement') {
      // 업적 달성
      const goal = currentScreen.data.goal;
      if (!goal) return null;

      const goalType = goal?.type || '단어왕';
      const goalLevel = goal?.level || 0;
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[20px]'>
          {/* 업적 이미지와 레벨 표시 */}
          <motion.div
            className="relative h-[70px]"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: [0, -8, 0]
            }}
            transition={{
              scale: {
                type: "spring",
                stiffness: 200,
                damping: 15,
                duration: 0.6
              },
              opacity: {
                duration: 0.6
              },
              y: {
                delay: 0.7,
                duration: 2.5,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut"
              }
            }}
          >
            <img
              src={ACHIEVEMENT_IMAGES[goalType]}
              alt={goalType}
              className="absolute bottom-[10px] left-[50%] translate-x-[-50%] w-[60px] h-[60px] object-contain"
            />
            <div
              className="w-[60px] h-[60px] rounded-[50%]"
              style={getAchievementBackgroundStyle(goalLevel)}
            ></div>
            <span
              className="
                absolute bottom-[0] left-[50%] 
                translate-x-[-50%]
                text-[16px] font-[700]
                font-family: 'Cafe24Ssurround', sans-serif;
                [text-shadow:_-1.2px_-1.2px_0_var(--layout-white),_1.2px_-1.2px_0_var(--layout-white),_-1.2px_1.2px_0_var(--layout-white),_1.2px_1.2px_0_var(--layout-white)]
              "
              style={getAchievementTextStyle(goalLevel)}
            >
              <span className="text-[10px]">LV.</span>{goalLevel}
            </span>
          </motion.div>
          <motion.p
            className='text-[16px] font-[700]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.5,
              duration: 0.5
            }}
          >
            <strong className='text-primary-main-600'>{goalType} {goalLevel}레벨</strong>을 달성했어요!
          </motion.p>
        </div>
      );
    } else if (currentScreen.type === 'gem') {
      // 보석 획득
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px]'>
          <motion.img
            src={gemImg}
            alt="보석"
            className='w-[100px] h-[100px] object-contain'
            initial={{ scale: 0, opacity: 0, rotate: -180 }}
            animate={{
              scale: [0, 1.3, 1, 1.15, 1],
              opacity: 1,
              rotate: [0, 10, -10, 0]
            }}
            transition={{
              scale: {
                type: "tween",
                ease: "easeOut",
                duration: 0.7,
                times: [0, 0.5, 0.7, 0.85, 1]
              },
              opacity: {
                duration: 0.7
              },
              rotate: {
                delay: 1,
                duration: 2.5,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut"
              }
            }}
          />
          <motion.p
            className='text-[16px] font-[700]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.3,
              duration: 0.5
            }}
          >
            <strong className='text-primary-main-600'>보석 {currentScreen.data.gemCount}개</strong>를 획득했어요!
          </motion.p>
        </div>
      );
    }

    // 나머지 화면들 (words, dailyMission, achievement, gem) - 헤더 + 확인 버튼
    if (!content) return null;

    return (
      <div className='relative flex flex-col h-[100dvh]'>
        <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
        {/* 고정 헤더 */}
        <div className='
          absolute top-0 left-0
          flex items-end justify-center
          w-full h-[55px]
          px-[16px] py-[14px]
          z-20
        '>
          <div className="center">
            <h2 className='text-[18px] font-[700] leading-[21px]'>
              학습 결과
            </h2>
          </div>
        </div>
        {/* 슬라이드되는 영역 (컨텐츠 + 확인 버튼) */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentScreenIndex}
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30,
              duration: 0.5
            }}
            className='relative flex flex-col flex-1 pt-[55px] overflow-hidden'
          >
            {/* 컨텐츠 영역 */}
            <div className='
              relative transform -translate-y-[55px]
              flex flex-col items-center justify-center flex-1
              px-[20px] py-[40px]
            '>
              {/* 핑크 글로우 배경 효과 */}
              {/* ResultItemBackground01: 크기 변화 + 회전 + 섬광 효과 */}
              <div className='absolute top-[50%] left-[50%] z-10 translate-x-[-50%] translate-y-[-50%] w-[230px] h-[230px]'>
                <motion.img
                  src={ResultItemBackground01}
                  alt="결과 아이템 배경"
                  className='w-full h-full object-contain'
                  animate={{
                    rotate: [0, 360, 720],
                    scale: [1, 2, 1, 2, 1],
                    opacity: [0.8, 1, 0.8, 1, 0.8],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </div>
              {/* ResultItemBackground02: 투명도 + 확대/축소 */}
              <div className='absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[757px] h-[600px]'>
                <motion.img
                  src={ResultItemBackground02}
                  alt="결과 아이템 배경"
                  className='w-full h-full object-contain'
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </div>

              {/* 콘텐츠 */}

              <div className='relative z-10 w-full flex flex-col items-center justify-center'>
                {content}
              </div>
            </div>
            {/* 확인 버튼 */}
            <div
              className="
                relative
                flex items-center justify-center
                p-[16px] py-[20px]
                z-10
              "
              style={{
                background: `${isDark ? 'var(--layout-black)' : 'linear-gradient(0deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 25%, var(--layout-white) 100%'}`
              }}
            >
              <motion.button
                className="
                  w-full
                  h-[45px]
                  rounded-[8px]
                  bg-primary-main-600
                  text-layout-white dark:text-layout-black text-[16px] font-[700]
                "
                onClick={() => {
                  vibrate({ duration: 5 });
                  handleNextScreen();
                }}
                whileTap={{ scale: 0.95 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 15
                }}
              >확인</motion.button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  if (screenList.length === 0) {
    return (
      <div className='relative flex flex-col h-[100dvh] items-center justify-center'>
        <div>로딩 중...</div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {renderScreenContent()}
    </AnimatePresence>
  );
};

export default StudyResult;
