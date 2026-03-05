import React, { useState, useEffect } from 'react';
import { CaretLeft, CircleNotch } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { motion } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';
import { useUser } from '../../context/UserContext';
import { backendUrl, fetchDataAsync } from '../../utils/common';

const PushNotificationsNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { fcmToken, isLogin } = useUser();

  // 알림 토글 상태
  const [isStudyAllowed, setIsStudyAllowed] = useState(true);
  const [isMarketingAllowed, setIsMarketingAllowed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 백엔드에서 초기 상태 가져오기 로직
  useEffect(() => {
    const loadSettings = async () => {
      if (!isLogin || !fcmToken) return;

      setIsLoading(true);
      try {
        const url = `${backendUrl}/fcm/get_notification_settings`;
        const result = await fetchDataAsync(url, 'POST', { fcm_token: fcmToken });
        if (result.code === 200) {
          setIsStudyAllowed(result.is_study_allowed);
          setIsMarketingAllowed(result.is_marketing_allowed);
        }
      } catch (error) {
        console.error('알림 설정 로드 실패:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [isLogin, fcmToken]);

  const handleToggleStudy = async () => {
    vibrate({ duration: 5 });
    const newVal = !isStudyAllowed;
    setIsStudyAllowed(newVal);

    if (fcmToken) {
      try {
        const url = `${backendUrl}/fcm/is_message_allowed`;
        await fetchDataAsync(url, 'POST', {
          fcm_token: fcmToken,
          is_study_allowed: newVal
        });
      } catch (error) {
        console.error('학습 알림 설정 업데이트 실패:', error);
        setIsStudyAllowed(!newVal); // 실패 시 롤백
      }
    }
  };

  const handleToggleMarketing = async () => {
    vibrate({ duration: 5 });
    const newVal = !isMarketingAllowed;
    setIsMarketingAllowed(newVal);

    if (fcmToken) {
      try {
        const url = `${backendUrl}/fcm/is_message_allowed`;
        await fetchDataAsync(url, 'POST', {
          fcm_token: fcmToken,
          is_marketing_allowed: newVal
        });
      } catch (error) {
        console.error('마케팅 알림 설정 업데이트 실패:', error);
        setIsMarketingAllowed(!newVal); // 실패 시 롤백
      }
    }
  };

  const ToggleSwitch = ({ checked, onChange, label, description }) => (
    <div className="flex items-center justify-between py-[16px] border-b border-border dark:border-border-dark last:border-0">
      <div className="flex flex-col gap-[4px] pr-[16px]">
        <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">
          {label}
        </span>
        {description && (
          <span className="text-[13px] text-layout-gray-200 dark:text-layout-white/60 leading-tight">
            {description}
          </span>
        )}
      </div>
      <button
        onClick={onChange}
        className={`
          relative inline-flex h-[28px] w-[50px] shrink-0 cursor-pointer rounded-full border-2 border-transparent 
          transition-colors duration-200 ease-in-out focus:outline-none
          ${checked ? 'bg-primary-main-500' : 'bg-layout-gray-100 dark:bg-layout-gray-300'}
        `}
      >
        <span className="sr-only">Toggle {label}</span>
        <span
          className={`
            pointer-events-none inline-block h-[24px] w-[24px] transform rounded-full bg-layout-white shadow ring-0 
            transition duration-200 ease-in-out
            ${checked ? 'translate-x-[22px]' : 'translate-x-0'}
          `}
        />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div className="
        relative
        flex items-center justify-between
        h-[55px] 
        pt-[20px] px-[16px] pb-[14px]
      ">
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={() => {
              vibrate({ duration: 5 });
              popNewFullSheet();
            }}
            className="
              text-layout-gray-200 dark:text-layout-white
              rounded-[8px]
            "
            whileHover={{
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              scale: 1.05
            }}
            whileTap={{
              scale: 0.95,
              backgroundColor: 'rgba(0, 0, 0, 0.1)'
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 17
            }}
          >
            <CaretLeft size={24} />
          </motion.button>
          <h1 className="
            text-[18px] font-[700]
            text-layout-black 
          ">
          </h1>
        </div>
        <h1 className="
            absolute
            left-1/2 -translate-x-1/2
            text-[18px] font-[700]
            text-layout-black dark:text-layout-white
          ">
          알림 설정
        </h1>
        <div
          className="
            flex items-center gap-[8px]
            text-layout-gray-200 dark:text-layout-white
          "
        >
        </div>
      </div>


      {/* Content */}
      <div className="flex flex-col flex-1 py-[10px] px-[20px] overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center items-center py-10">
            <CircleNotch className="animate-spin text-primary-main-500" size={32} />
          </div>
        ) : (
          <div className="flex flex-col">
            <ToggleSwitch
              label="학습 유도 알림"
              description="오후 1시와 저녁 9시에 오늘의 남은 학습량을 알려드립니다."
              checked={isStudyAllowed}
              onChange={handleToggleStudy}
            />

            <ToggleSwitch
              label="마케팅 혜택 알림"
              description="이벤트, 할인 혜택, 업데이트 등 유용한 소식을 보내드립니다."
              checked={isMarketingAllowed}
              onChange={handleToggleMarketing}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default PushNotificationsNewFullSheet;

