import React, { useState, useEffect, useRef } from 'react';
import { CaretLeft } from '@phosphor-icons/react';

import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { motion } from 'framer-motion';
import { vibrate, showToast, isAppVersionAtLeast } from '../../utils/osFunction';
import { useUser } from '../../context/UserContext';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import postMessageManager from '../../utils/postMessageManager';

// 앱(WebView) 환경 여부 — 순수 웹에서는 OS 알림 권한 개념이 없어 게이팅을 건너뛴다.
const isRNWebView = typeof window !== 'undefined' && !!window.ReactNativeWebView;

// OS 알림 권한 네이티브 핸들러(requestNotificationPermission/checkNotificationPermission/openAppSettings)가
// 포함된 앱 최소 버전. 이 버전 미만 앱(또는 순수 웹)에서는 네이티브 권한 게이팅을 건너뛰고
// 기존 동작(토글 즉시 반영)으로 폴백한다 — 구버전 앱에서 응답을 못 받아 멈추는 것을 방지.
const NOTIF_PERMISSION_MIN_APP_VERSION = '1.0.3';
const supportsNativePermission = isRNWebView && isAppVersionAtLeast(NOTIF_PERMISSION_MIN_APP_VERSION);

const ToggleSwitch = ({ checked, onChange, label, description }) => (
  <li
    className="flex items-center justify-between px-[20px] py-[20px] border-b border-[#ddd] dark:border-border-dark bg-layout-white dark:bg-layout-black"
    onClick={onChange}
  >
    <div className="flex flex-col gap-[4px]">
      <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">
        {label}
      </span>
      {description && (
        <span className="text-[13px] text-layout-gray-200 dark:text-layout-gray-300 leading-tight">
          {description}
        </span>
      )}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
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
  </li>
);

const PushNotificationsNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { fcmToken, isLogin } = useUser();

  // localStorage 캐시 우선 → 매번 로딩 없이 즉시 렌더. 마운트 후 백그라운드로 최신화.
  const cachedPush = (() => {
    try { return JSON.parse(localStorage.getItem('pushSettings')) || null; } catch (e) { return null; }
  })();
  const [isStudyAllowed, setIsStudyAllowed] = useState(cachedPush?.study ?? true);
  const [isMarketingAllowed, setIsMarketingAllowed] = useState(cachedPush?.marketing ?? false);

  // 권한 요청 결과로 갱신될 수 있는 실제 사용 토큰 (context fcmToken 우선)
  const [effectiveToken, setEffectiveToken] = useState(fcmToken);
  // OS 알림 권한 여부 (기본 true=관대; 앱에서 확인되면 갱신). loadSettings가 ON으로 덮어쓰는 것을 막는 데 사용.
  const permissionGrantedRef = useRef(true);
  const permRequestInFlight = useRef(false);

  useEffect(() => { if (fcmToken) setEffectiveToken(fcmToken); }, [fcmToken]);

  // 백엔드에서 최신 상태 동기화(백그라운드). OS 권한이 꺼져 있으면 ON으로 표시하지 않음.
  useEffect(() => {
    const loadSettings = async () => {
      const token = effectiveToken || fcmToken;
      if (!isLogin || !token) return;
      try {
        const url = `${backendUrl}/fcm/get_notification_settings`;
        const result = await fetchDataAsync(url, 'POST', { fcm_token: token });
        if (result.code === 200) {
          const allowed = permissionGrantedRef.current;
          const study = result.is_study_allowed && allowed;
          const marketing = result.is_marketing_allowed && allowed;
          setIsStudyAllowed(study);
          setIsMarketingAllowed(marketing);
          try {
            localStorage.setItem('pushSettings', JSON.stringify({ study, marketing }));
          } catch (e) { /* noop */ }
        }
      } catch (error) {
        console.error('알림 설정 로드 실패:', error);
      }
    };

    loadSettings();
  }, [isLogin, fcmToken]);

  // 진입 시 OS 알림 권한 확인(프롬프트 없이) → 미허용이면 토글을 OFF로 반영
  // (네이티브 핸들러를 지원하는 앱 버전에서만 — 구버전/웹은 백엔드 값 그대로 사용)
  useEffect(() => {
    if (!supportsNativePermission) return;
    const onStatus = (data) => {
      postMessageManager.removeListener('notification_permission_status');
      permissionGrantedRef.current = !!data.granted;
      if (!data.granted) {
        setIsStudyAllowed(false);
        setIsMarketingAllowed(false);
      } else if (data.token) {
        setEffectiveToken(data.token);
      }
    };
    postMessageManager.addListener('notification_permission_status', onStatus);
    postMessageManager.sendMessageToReactNative('checkNotificationPermission', {});
    return () => postMessageManager.removeListener('notification_permission_status');
  }, []);

  // OS 알림 권한 보장. 허용 시 { granted:true, token }, 미허용 시 { granted:false }.
  // 순수 웹에서는 권한 개념이 없어 항상 허용으로 간주.
  const ensureNotificationPermission = () =>
    new Promise((resolve) => {
      // 구버전 앱/순수 웹: 네이티브 권한 게이팅 없이 기존 동작(허용으로 간주, 토글 즉시 반영)
      if (!supportsNativePermission) { resolve({ granted: true, token: effectiveToken }); return; }
      const onResult = (data) => {
        postMessageManager.removeListener('notification_permission_result');
        resolve({ granted: !!data.granted, token: data.token || null });
      };
      postMessageManager.addListener('notification_permission_result', onResult);
      postMessageManager.sendMessageToReactNative('requestNotificationPermission', {});
    });

  const guideToEnableNotification = () => {
    showToast('알림 권한이 꺼져 있어요. 휴대폰 설정에서 알림을 허용해주세요.');
    if (supportsNativePermission) {
      postMessageManager.sendMessageToReactNative('openAppSettings', {});
    }
  };

  // 새로 발급받은 토큰을 백엔드에 등록 (권한을 새로 허용한 경우)
  const registerToken = async (token) => {
    if (!token) return;
    try {
      await fetchDataAsync(`${backendUrl}/fcm/save_token`, 'POST', { fcm_token: token });
    } catch (e) { /* noop */ }
  };

  // 알림 설정 값 저장. 실패 시 onFail 롤백.
  const persistSetting = async (token, payload, onFail) => {
    if (!token) return;
    try {
      await fetchDataAsync(`${backendUrl}/fcm/is_message_allowed`, 'POST', { fcm_token: token, ...payload });
    } catch (error) {
      console.error('알림 설정 업데이트 실패:', error);
      onFail && onFail();
    }
  };

  // 토글 ON 시 OS 권한을 확보하고, 미허용이면 ON 하지 않은 채 설정으로 유도하는 공통 처리.
  const turnOn = async (setLocal, persistKey, otherKey, otherVal) => {
    if (permRequestInFlight.current) return;
    permRequestInFlight.current = true;
    const { granted, token } = await ensureNotificationPermission();
    permRequestInFlight.current = false;
    permissionGrantedRef.current = granted;
    if (!granted) {
      setLocal(false); // 권한 미허용 → 토글 ON 하지 않음
      guideToEnableNotification();
      return;
    }
    let useToken = effectiveToken;
    if (token && token !== effectiveToken) {
      setEffectiveToken(token);
      await registerToken(token);
      useToken = token;
    }
    setLocal(true);
    try { localStorage.setItem('pushSettings', JSON.stringify({ [persistKey]: true, [otherKey]: otherVal })); } catch (e) { /* noop */ }
    await persistSetting(useToken, { [persistKey === 'study' ? 'is_study_allowed' : 'is_marketing_allowed']: true }, () => setLocal(false));
  };

  const handleToggleStudy = async () => {
    vibrate({ duration: 5 });
    if (!isStudyAllowed) {
      await turnOn(setIsStudyAllowed, 'study', 'marketing', isMarketingAllowed);
    } else {
      setIsStudyAllowed(false);
      try { localStorage.setItem('pushSettings', JSON.stringify({ study: false, marketing: isMarketingAllowed })); } catch (e) { /* noop */ }
      await persistSetting(effectiveToken, { is_study_allowed: false }, () => setIsStudyAllowed(true));
    }
  };

  const handleToggleMarketing = async () => {
    vibrate({ duration: 5 });
    if (!isMarketingAllowed) {
      await turnOn(setIsMarketingAllowed, 'marketing', 'study', isStudyAllowed);
    } else {
      setIsMarketingAllowed(false);
      try { localStorage.setItem('pushSettings', JSON.stringify({ study: isStudyAllowed, marketing: false })); } catch (e) { /* noop */ }
      await persistSetting(effectiveToken, { is_marketing_allowed: false }, () => setIsMarketingAllowed(true));
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="
        relative
        flex items-center justify-between
        h-[55px]
        pt-[20px] px-[16px] pb-[14px]
        border-b border-[#ddd]
        bg-layout-white dark:bg-layout-black
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
        </div>
        <h1 className="
            absolute
            left-1/2 -translate-x-1/2
            text-[18px] font-[700]
            text-layout-black dark:text-layout-white
          ">
          알림 설정
        </h1>
        <div className="flex items-center gap-[8px] text-layout-gray-200 dark:text-layout-white"></div>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-[10px] bg-layout-gray-50 dark:bg-layout-black">
        <ul className="flex flex-col">
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
        </ul>
      </div>
    </div>
  );
};

export default PushNotificationsNewFullSheet;
