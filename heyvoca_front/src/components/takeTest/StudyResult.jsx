import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Circle, X, Check, Star, Leaf, Plant, Carrot, Flame, EggCrack, ArrowRight, ArrowUp } from '@phosphor-icons/react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useUser } from '../../context/UserContext';
import gemImg from '../../assets/images/gem.png';
import DailyMissionComplete from '../../assets/images/DailyMissionComplete.svg';
import WordsStudied from '../../assets/images/WordsStudied.svg';
import ResultItemBackground01 from '../../assets/images/ResultItemBackground01.svg';
import ResultItemBackground02 from '../../assets/images/ResultItemBackground02.svg';
import { vibrate } from '../../utils/osFunction';
import { warmTts } from '../../api/tts';
import MemorizationStatus from '../common/MemorizationStatus';
import SpeakerButton from '../common/SpeakerButton';
import { useTheme } from '../../context/ThemeContext';
import { useExampleSettings } from '../../context/ExampleSettingsContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import WordDetaileNewBottomSheet from '../newBottomSheet/WordDetaileNewBottomSheet';
import ExampleList from '../common/ExampleList';
import { useStatusBarStyle } from '../../hooks/useStatusBarStyle';

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
  '암기왕': MemorizedKing, // 암기왕 = 연속 정답 콤보 최고치 (콤보왕 폐지 후 통합)
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

  // 결과 화면 배경이 프라이머리 계열이라 statusbar 텍스트는 흰색 강제 (페이지 떠나면 자동 복귀)
  useStatusBarStyle('light-content');

  const { isDark } = useTheme();
  const { showExamples } = useExampleSettings();
  const { recentStudy, updateRecentStudy, isRecentStudyLoading, fetchVocabularySheets, setLastSessionResult, getWord } = useVocabulary();
  const { updateUserHistory } = useUser();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  // 결과 단어 클릭 시 단어 상세 바텀시트 — 단어장에 존재할 때만(추천/삭제 등으로 없으면 무시)
  const handleOpenWordDetail = (item) => {
    if (item?.vocabularySheetId == null || item?.id == null) return;
    // getWord는 sheet 미존재 시 throw할 수 있어 방어적으로 조회
    let word = null;
    try {
      word = typeof getWord === 'function' ? getWord(item.vocabularySheetId, item.id) : null;
    } catch {
      word = null;
    }
    if (!word) return;
    vibrate({ duration: 5 });
    pushNewBottomSheet(WordDetaileNewBottomSheet, {
      vocabularyId: item.vocabularySheetId,
      id: item.id,
    });
  };
  const navigate = useNavigate();
  const { state } = useLocation();
  // cardMatch/cardMatchListening 세트는 words 배열을 개별 단어로 flatten
  // state.testQuestions가 없거나 빈 배열이어도 렌더 오류 없이 빈 결과로 처리
  const testQuestions = (state?.testQuestions ?? []).flatMap(q => {
    if (q.questionType === 'cardMatch' || q.questionType === 'cardMatchListening') {
      return (q.words ?? []).map(word => ({
        ...word,
        isCorrect: word.isCorrect ?? q.isCorrect,
        questionType: q.questionType,
        // cardMatch 세트의 reason/priorityBucket을 개별 단어에 전파
        reason: word.reason ?? q.reason ?? null,
        priorityBucket: word.priorityBucket ?? q.priorityBucket ?? null,
        prevMemoryStateKey: word.prevMemoryStateKey ?? q.prevMemoryStateKey ?? null,
        nextMemoryStateKey: word.nextMemoryStateKey ?? q.nextMemoryStateKey ?? null,
      }));
    }
    return q;
  });
  const testType = state.testType;
  // 게스트 맛보기 결과 — 로그인 전용 서버로직(기록 저장·업적·추천 갱신)은 건너뛰고
  // 동일한 결과/보상 화면만 재사용한다. 완료 시 온보딩 가입으로 연결.
  const isGuest = !!state?.guestMode;

  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [resultData, setResultData] = useState(null);
  const [screenList, setScreenList] = useState([]); // 표시할 화면 리스트

  // 학습 결과 저장
  useEffect(() => {
    if (isGuest || (recentStudy && recentStudy[testType] && recentStudy[testType].status === "end")) {
      updateUserHistoryAndNavigate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 결과 페이지 TTS 사전 캐싱 — 단어 클릭/뜻 클릭이 보내는 텍스트를 그대로 워밍.
  // (뜻은 meanings.join(", ") 형태라 학습 중 개별 뜻 워밍과 다름 → 여기서 별도 워밍)
  // 캐시 미스면 클릭 후 생성에 시간이 걸려 autoplay 제스처가 만료되어 소리가 안 나므로 미리 캐싱.
  useEffect(() => {
    const items = [];
    (testQuestions || []).forEach((item) => {
      if (item?.origin) items.push({ text: item.origin, language: 'en' });
      const m = Array.isArray(item?.meanings) ? item.meanings : [];
      if (m.length) items.push({ text: m.join(', '), language: 'ko' });
    });
    warmTts(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateUserHistoryAndNavigate = async () => {
    const correctCnt = testQuestions.filter(question => question.isCorrect).length;
    const incorrectCnt = testQuestions.filter(question => !question.isCorrect).length;
    try {
      let result;
      if (isGuest) {
        // 게스트: 서버 저장 없이 합성 결과 — 가입 시 지급될 보석 +5을 동일 보석 슬라이드로 연출
        result = { gem: { before: 0, after: 5 }, goals: [], today_study_complete: false };
      } else {
        result = await updateUserHistory({
          'correct_cnt': correctCnt,
          'incorrect_cnt': incorrectCnt
        })

        if (!result) return;

        // 학습으로 SM2 nextReview가 갱신됐으니 단어장 다시 불러와 memoryStats(메인 멘트의 dueToday) 갱신
        fetchVocabularySheets();
      }

      setResultData(result);

      // 표시할 화면 리스트 생성
      const screens = [];

      // 새 단어(처음 학습) 개수 집계
      const newWordCount = testQuestions.filter(q => q.priorityBucket === 'new').length;

      // 암기 상태가 좋아진 단어 집계
      const STATE_RANK = { unlearned: 0, leaf: 1, plant: 2, carrot: 3 };
      const improvedWords = testQuestions.filter(q => {
        const before = STATE_RANK[q.prevMemoryStateKey];
        const after = STATE_RANK[q.nextMemoryStateKey];
        return before != null && after != null && after > before;
      });
      const decreasedWords = testQuestions.filter(q => {
        const before = STATE_RANK[q.prevMemoryStateKey];
        const after = STATE_RANK[q.nextMemoryStateKey];
        return before != null && after != null && after < before;
      });
      const byState = improvedWords.reduce((acc, q) => {
        acc[q.nextMemoryStateKey] = (acc[q.nextMemoryStateKey] || 0) + 1;
        return acc;
      }, {});
      // 단어별 변화 리스트 — 재출제로 같은 단어가 중복되면 마지막 결과만 유지
      const improvedMap = new Map();
      improvedWords.forEach(q => improvedMap.set(q.vocaIndexId ?? q.id, q));
      const improvedList = [...improvedMap.values()].map(q => ({
        origin: q.origin,
        from: q.prevMemoryStateKey,
        to: q.nextMemoryStateKey,
      }));

      // 1. 암기 상태 상승 슬라이드 — 제일 먼저 표현 (0개면 건너뜀)
      if (improvedList.length > 0) {
        screens.push({
          type: 'memoryImproved',
          data: { totalCnt: improvedList.length, byState, words: improvedList }
        });
      }

      // 2. 새 단어(처음 학습) 개수 슬라이드 — 0개면 건너뜀
      if (newWordCount > 0) {
        screens.push({
          type: 'newWords',
          data: { totalCnt: newWordCount }
        });
      }

      // 메인 화면 동기부여 멘트용 — 방금 학습 결과 캐시 (게스트는 홈 진입 전이라 생략)
      if (!isGuest && typeof setLastSessionResult === 'function') {
        setLastSessionResult({
          totalCnt:        testQuestions.length,
          correctCnt,
          incorrectCnt,
          improvedCount:   improvedWords.length,
          decreasedCount:  decreasedWords.length,
          newLearnedCount: newWordCount,
          completedAt:     Date.now(),
        });
      }

      // 콤보 슬라이드 (AI 추천 테스트 전용) — 세션 최고 콤보 5 이상이면 표시
      try {
        const rawCombo = sessionStorage.getItem('heyvoca_combo_summary');
        if (rawCombo) {
          sessionStorage.removeItem('heyvoca_combo_summary');
          const comboSummary = JSON.parse(rawCombo);
          if (testType === 'quick' && (comboSummary?.maxCombo ?? 0) >= 5) {
            screens.push({
              type: 'combo',
              data: comboSummary,
            });
          }
        }
      } catch (e) { /* 콤보 요약 파싱 실패는 무시 */ }

      // 출석 표현 페이지 (오늘 첫 학습 = 출석)
      if (result.attend) {
        screens.push({
          type: 'attend',
          data: {}
        });
      }

      // 데일리 미션(신규+복습 달성) 표현 페이지
      if (result.daily_mission_complete) {
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
      navigate('/home');
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
    // 게스트 맛보기: 결과 확인 후 온보딩 회원가입으로 (맛본 답안은 guestStorage에 저장됨)
    if (isGuest) {
      navigate('/onboarding', { state: { step: 'signup' }, replace: true });
      return;
    }
    navigate('/home');
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
                    stroke={isDark ? 'var(--layout-gray-dark)' : 'var(--layout-gray-50)'}
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
              {(() => {
                // cardMatch/cardMatchListening은 여러 단어를 한 세트로 묶어 출제하므로
                // 결과 화면에서는 세트 안의 단어들을 각 카드로 펼쳐서 렌더한다.
                const flat = [];
                testQuestions.forEach((question) => {
                  if (Array.isArray(question.words) && question.words.length > 0) {
                    question.words.forEach((w) => {
                      flat.push({ ...w, isCorrect: question.isCorrect });
                    });
                  } else {
                    flat.push(question);
                  }
                });
                return flat.map((item, index) => {
                  const meaningsArr = Array.isArray(item.meanings) ? item.meanings : [];
                  // FSRS 기반 현재 암기 상태
                  const fsrsReps = item.fsrs?.reps ?? 0;
                  const fsrsStability = Math.round(item.fsrs?.stability ?? 0);
                  const fsrsNextReview = item.fsrs?.next_review ?? null;
                  return (
                    <motion.div
                      key={`${item.id ?? 'q'}-${index}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2 + (index * 0.1) }}
                      onClick={() => handleOpenWordDetail(item)}
                      className={`
                        flex flex-col gap-[10px]
                        px-[20px] py-[18px]
                        rounded-[12px] cursor-pointer
                        ${item.isCorrect ? 'bg-status-success-100 dark:bg-status-success-dark' : 'bg-status-error-50 dark:bg-status-error-dark'}
                      `}
                    >
                      <div className='flex items-center gap-[10px]'>
                        <div className='flex-shrink-0'>
                          {item.isCorrect ? (
                            <Circle size={24} weight="bold" className='text-status-success-500' />
                          ) : (
                            <X size={24} weight="bold" className='text-status-error-500' />
                          )}
                        </div>
                        <div className='flex flex-col flex-1 gap-[5px] min-w-0'>
                          <div className="flex items-center justify-between gap-[8px]">
                            <div className="flex items-center gap-[6px] min-w-0">
                              <h3 className="text-[16px] font-[700] text-layout-black dark:text-layout-white truncate">
                                {item.origin}
                              </h3>
                              <SpeakerButton text={item.origin} lang="en" size={16} label="단어 발음 듣기" />
                            </div>
                            <MemorizationStatus
                              repetition={fsrsReps}
                              interval={fsrsStability}
                              ef={2.5}
                              nextReview={fsrsNextReview}
                              wordId={item.id}
                              useRandomMessages={false}
                              forceText={item.priorityBucket === 'new' ? 'NEW' : null}
                            />
                          </div>
                          <p className="text-[12px] font-[400] text-layout-gray-400 dark:text-layout-gray-50">
                            {meaningsArr.join(', ')}
                          </p>
                          {showExamples && <ExampleList examples={item.examples} className="mt-[2px]" />}
                        </div>
                      </div>
                    </motion.div>
                  );
                });
              })()}
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
            {testType !== 'quick' && !isGuest && (
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
            >{isGuest ? '계속하기' : '학습 종료'}</motion.button>
          </div>
        </motion.div>
      );
    }

    // 암기 상태 상승 화면 — 전체 화면 차지 + 상단 아이콘에 오로라 고정(스크롤해도 따라다님)
    if (currentScreen.type === 'memoryImproved') {
      const STATE_INFO = {
        unlearned: { Icon: EggCrack, color: '#9D835A' },
        leaf:      { Icon: Leaf,     color: '#77CE4F' },
        plant:     { Icon: Plant,    color: '#38CE38' },
        carrot:    { Icon: Carrot,   color: '#F68300' },
      };
      const words = currentScreen.data.words ?? [];

      // 다른 리워드 슬라이드와 동일한 형식 — 헤더는 고정, 아래 콘텐츠만 슬라이드
      return (
        <div className='relative flex flex-col h-[100dvh] bg-layout-white dark:bg-layout-black'>
          <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
          {/* 고정 헤더 (슬라이드와 무관하게 항상 고정) */}
          <div
            className='absolute left-0 flex items-end justify-center w-full h-[55px] px-[16px] py-[14px] z-20'
            style={{ top: 'var(--status-bar-height)' }}
          >
            <div className="center">
              <h2 className='text-[18px] font-[700] leading-[21px]'>학습 결과</h2>
            </div>
          </div>

          {/* 슬라이드되는 영역 (콘텐츠만) */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentScreenIndex}
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '-100%', opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30, duration: 0.5 }}
              className='relative flex flex-col flex-1 pt-[55px] overflow-hidden'
            >
              {/* 상단 아이콘 + 오로라 */}
              <div className='relative flex flex-col items-center justify-center pt-[24px] pb-[20px] shrink-0'>
                {/* 오로라 글로우 — 아이콘 뒤에서 회전 */}
                <div className='pointer-events-none absolute top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] w-[240px] h-[240px] z-0'>
                  <motion.img
                    src={ResultItemBackground01}
                    alt=""
                    className='w-full h-full object-contain'
                    animate={{ rotate: [0, 360, 720], scale: [1, 1.6, 1, 1.6, 1], opacity: [0.7, 1, 0.7, 1, 0.7] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  />
                </div>
                <motion.div
                  className='relative z-10 flex items-center justify-center w-[80px] h-[80px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark'
                  initial={{ scale: 0, opacity: 0, rotate: -180 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{
                    scale: { type: 'spring', stiffness: 200, damping: 15, duration: 0.6 },
                    rotate: { type: 'spring', stiffness: 200, damping: 15, duration: 0.6 },
                    opacity: { duration: 0.6 },
                  }}
                >
                  {/* 상승 화살표 — 영역 중앙 고정, 아래→중앙 안착 후 위로 사라짐 반복 */}
                  <motion.span
                    className='text-status-success-500'
                    animate={{ y: [14, 0, 0, -16], opacity: [0, 1, 1, 0] }}
                    transition={{
                      duration: 1.6,
                      times: [0, 0.22, 0.62, 1],
                      repeat: Infinity,
                      repeatDelay: 0.2,
                      ease: 'easeOut',
                    }}
                  >
                    <ArrowUp size={40} weight="bold" />
                  </motion.span>
                </motion.div>
                <motion.p
                  className='relative z-10 text-[16px] font-[700] mt-[14px] text-center'
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                >
                  <strong className='text-primary-main-600'>{currentScreen.data.totalCnt}개</strong>의 단어 암기 상태가 상승했어요!
                </motion.p>
              </div>

              {/* 변경 단어 목록 — 화면 전체 스크롤 영역 */}
              <div className='flex-1 overflow-y-auto scrollbar-hide px-[20px] pb-[100px]'>
                <motion.div
                  className='flex flex-col gap-[8px]'
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.4 }}
                >
                  {words.map((w, i) => {
                    const FromInfo = STATE_INFO[w.from] ?? STATE_INFO.unlearned;
                    const ToInfo = STATE_INFO[w.to] ?? STATE_INFO.leaf;
                    return (
                      <div
                        key={`${w.origin}-${i}`}
                        className='flex items-center justify-between py-[14px] px-[16px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark'
                      >
                        <span className='text-[15px] font-[700] text-layout-black dark:text-layout-white truncate'>
                          {w.origin}
                        </span>
                        <span className='flex items-center gap-[8px] flex-shrink-0 ml-[10px]'>
                          <FromInfo.Icon size={16} weight='fill' color={FromInfo.color} />
                          <ArrowRight size={14} weight='bold' className='text-layout-gray-300' />
                          <ToInfo.Icon size={20} weight='fill' color={ToInfo.color} />
                        </span>
                      </div>
                    );
                  })}
                </motion.div>
              </div>

              {/* 확인 버튼 */}
              <div
                className="absolute bottom-0 left-0 right-0 flex items-center justify-center p-[16px] py-[20px]"
                style={{ background: `${isDark ? 'var(--layout-black)' : 'linear-gradient(0deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 25%, var(--layout-white) 100%)'}` }}
              >
                <motion.button
                  className="w-full h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700]"
                  onClick={() => { vibrate({ duration: 5 }); handleNextScreen(); }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                >확인</motion.button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      );
    }

    // 나머지 화면들 (attend, newWords, dailyMission, achievement, gem)
    let content = null;

    if (currentScreen.type === 'attend') {
      // 출석 (오늘 첫 학습)
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px]'>
          <motion.img
            src={AttendanceKing}
            alt="출석"
            className='w-[100px] h-[100px] object-contain'
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1, 1.1, 1], opacity: 1, rotate: [0, 5, -5, 0] }}
            transition={{
              scale: { type: "tween", ease: "easeOut", duration: 0.6, times: [0, 0.5, 0.7, 0.85, 1] },
              opacity: { duration: 0.6 },
              rotate: { delay: 0.8, duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" },
            }}
          />
          <motion.p
            className='text-[16px] font-[700]'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            오늘도 <strong className='text-primary-main-600'>출석 완료</strong>!
          </motion.p>
        </div>
      );
    } else if (currentScreen.type === 'newWords') {
      // 이번 학습으로 처음 학습한 단어 개수
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px]'>
          <motion.img
            src={WordsStudied}
            alt="새 단어 학습"
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
            <strong className='text-primary-main-600'>새 단어 {currentScreen.data.totalCnt}개</strong>를 학습했어요!
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
    } else if (currentScreen.type === 'combo') {
      // 콤보 달성 (AI 추천 테스트)
      const { maxCombo, bestUpdated } = currentScreen.data;
      // 불꽃 계열(주황)로 — 아이콘 + 한 줄만 두어 오로라 중앙 아이콘 정렬 유지
      content = (
        <div className='relative flex flex-col items-center justify-center gap-[15px]'>
          <motion.div
            className='flex items-center justify-center w-[100px] h-[100px] rounded-full bg-[#FFF1DE] dark:bg-layout-gray-dark'
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.2, 1, 1.1, 1], opacity: 1 }}
            transition={{
              scale: { type: "tween", ease: "easeOut", duration: 0.6, times: [0, 0.5, 0.7, 0.85, 1] },
              opacity: { duration: 0.6 },
            }}
          >
            <Flame weight="fill" className='text-[56px] text-[#FF7A00]' />
          </motion.div>
          <motion.p
            className='text-[16px] font-[700] text-center'
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {bestUpdated ? (
              <><strong className='text-[#FF7A00]'>최고 기록 갱신!</strong> {maxCombo}콤보</>
            ) : (
              <><strong className='text-[#FF7A00]'>연속 정답 {maxCombo}콤보</strong> 달성!</>
            )}
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
        <div
          className='
            absolute left-0
            flex items-end justify-center
            w-full h-[55px]
            px-[16px] py-[14px]
            z-20
          '
          style={{ top: 'var(--status-bar-height)' }}
        >
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
    // 학습 결과 API 응답 대기 중 — 깜빡임 방지를 위해 빈 화면 (배경은 다음 화면과 동일하게 프라이머리 톤 유지)
    return <div className='h-[100dvh] bg-primary-main-100 dark:bg-layout-gray-dark' />;
  }

  return (
    <AnimatePresence mode="wait">
      {renderScreenContent()}
    </AnimatePresence>
  );
};

export default StudyResult;
