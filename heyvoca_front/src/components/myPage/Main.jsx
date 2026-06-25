import React, { useEffect, useState } from 'react';
import { UserCircle, SunDim, TextAlignJustify, HardDrives, Bell, SpeakerHigh, BookOpen, CaretRight, FileText, ShieldCheck, Info, CalendarCheck } from "@phosphor-icons/react";
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useTheme } from '../../context/ThemeContext';
import { useExampleSettings } from '../../context/ExampleSettingsContext';
import { vibrate, openExternalUrl, parseAppVersion } from '../../utils/osFunction';

const APP_VERSION_INFO = parseAppVersion();

const TERMS_URL = 'https://heyvoca.ghmate.com/terms-of-service';
const PRIVACY_URL = 'https://heyvoca.ghmate.com/privacy-policy';
// import Account from './Account';
// import Theme from './Theme';
// import ExampleSettings from './ExampleSettings';
// import PushNotifications from './PushNotifications';
import AccountNewFullSheet from '../newfullsheet/AccountNewFullSheet';
import ThemeNewFullSheet from '../newfullsheet/ThemeNewFullSheet';
import ExampleSettingsNewFullSheet from '../newfullsheet/ExampleSettingsNewFullSheet';
import PushNotificationsNewFullSheet from '../newfullsheet/PushNotificationsNewFullSheet';
import VoiceSettingsNewFullSheet from '../newfullsheet/VoiceSettingsNewFullSheet';
import DailyNewLimitNewFullSheet from '../newfullsheet/DailyNewLimitNewFullSheet';
import GemNewFullSheet from '../newfullsheet/GemNewFullSheet';
import ReviewScheduleNewFullSheet from '../newfullsheet/ReviewScheduleNewFullSheet';
import gemImg from '../../assets/images/gem.png';

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { userProfile } = useUser();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { isDark } = useTheme();
  const { showExamples } = useExampleSettings();



  // React Compiler가 자동으로 useCallback 처리
  // 계정
  const handleAccountClick = () => {
    pushNewFullSheet(AccountNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  // 테마
  const handleThemeClick = () => {
    pushNewFullSheet(ThemeNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  // 예문 설정
  const handleExampleSettingsClick = () => {
    pushNewFullSheet(ExampleSettingsNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  // 푸시 알림
  const handlePushNotificationsClick = () => {
    pushNewFullSheet(PushNotificationsNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  // 음성 설정
  const handleVoiceSettingsClick = () => {
    pushNewFullSheet(VoiceSettingsNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  // 하루 신규 단어 수 설정
  const handleDailyNewLimitClick = () => {
    pushNewFullSheet(DailyNewLimitNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  // 보석
  const handleGemClick = () => {
    pushNewFullSheet(GemNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  // 복습 일정/분포
  const handleReviewScheduleClick = () => {
    pushNewFullSheet(ReviewScheduleNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  return (
    <motion.main
      className="flex-grow"
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      <ul className="w-full m-0 p-0 list-none">
        <li onClick={() => {
          vibrate({ duration: 5 });
          handleAccountClick();
        }}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <UserCircle weight="fill" className="text-[20px] text-primary-main-600" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">계정</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-normal text-[#999]">
              {userProfile?.email || "로그인 필요"}
            </span>
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        <li onClick={() => { vibrate({ duration: 5 }); handleGemClick(); }}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <img src={gemImg} alt="보석" className="w-[20px] h-[18px]" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">보석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-normal text-[#999]">{userProfile?.gem_cnt ?? 0}개</span>
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        {/* 더미 단어장 일괄 추가 루틴 (임시) */}
        {/* 
        {userProfile?.email === 'whrksp126@gmail.com' && (
          <li onClick={async () => {
            if (window.confirm('모든 더미 단어장을 생성하시겠습니까? (약 120개)')) {
              const { loadDummyVocabularies } = await import('../../utils/DummyVocaLoader');
              vibrate({ duration: 10 });
              const result = await loadDummyVocabularies((curr, total, file) => {
                console.log(`[Dummy Loading] ${curr}/${total}: ${file}`);
                // 필요하다면 여기에 전역 로딩 상태나 알림을 연동할 수 있습니다.
              });
              if (result.success) {
                alert(`성공적으로 ${result.count}개의 단어장을 생성했습니다!`);
                window.location.reload(); // 목록 갱신을 위해 리로드
              } else {
                alert('단어장 생성 중 오류가 발생했습니다.');
              }
            }
          }}
            className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark bg-yellow-50 dark:bg-yellow-900/10">
            <div className="flex items-center gap-2">
              <HardDrives weight="fill" className="text-[20px] text-amber-500" />
              <span className="text-[16px] font-bold text-amber-600 dark:text-amber-400">더미 단어장 전체 추가 (임시)</span>
            </div>
            <CaretRight className="text-[20px] text-amber-500" />
          </li>
        )} 
        */}

        <li onClick={handleThemeClick}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <SunDim weight="fill" className="text-[20px] text-primary-main-600" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">테마</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-normal text-[#999]">{isDark ? "다크" : "라이트"}</span>
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        <li onClick={() => { vibrate({ duration: 5 }); handleExampleSettingsClick(); }}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <TextAlignJustify weight="fill" className="text-[20px] text-primary-main-600" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">예문 보기</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-normal text-[#999]">{showExamples ? "항상 보기" : "숨김"}</span>
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        <li onClick={handlePushNotificationsClick} className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <Bell weight="fill" className="text-[20px] text-primary-main-600" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">푸시 알림</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        <li onClick={() => { vibrate({ duration: 5 }); handleVoiceSettingsClick(); }}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <SpeakerHigh weight="fill" className="text-[20px] text-primary-main-600" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">음성</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        <li onClick={() => { vibrate({ duration: 5 }); handleDailyNewLimitClick(); }}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <BookOpen weight="fill" className="text-[20px] text-primary-main-600" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">학습 설정</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-normal text-[#999]">
              {(userProfile?.daily_new_limit ?? 20) === 0 ? '무제한' : `${userProfile?.daily_new_limit ?? 20}개`}
            </span>
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        <li onClick={() => { vibrate({ duration: 5 }); handleReviewScheduleClick(); }}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <CalendarCheck weight="fill" className="text-[20px] text-primary-main-600" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">복습 일정/분포</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        <li onClick={() => {
          vibrate({ duration: 5 });
          openExternalUrl(TERMS_URL);
        }}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <FileText weight="fill" className="text-[20px] text-primary-main-600" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">이용약관</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        <li onClick={() => {
          vibrate({ duration: 5 });
          openExternalUrl(PRIVACY_URL);
        }}
          className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
          <div className="flex items-center gap-2">
            <ShieldCheck weight="fill" className="text-[20px] text-primary-main-600" />
            <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">개인정보처리방침</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />
          </div>
        </li>

        {APP_VERSION_INFO && (
          <li className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
            <div className="flex items-center gap-2">
              <Info weight="fill" className="text-[20px] text-primary-main-600" />
              <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">버전 정보</span>
            </div>
            <span className="text-[12px] font-normal text-[#999]">
              v{APP_VERSION_INFO.version}{APP_VERSION_INFO.build ? ` (${APP_VERSION_INFO.build})` : ''}
            </span>
          </li>
        )}
      </ul>
    </motion.main>
  );
};

export default Main;



