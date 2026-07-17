import React, { useEffect, useState } from 'react';
import { CaretLeft, CaretRight, ChatCircleDots } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate, showToast, checkNotificationPermissionGranted } from '../../utils/osFunction';
import postMessageManager from '../../utils/postMessageManager';
import { getLabSettingsApi, setLabFeatureApi } from '../../api/lab';

// 실험실 기능 목록 — 새 기능은 이 배열에 한 줄 추가로 노출된다.
const LAB_FEATURES = [
  {
    key: 'chat_study',
    icon: ChatCircleDots,
    name: '채팅으로 학습',
    desc: '알림으로 오늘의 단어를 받고 바로 풀어요',
  },
];

const isRNWebView = typeof window !== 'undefined' && !!window.ReactNativeWebView;

// 응답 payload가 {data:{features}} / {features} 둘 중 어떤 형태로 와도 안전하게 추출
const extractFeatures = (result) => result?.data?.features || result?.features || null;

const ToggleSwitch = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`
      relative inline-flex h-[28px] w-[50px] shrink-0 cursor-pointer rounded-full border-2 border-transparent
      transition-colors duration-200 ease-in-out focus:outline-none
      ${checked ? 'bg-primary-main-500' : 'bg-layout-gray-100 dark:bg-layout-gray-300'}
    `}
  >
    <span className="sr-only">토글</span>
    <span
      className={`
        pointer-events-none inline-block h-[24px] w-[24px] transform rounded-full bg-layout-white shadow ring-0
        transition duration-200 ease-in-out
        ${checked ? 'translate-x-[22px]' : 'translate-x-0'}
      `}
    />
  </button>
);

// 마이페이지 > 설정 > 실험실 — 정식 출시 전 기능을 미리 켜볼 수 있는 화면
const LabNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const [features, setFeatures] = useState({});

  // 진입 시 현재 설정 로드
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await getLabSettingsApi();
        const loaded = extractFeatures(result);
        if (mounted && loaded) setFeatures(loaded);
      } catch (error) {
        console.error('실험실 설정 로드 실패:', error);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 알림 권한 확인 후 미허용이면 요청 유도. 응답을 기다리지 않는 best-effort 처리 —
  // 채팅 학습 기능 자체는 권한 여부와 무관하게 켜지고, 알림만 별도로 유도한다.
  const ensureNotificationPermissionBestEffort = () => {
    (async () => {
      try {
        const granted = await checkNotificationPermissionGranted();
        if (granted === false) {
          if (isRNWebView) {
            try { postMessageManager.sendMessageToReactNative('requestNotificationPermission', {}); } catch (e) { /* noop */ }
          }
          showToast('채팅으로 오늘의 단어를 받으려면 알림 권한을 허용해주세요.');
        }
      } catch (error) {
        // best-effort: 권한 확인/요청이 실패해도 토글 자체는 유지
      }
    })();
  };

  const handleToggle = async (key) => {
    vibrate({ duration: 5 });
    const next = !features[key];

    // 낙관적 업데이트
    setFeatures((prev) => ({ ...prev, [key]: next }));

    if (next && key === 'chat_study') {
      ensureNotificationPermissionBestEffort();
    }

    try {
      const result = await setLabFeatureApi(key, next);
      const updated = extractFeatures(result);
      if (updated) setFeatures(updated);
    } catch (error) {
      console.error('실험실 기능 설정 변경 실패:', error);
      // 롤백
      setFeatures((prev) => ({ ...prev, [key]: !next }));
      showToast('설정 변경에 실패했어요. 다시 시도해주세요.');
    }
  };

  const handleEnterChat = () => {
    vibrate({ duration: 5 });
    try { postMessageManager.sendMessageToReactNative('launchChatStudy', {}); } catch (e) { /* noop */ }
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-[#ddd]"
      >
        <motion.button
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white">
          실험실
        </h1>
        <div className="w-[24px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-[20px] pt-[20px] pb-[8px]">
          <p className="text-[13px] text-layout-gray-300 leading-[1.5]">
            아직 정식 출시 전인 기능을 미리 켜볼 수 있어요.{'\n'}
            불안정할 수 있으니 참고해주세요.
          </p>
        </div>

        <ul className="w-full m-0 p-0 list-none">
          {LAB_FEATURES.map((feature) => {
            const Icon = feature.icon;
            const enabled = !!features[feature.key];
            return (
              <li key={feature.key} className="flex flex-col bg-layout-white dark:bg-layout-black">
                <div className="flex items-center justify-between px-[20px] py-[16px] border-b border-[#ddd] dark:border-border-dark">
                  <div className="flex items-center gap-3 pr-[16px]">
                    <Icon weight="fill" className="text-[20px] text-primary-main-600 shrink-0" />
                    <div className="flex flex-col gap-[2px]">
                      <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">
                        {feature.name}
                      </span>
                      <span className="text-[13px] text-layout-gray-200 dark:text-layout-gray-300 leading-tight">
                        {feature.desc}
                      </span>
                    </div>
                  </div>
                  <ToggleSwitch checked={enabled} onChange={() => handleToggle(feature.key)} />
                </div>

                {enabled && (
                  <div
                    onClick={handleEnterChat}
                    className="flex items-center justify-between px-[20px] py-[15px] border-b border-[#ddd] dark:border-border-dark bg-layout-gray-50 dark:bg-layout-gray-dark"
                  >
                    <span className="text-[15px] font-[600] text-layout-black dark:text-layout-white">
                      채팅방 입장
                    </span>
                    <CaretRight className="text-[18px] text-layout-black dark:text-layout-white" />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default LabNewFullSheet;
