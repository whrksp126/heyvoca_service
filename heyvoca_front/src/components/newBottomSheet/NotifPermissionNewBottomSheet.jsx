import React from 'react';
import { motion } from 'framer-motion';
import { Bell } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import postMessageManager from '../../utils/postMessageManager';

// 로그인 후 홈 첫 진입에서 뜨는 알림 권한 요청 프롬프트.
// "알림 받기" → OS 알림 권한 요청(네이티브), "나중에" → 닫기.
export const NotifPermissionNewBottomSheet = () => {
  "use memo";
  const { popNewBottomSheet } = useNewBottomSheetActions();

  const handle = (allow) => {
    vibrate({ duration: 5 });
    if (allow) {
      try { postMessageManager.sendMessageToReactNative('requestNotificationPermission', {}); } catch (e) { /* 웹은 무시 */ }
    }
    popNewBottomSheet();
  };

  return (
    <div className="relative">
      <div className="flex flex-col items-center text-center gap-[10px] pt-[36px] px-[20px] pb-[120px]">
        <div className="flex items-center justify-center w-[84px] h-[84px] rounded-full bg-secondary-purple-100 dark:bg-layout-gray-dark mb-[6px]">
          <Bell size={40} weight="fill" className="text-primary-main-600" />
        </div>
        <h3 className="text-[20px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white">
          복습 시간을<br />알려드릴까요?
        </h3>
        <p className="text-[14px] text-layout-gray-300 leading-[1.5]">
          잊을 때쯤 살짝 알림을 보내<br />기억이 오래 가게 도와드려요
        </p>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex flex-col p-[20px] gap-[10px]">
        <motion.button
          className="w-full h-[48px] rounded-[10px] bg-primary-main-600 text-layout-white text-[16px] font-[700]"
          onClick={() => handle(true)}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          알림 받기
        </motion.button>
        <button
          type="button"
          onClick={() => handle(false)}
          className="w-full text-[13px] font-[500] text-layout-gray-300 underline py-[6px]"
        >
          나중에 할게요
        </button>
      </div>
    </div>
  );
};
