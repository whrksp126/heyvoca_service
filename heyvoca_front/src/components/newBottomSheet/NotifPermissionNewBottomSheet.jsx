import React from 'react';
import { motion } from 'framer-motion';
import { Bell } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import postMessageManager from '../../utils/postMessageManager';
import { backendUrl, fetchDataAsync } from '../../utils/common';

// 로그인 후 홈 첫 진입에서 뜨는 알림 권한 요청 프롬프트.
// "알림 받기" → OS 알림 권한 요청(네이티브), "나중에" → 닫기.
export const NotifPermissionNewBottomSheet = () => {
  "use memo";
  const { popNewBottomSheet } = useNewBottomSheetActions();

  const handle = (allow) => {
    vibrate({ duration: 5 });
    if (allow) {
      // '받기' → OS 알림 권한 요청(네이티브). 허용되면 네이티브가 돌려준 FCM 토큰을 백엔드에 등록해
      // 즉시 푸시를 받을 수 있게 한다. (앱 실행 시 자동 요청을 없앴으므로 이 시점의 등록이 중요)
      const onResult = (data) => {
        postMessageManager.removeListener('notification_permission_result');
        if (data?.granted && data?.token) {
          fetchDataAsync(`${backendUrl}/fcm/save_token`, 'POST', { fcm_token: data.token }).catch(() => { /* noop */ });
        }
      };
      postMessageManager.addListener('notification_permission_result', onResult);
      // 사용자가 프롬프트에 응답하지 않는 경우를 대비한 리스너 정리 안전장치
      setTimeout(() => postMessageManager.removeListener('notification_permission_result'), 3000);
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
          className="w-full h-[48px] rounded-[10px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700]"
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
