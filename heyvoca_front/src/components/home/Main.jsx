// src/components/home/main
import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import logo_h from '../../assets/images/logo_h.png';
import HeyCharacter02 from '../../assets/images/HeyCharacter02.png';
import gem from '../../assets/images/gem.png';
import { useVocabulary } from '../../context/VocabularyContext';
import { Heart, CheckCircle, CircleDashed, CaretRight } from '@phosphor-icons/react';
import { useUser } from '../../context/UserContext';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { UnlockGuideNewBottomSheet } from '../newBottomSheet/UnlockGuideNewBottomSheet';

// import { useFullSheet } from '../../context/FullSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';

import InviteKing from '../../assets/images/HeyCharacter/InviteKing.png';
import AttendanceKing from '../../assets/images/HeyCharacter/AttendanceKing.png';
import NoryeokKing from '../../assets/images/HeyCharacter/NoryeokKing.png';
import PerseveranceKing from '../../assets/images/HeyCharacter/PerseveranceKing.png';
import ReadingKing from '../../assets/images/HeyCharacter/ReadingKing.png';
import MemorizedKing from '../../assets/images/HeyCharacter/MemorizedKing.png';
import { vibrate, checkNotificationPermissionGranted, isAppVersionAtLeast } from '../../utils/osFunction';
import { getHomeGreeting } from '../../utils/homeGreeting';
import { useStats } from '../../context/StatsContext';
import { prefetchLabSettings } from '../../api/lab';


// import StoreSheet from './StoreSheet';
// import TodayStudySheet from './TodayStudySheet';
import { useTheme } from '../../context/ThemeContext';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';
import StudyNewFullSheet from '../newfullsheet/StudyNewFullSheet';
import { GemPurchaseNewBottomSheet } from '../newBottomSheet/GemPurchaseNewBottomSheet';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useOverlayActions } from '../../context/OverlayContext';
import { AchievementDetailNewBottomSheet } from '../newBottomSheet/AchievementDetailNewBottomSheet';
import AttendanceCalendarOverlay from '../overlay/AttendanceCalendarOverlay';
import { NotifPermissionNewBottomSheet } from '../newBottomSheet/NotifPermissionNewBottomSheet';
import FarmSummaryCard from './FarmSummaryCard';
import StreakCard from './StreakCard';

// 업적 타입과 이미지 매핑
const ACHIEVEMENT_IMAGES = {
  '초대왕': InviteKing,
  '출석왕': AttendanceKing,
  '노력왕': NoryeokKing,
  '끈기왕': PerseveranceKing,
  '독서왕': ReadingKing,
  '암기왕': MemorizedKing, // 암기왕 = 연속 정답 콤보 (콤보왕 폐지 후 통합)
};

