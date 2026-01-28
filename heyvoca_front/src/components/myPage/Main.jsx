import React, { useEffect, useState } from 'react';
import { UserCircle, SunDim, TextAlignJustify, HardDrives, Bell, CaretRight } from "@phosphor-icons/react";
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';
// import Account from './Account';
// import Theme from './Theme';
// import ExampleSettings from './ExampleSettings';
// import PushNotifications from './PushNotifications';
import AccountNewFullSheet from '../newFullSheet/AccountNewFullSheet';
// import ThemeNewFullSheet from '../newFullSheet/ThemeNewFullSheet';
// import ExampleSettingsNewFullSheet from '../newFullSheet/ExampleSettingsNewFullSheet';
// import PushNotificationsNewFullSheet from '../newFullSheet/PushNotificationsNewFullSheet';

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { userProfile } = useUser();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();



  // React Compiler가 자동으로 useCallback 처리
  // 계정
  const handleAccountClick = () => {
    pushNewFullSheet(AccountNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  }

  // // 테마
  // const handleThemeClick = () => {
  //   pushNewFullSheet(ThemeNewFullSheet, {}, {
  //     smFull: true,
  //     closeOnBackdropClick: true
  //   });
  // }

  // // 예문 설정
  // const handleExampleSettingsClick = () => {
  //   pushNewFullSheet(ExampleSettingsNewFullSheet, {}, {
  //     smFull: true,
  //     closeOnBackdropClick: true
  //   });
  // }

  // // 푸시 알림
  // const handlePushNotificationsClick = () => {
  //   pushNewFullSheet(PushNotificationsNewFullSheet, {}, {
  //     smFull: true,
  //     closeOnBackdropClick: true
  //   });
  // }

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
            <UserCircle weight="fill" className="text-[20px] text-heyvocaPink" />
            <span className="text-[16px] font-bold text-primary dark:text-primary-dark">계정</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] font-normal text-[#999]">
              {userProfile?.email || "로그인 필요"}
            </span>
            <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
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

        {/* <li onClick={handleThemeClick} 
              className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
            <div className="flex items-center gap-2">
              <SunDim weight="fill" className="text-[20px] text-heyvocaPink" />
              <span className="text-[16px] font-bold text-primary dark:text-primary-dark">테마</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">{isDark ? "다크" : "라이트"}</span>
              <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
            </div>
          </li> */}

        {/* <li onClick={handleExampleSettingsClick} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <TextAlignJustify weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-primary dark:text-primary-dark">예문 설정</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">항상 보기</span>
              <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
            </div>
          </li> */}

        {/* <li onClick={handlePushNotificationsClick} className="flex items-center justify-between px-5 py-5 border-b border-[#ddd]">
            <div className="flex items-center gap-2">
              <Bell weight="fill" className="text-[20px] text-[#FF8DD4]" />
              <span className="text-[16px] font-bold text-primary dark:text-primary-dark">푸시 알림</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">on</span> 
              <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
            </div>
          </li> */}
      </ul>
    </motion.main>
  );
};

export default Main;



