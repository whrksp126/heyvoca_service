import React, { useEffect, useState } from 'react';
import { UserCircle, SunDim, TextAlignJustify, HardDrives, Bell, CaretRight } from "@phosphor-icons/react";
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import Account from './Account';
import Theme from './Theme';
import ExampleSettings from './ExampleSettings';
import PushNotifications from './PushNotifications';
import { useFullSheet } from '../../context/FullSheetContext';

const Main = () => {
  const { userStorageData } = useUser();
  const { pushFullSheet } = useFullSheet();

  

  // 계정
  const handleAccountClick = () => {
    pushFullSheet({
      component: <Account />
    });
  }

  // 테마
  const handleThemeClick = () => {
    pushFullSheet({
      component: <Theme />
    });
  }

  // 예문 설정
  const handleExampleSettingsClick = () => {
    pushFullSheet({
      component: <ExampleSettings />
    });
  }

  // 푸시 알림
  const handlePushNotificationsClick = () => {
    pushFullSheet({
      component: <PushNotifications />
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
          <li onClick={handleAccountClick} 
              className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark">
            <div className="flex items-center gap-2">
              <UserCircle weight="fill" className="text-[20px] text-heyvocaPink" />
              <span className="text-[16px] font-bold text-primary dark:text-primary-dark">계정</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-normal text-[#999]">
                {userStorageData?.status === "login" ? userStorageData?.email : "로그인 필요"}
              </span>
              <CaretRight className="text-[20px] text-primary dark:text-primary-dark" />
            </div>
          </li>

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



