import React from 'react';
import { CaretLeft, CaretRight, SunDim, TextAlignJustify, Bell, SpeakerHigh, BookOpen, FileText, ShieldCheck, Info } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { useTheme } from '../../context/ThemeContext';
import { useExampleSettings } from '../../context/ExampleSettingsContext';
import { vibrate, openExternalUrl, parseAppVersion } from '../../utils/osFunction';
import ThemeNewFullSheet from './ThemeNewFullSheet';
import ExampleSettingsNewFullSheet from './ExampleSettingsNewFullSheet';
import PushNotificationsNewFullSheet from './PushNotificationsNewFullSheet';
import VoiceSettingsNewFullSheet from './VoiceSettingsNewFullSheet';
import DailyNewLimitNewFullSheet from './DailyNewLimitNewFullSheet';

const APP_VERSION_INFO = parseAppVersion();

const TERMS_URL = 'https://heyvoca.ghmate.com/terms-of-service';
const PRIVACY_URL = 'https://heyvoca.ghmate.com/privacy-policy';

// 설정 항목 한 줄
const SettingsItem = ({ icon, label, value, onClick, showCaret = true }) => (
  <li
    onClick={onClick ? () => { vibrate({ duration: 5 }); onClick(); } : undefined}
    className="flex items-center justify-between px-5 py-5 border-b border-border dark:border-border-dark bg-layout-white dark:bg-layout-black"
  >
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">{label}</span>
    </div>
    <div className="flex items-center gap-1.5">
      {value && <span className="text-[12px] font-normal text-[#999]">{value}</span>}
      {showCaret && <CaretRight className="text-[20px] text-layout-black dark:text-layout-white" />}
    </div>
  </li>
);

// 그룹 라벨
const GroupLabel = ({ children }) => (
  <li className="px-5 pt-6 pb-2 bg-layout-gray-50 dark:bg-layout-black">
    <span className="text-[13px] font-[600] text-layout-gray-300">{children}</span>
  </li>
);

// 마이페이지 우측 상단 ⚙️ → 설정 풀시트 (기기/학습/정보 그룹)
const SettingsNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet, pushNewFullSheet } = useNewFullSheetActions();
  const { userProfile } = useUser();
  const { isDark } = useTheme();
  const { showExamples } = useExampleSettings();

  const openSheet = (Component) => {
    pushNewFullSheet(Component, {}, { smFull: true, closeOnBackdropClick: true });
  };

  const iconClass = "text-[20px] text-primary-main-600";

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
          설정
        </h1>
        <div className="w-[24px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <ul className="w-full m-0 p-0 list-none">
          <GroupLabel>기기 관리</GroupLabel>
          <SettingsItem
            icon={<SunDim weight="fill" className={iconClass} />}
            label="테마"
            value={isDark ? '다크' : '라이트'}
            onClick={() => openSheet(ThemeNewFullSheet)}
          />
          <SettingsItem
            icon={<TextAlignJustify weight="fill" className={iconClass} />}
            label="예문 보기"
            value={showExamples ? '항상 보기' : '숨김'}
            onClick={() => openSheet(ExampleSettingsNewFullSheet)}
          />
          <SettingsItem
            icon={<SpeakerHigh weight="fill" className={iconClass} />}
            label="음성"
            onClick={() => openSheet(VoiceSettingsNewFullSheet)}
          />
          <SettingsItem
            icon={<Bell weight="fill" className={iconClass} />}
            label="푸시 알림"
            onClick={() => openSheet(PushNotificationsNewFullSheet)}
          />

          <GroupLabel>학습 관리</GroupLabel>
          <SettingsItem
            icon={<BookOpen weight="fill" className={iconClass} />}
            label="신규 단어 목표"
            value={(userProfile?.daily_new_limit ?? 20) === 0 ? '무제한' : `${userProfile?.daily_new_limit ?? 20}개`}
            onClick={() => openSheet(DailyNewLimitNewFullSheet)}
          />

          <GroupLabel>정보</GroupLabel>
          <SettingsItem
            icon={<FileText weight="fill" className={iconClass} />}
            label="이용약관"
            onClick={() => openExternalUrl(TERMS_URL)}
          />
          <SettingsItem
            icon={<ShieldCheck weight="fill" className={iconClass} />}
            label="개인정보처리방침"
            onClick={() => openExternalUrl(PRIVACY_URL)}
          />
          {APP_VERSION_INFO && (
            <SettingsItem
              icon={<Info weight="fill" className={iconClass} />}
              label="버전 정보"
              value={`v${APP_VERSION_INFO.version}${APP_VERSION_INFO.build ? ` (${APP_VERSION_INFO.build})` : ''}`}
              showCaret={false}
            />
          )}
        </ul>
      </div>
    </div>
  );
};

export default SettingsNewFullSheet;