// 레벨별 배경 색상 및 스타일
const getAchievementBackgroundStyle = (level) => {
  if (level >= 10) {
    // 레벨 10 이상: 그라데이션
    return {
      background: 'linear-gradient(135deg, #FF70D4 0%, #CD8DFF 50%, #74D5FF 100%)',
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
      background: 'linear-gradient(135deg, #FF70D4 0%, #CD8DFF 50%, #74D5FF 100%)',
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
  const { isDark } = useTheme();
  const { vocabularySheets, memoryStats, lastSessionResult } = useVocabulary();

  // 통계는 StatsContext(라우터 바깥 캐시)에서 구독 — 탭 전환마다 재조회/스피너 없이 캐시값을 즉시 사용,
  // 학습 세션 완료 시에만 조용히 갱신된다.
  const { todaySummary, reviewSchedule } = useStats();
  const todayNewWords = todaySummary?.new_words ?? 0;
  // 오늘 복습 완료 수 (today-summary)
  const todayReviewsDone = todaySummary?.reviews_done ?? 0;
  // 백엔드 KST+새벽4시 컷오프 기준 reviewDue (null이면 클라이언트 계산값 폴백)
  const backendReviewDue = reviewSchedule?.due
    ? ((reviewSchedule.due.overdue ?? 0) + (reviewSchedule.due.today ?? 0))
    : null;

  // memoryStats를 백엔드 reviewDue로 오버라이드 (KST+4시 기준 일치)
  const effectiveStats = backendReviewDue !== null
    ? { ...memoryStats, reviewDue: backendReviewDue }
    : memoryStats;
  const dailyNewLimit = userProfile?.daily_new_limit ?? 0;
  // useMemo로 감싸 입력이 바뀌지 않는 한 같은 방문 내 재셔플 방지.
  // 홈 재진입(remount) 시에는 새로 뽑힌다.
  const greeting = useMemo(
    () => getHomeGreeting(effectiveStats, lastSessionResult, todayNewWords, dailyNewLimit),
    // effectiveStats 객체 참조 대신 핵심 필드를 의존성으로 나열해 불필요한 재계산 방지.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      effectiveStats?.reviewDue,
      effectiveStats?.unlearned,
      effectiveStats?.longTerm,
      effectiveStats?.shortTerm,
      effectiveStats?.mediumTerm,
      effectiveStats?.total,
      lastSessionResult?.completedAt,
      todayNewWords,
      dailyNewLimit,
    ]
  );

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

  // const { pushFullSheet } = useFullSheet();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const { showAwaitOverlay } = useOverlayActions();

  // 온보딩 행동 기반 미션 — legacy거나 전부 완료면 노출 안 함
  const { legacy: unlockLegacy, missions: unlockMissions, currentMission } = useOnboardingUnlock();
  const currentMissionData = unlockMissions.find((m) => m.key === currentMission);
  const showMissionBanner = !unlockLegacy && !!currentMissionData;
  // 미션 title(예: "단어장 직접 만들기 완료")에서 '완료' 접미어를 떼어 행동 표현으로 변환
  const currentMissionAction = currentMissionData?.title?.replace(/\s*완료\s*$/, '').trim();

  const handleMissionBannerClick = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(
      UnlockGuideNewBottomSheet,
      { highlightKey: currentMissionData?.unlocks },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true }
    );
  };

  const { fetchUserCheckin } = useUser();

  // 홈 화면 진입 시 출석 체크 호출 + (실험실 지원 앱 버전에서만) 실험실 설정 프리로드
  useEffect(() => {
    fetchUserCheckin();
    if (isAppVersionAtLeast('1.1.0')) prefetchLabSettings();
  }, []);

  // 온보딩→가입→로그인 후 홈 첫 진입 시 1회 알림 권한 프롬프트 (온보딩 signup에서 플래그 설정)
  // 단, 이미 OS 알림 권한이 허용된 유저에게는 굳이 다시 물어볼 필요가 없으므로
  // 프롬프트를 띄우기 전에 현재 권한 상태를 먼저 확인해 이미 허용된 경우 스킵한다.
  useEffect(() => {
    let pending = null;
    try { pending = localStorage.getItem('heyvoca_notif_prompt'); } catch (e) { pending = null; }
    if (pending !== '1') return;
    if (!userProfile || !userProfile.id) return;
    try { localStorage.removeItem('heyvoca_notif_prompt'); } catch (e) { /* noop */ }

    let cancelled = false;
    let t = null;
    checkNotificationPermissionGranted().then((granted) => {
      if (cancelled) return;
      if (granted === true) return; // 이미 허용됨 → 바텀시트 노출 없이 플래그만 소비
      t = setTimeout(() => {
        pushNewBottomSheet(NotifPermissionNewBottomSheet, {}, { isBackdropClickClosable: true, isDragToCloseEnabled: true });
      }, 700);
    });
    return () => { cancelled = true; if (t) clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id]);

  // 오늘 요약/복습 due/오늘의 기억 변화는 StatsContext에서 구독한다(위 useStats).
  // 학습 직후(lastSessionResult 변경) 갱신은 StatsProvider가 담당하므로 여기서 별도 조회하지 않는다.

  // React Compiler가 자동으로 useCallback 처리
  const handleStoreButtonClick = () => {
    pushNewFullSheet(StoreNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  const handleTodayStudyButtonClick = () => {
    pushNewFullSheet(StudyNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  const handleAchievementClick = (goalType) => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(
      AchievementDetailNewBottomSheet,
      { selectedType: goalType },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: false
      }
    );
  }

  const handleAttendanceClick = () => {
    vibrate({ duration: 5 });
    showAwaitOverlay(AttendanceCalendarOverlay, {
      initialYear: new Date().getFullYear(),
      initialMonth: new Date().getMonth() + 1,
    });
  };

  return (
    <div className="
        flex flex-col
        h-screen
      "
      style={{
        background: `linear-gradient(to bottom, #FF69C6 0%, #FF70D4 22%, ${isDark ? 'var(--layout-black)' : 'var(--layout-white)'} 42%)`,
      }}
    >
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div className="
        flex justify-between items-center
        pt-[20px] px-[16px] pb-[14px]
      ">
        <img src={logo_h} alt="heyvoca logo" className="h-[25px]" />
        <div className="flex gap-[8px] items-center">
          <button
            type="button"
            onClick={() => {
              vibrate({ duration: 5 });
              pushNewBottomSheet(GemPurchaseNewBottomSheet, {}, { isBackdropClickClosable: true, isDragToCloseEnabled: true });
            }}
            className="flex gap-[5px] items-center"
          >
            <img src={gem} alt="보석" className="w-[20px] h-[18px]" />
            <span className="text-layout-white text-[16px] font-bold">{userProfile.gem_cnt}</span>
          </button>
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
            text-layout-white text-[24px] font-normal leading-[1.35]
          ">
            {greeting.line1}<br />
            {greeting.line2}<br />
            {greeting.line3}
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
              bg-layout-white
            ">
              <span className="
                text-transparent bg-clip-text
                bg-gradient-to-br from-[rgba(255,141,212,1)] via-[rgba(205,141,255,1)] to-[rgba(116,213,255,1)]
                text-[16px] font-[800]
              ">
                학습하기
              </span>
            </button>
          </motion.div>
        </div>
        <div className="
          flex flex-col gap-[15px] 
          px-[16px] py-[18px] pb-[88px]
        ">
          {/* 온보딩 행동 기반 미션 배너 — legacy 유저이거나 모든 미션을 완료했으면 노출하지 않음 */}
          {showMissionBanner && (
            <button
              type="button"
              onClick={handleMissionBannerClick}
              className="
                flex items-center justify-between gap-[10px]
                px-[16px] py-[13px]
                rounded-[12px]
                bg-layout-gray-50 dark:bg-layout-gray-dark
                text-left
              "
            >
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-[600] text-primary-main-600">
                  입문 퀘스트
                </span>
                <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white truncate">
                  {currentMissionAction}
                </span>
              </div>
              <CaretRight size={18} className="text-layout-gray-300 shrink-0" />
            </button>
          )}

          {/* 데일리 미션 — '학습하기'(한 번이라도 학습=출석/attend) + '신규/복습'(둘 다 달성=데일리 미션 완료).
              출석은 출석왕, 신규+복습 완료는 끈기왕/보석 구동. */}
          {(() => {
            const reviewDue = effectiveStats?.reviewDue ?? 0;
            const studiedToday = todayStatus.attendCompleted; // 학습하기 = 한 번이라도 학습(출석)
            // 신규: 목표=일일 한도, 현재=오늘 신규 학습 수
            const newTarget = dailyNewLimit > 0 ? dailyNewLimit : todayNewWords;
            const newCurrent = todayNewWords;
            // 복습: 목표=완료+남은개수(오늘 전체 복습량), 현재=오늘 복습 완료 수
            const reviewTarget = todayReviewsDone + reviewDue;
            const reviewCurrent = todayReviewsDone;
            const goalDone = newCurrent >= newTarget && reviewDue === 0;
            const rows = [
              { key: 'study', label: '학습하기', done: studiedToday },
              {
                key: 'goal',
                label: (
                  <>신규 <strong className="font-[700]">{newCurrent}/{newTarget}</strong>  복습 <strong className="font-[700]">{reviewCurrent}/{reviewTarget}</strong></>
                ),
                done: goalDone,
              },
            ];
            return (
              <div className="flex items-start gap-[30px] px-[15px] py-[12px] rounded-[12px] bg-primary-main-600">
                <h2 className="text-layout-white dark:text-layout-black text-[16px] font-[700] whitespace-nowrap">데일리 미션</h2>
                <div className="flex flex-col flex-1 gap-[8px]">
                  {rows.map((r) => (
                    <div key={r.key} className="flex justify-between items-center gap-[10px]">
                      <span className="text-layout-white dark:text-layout-black text-[12px] font-[600]">{r.label}</span>
                      <div className={`flex items-center justify-center shrink-0 w-[60px] h-[20px] px-[6px] py-[4px] rounded-[5px] text-[10px] font-[700] ${r.done ? 'text-layout-white dark:text-layout-black bg-[#E569B7]' : 'text-primary-main-600 bg-layout-white'}`}>
                        {r.done ? '완료' : '미완료'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 당근 농장 — 단계별 보유 · 오늘 돌볼 작물. 누르면 농장 상세로 이동 */}
          <FarmSummaryCard />

          {/* 연속 학습일 — 최근 35일 */}
          <StreakCard />

          <div
            className="
              flex flex-col gap-[20px]
              px-[15px] py-[12px]
              rounded-[12px]
              bg-primary-main-100 dark:bg-layout-gray-dark
              cursor-pointer
            "
            onClick={handleAttendanceClick}
          >
            <h2 className="text-layout-black dark:text-layout-white text-[16px] font-[700]">출석체크</h2>
            <div className="flex justify-between">
              {userMainPage?.dates?.map((item, index) => (
                <div key={index} className="flex flex-col gap-[10px] items-center">
                  <h3 className="text-layout-black dark:text-layout-white text-[12px] font-[600]">{item.date}</h3>
                  {(item.attend && item.daily_mission) && (
                    <div className="w-[30px] h-[30px] flex items-center justify-center">
                      <div className="flex items-center justify-center w-[24px] h-[24px] 
                      bg-gradient-to-br from-[rgba(255,141,212,1)] via-[rgba(205,141,255,1)] to-[rgba(116,213,255,1)]
                      rounded-[50%]
                    ">
                        <Heart size={12} weight="fill" className="text-layout-white dark:text-layout-black" />
                      </div>
                    </div>
                  )}
                  {(item.attend && !item.daily_mission) && (
                    <div className="w-[30px] h-[30px] flex items-center justify-center">
                      <CheckCircle size={30} weight="fill" color="#FF70D4" />
                    </div>
                  )}
                  {(!item.attend && !item.daily_mission) && (
                    <CircleDashed size={30} color="#FF70D4" />
                  )}
                </div>
              ))}
            </div>
          </div>


          <div className="
            flex flex-col gap-[20px]
            px-[15px] py-[12px]
            rounded-[12px]
            bg-secondary-purple-100 dark:bg-secondary-purple-dark 
          ">
            <h2 className="text-layout-black dark:text-layout-white text-[16px] font-[700]">나의 업적</h2>
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
                          [text-shadow:_-1.2px_-1.2px_0_var(--layout-white),_1.2px_-1.2px_0_var(--layout-white),_-1.2px_1.2px_0_var(--layout-white),_1.2px_1.2px_0_var(--layout-white)]
                        "
                      style={{ ...getAchievementTextStyle(goal.level), fontFamily: 'Cafe24Ssurround, sans-serif' }}
                    >
                      <span className="text-[10px]" style={{ fontFamily: 'Cafe24Ssurround' }}>LV.</span>{goal.level}
                    </span>
                  </div>
                  <span className="text-layout-black dark:text-layout-white text-[12px] font-[600]">
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