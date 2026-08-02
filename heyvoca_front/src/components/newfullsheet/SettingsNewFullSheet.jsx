import React from 'react';
import {
  Coins, HandHeart, CircleHalf, Quotes, SpeakerHigh, Bell,
  Plant, Drop, Flask, FileText, Lock, Info,
} from '@phosphor-icons/react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { useTheme } from '../../context/ThemeContext';
import { useExampleSettings } from '../../context/ExampleSettingsContext';
import { openExternalUrl, parseAppVersion, isAppVersionAtLeast } from '../../utils/osFunction';
import { readFarmSettings, isCareNotifyOn } from '../../utils/farmSettings';
import { SheetBar, GroupLabel, SettingRow } from './settingsUi';

// '실험실'(채팅으로 학습 등 네이티브 기능)을 지원하는 최소 앱 버전.
// 구버전 앱에는 네이티브 채팅 화면/알림 핸들러가 없으므로 이 버전 미만에서는 실험실을 숨긴다.
const LAB_MIN_APP_VERSION = '1.1.0';
import ThemeNewFullSheet from './ThemeNewFullSheet';
import ExampleSettingsNewFullSheet from './ExampleSettingsNewFullSheet';
import PushNotificationsNewFullSheet from './PushNotificationsNewFullSheet';
import VoiceSettingsNewFullSheet from './VoiceSettingsNewFullSheet';
import DailyNewLimitNewFullSheet from './DailyNewLimitNewFullSheet';
import LabNewFullSheet from './LabNewFullSheet';

const APP_VERSION_INFO = parseAppVersion();

const TERMS_URL = 'https://heyvoca.ghmate.com/terms-of-service';
const PRIVACY_URL = 'https://heyvoca.ghmate.com/privacy-policy';

// 하루 도구 구매 지출 상한 (기획 9.4). 백엔드 shop.DAILY_GEM_SPEND_LIMIT 과 같은 값이며
// 사용자별 컬럼이 아직 없어 서버가 전역 고정값으로 다룬다 → 여기서는 읽기 전용으로 보여준다.
const DAILY_GEM_SPEND_LIMIT = 30;

/**
 * 설정 — 마이페이지 우상단 기어에서 들어온다 (시안 설정 1절 ①).
 * 기존 그룹(기기 관리 · 학습 관리 · 실험실 · 정보)을 그대로 두고 맨 위에 농장 그룹을 얹었다.
 * 이 화면에는 분홍이 0개다 — 값이 전부 회색 텍스트다 (시안 6절).
 */
const SettingsNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { pushNewFullSheet } = useNewFullSheetActions();
  const { userProfile } = useUser();
  const { isDark } = useTheme();
  const { showExamples } = useExampleSettings();

  const openSheet = (Component) => {
    pushNewFullSheet(Component, {}, { smFull: true, closeOnBackdropClick: true });
  };

  const farm = readFarmSettings();
  const newLimit = userProfile?.daily_new_limit ?? 20;
  const iconSize = 16;

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <SheetBar title="설정" />

      <div className="flex-1 overflow-y-auto px-[16px] pb-[20px]">
        {/* ── 농장 — 기획안이 "설정에서만 바꾼다"고 못 박은 항목들 (시안 2절) ── */}
        <GroupLabel first>농장</GroupLabel>
        <SettingRow
          first
          icon={<Coins size={iconSize} />}
          title="하루 도구 구매 한도"
          sub={`보석 ${DAILY_GEM_SPEND_LIMIT}개까지 살 수 있어요`}
          value={`${DAILY_GEM_SPEND_LIMIT}보석`}
          caret={false}
        />
        <SettingRow
          icon={<HandHeart size={iconSize} />}
          title="돌봄 알림"
          sub="시들거나 썩기 전에 알려드려요"
          value={isCareNotifyOn(farm) ? '켜짐' : '꺼짐'}
          onClick={() => openSheet(PushNotificationsNewFullSheet)}
        />

        {/* ── 기기 관리 ── */}
        <GroupLabel>기기 관리</GroupLabel>
        <SettingRow
          first
          icon={<CircleHalf size={iconSize} />}
          title="테마"
          value={isDark ? '다크' : '라이트'}
          onClick={() => openSheet(ThemeNewFullSheet)}
        />
        <SettingRow
          icon={<Quotes size={iconSize} />}
          title="예문 보기"
          value={showExamples ? '항상 보기' : '숨김'}
          onClick={() => openSheet(ExampleSettingsNewFullSheet)}
        />
        <SettingRow
          icon={<SpeakerHigh size={iconSize} />}
          title="음성"
          onClick={() => openSheet(VoiceSettingsNewFullSheet)}
        />
        <SettingRow
          icon={<Bell size={iconSize} />}
          title="푸시 알림"
          onClick={() => openSheet(PushNotificationsNewFullSheet)}
        />

        {/* ── 학습 관리 — 새 단어 수만 있던 자리에 복습량이 붙는다 (시안 1절 ③) ── */}
        <GroupLabel>학습 관리</GroupLabel>
        <SettingRow
          first
          icon={<Plant size={iconSize} />}
          title="하루 새 단어"
          value={newLimit === 0 ? '무제한' : `${newLimit}개`}
          onClick={() => openSheet(DailyNewLimitNewFullSheet)}
        />
        <SettingRow
          icon={<Drop size={iconSize} />}
          title="하루 복습량"
          value={farm.reviewAuto ? '자동' : '직접'}
          onClick={() => openSheet(DailyNewLimitNewFullSheet)}
        />

        {/* 실험실 — 네이티브 채팅 등 신기능 지원 앱 버전(1.1.0+)에서만 노출.
            구버전 앱/순수 웹에서는 숨겨 먹통 진입/무의미한 알림을 방지한다. */}
        {isAppVersionAtLeast(LAB_MIN_APP_VERSION) && (
          <>
            <GroupLabel>실험실</GroupLabel>
            <SettingRow
              first
              icon={<Flask size={iconSize} />}
              title="실험실"
              sub="정식 출시 전 기능을 미리 켜봐요"
              onClick={() => openSheet(LabNewFullSheet)}
            />
          </>
        )}

        {/* ── 정보 ── */}
        <GroupLabel>정보</GroupLabel>
        <SettingRow
          first
          icon={<FileText size={iconSize} />}
          title="이용약관"
          onClick={() => openExternalUrl(TERMS_URL)}
        />
        {/* 방패는 연속 학습 보호권이 쓴다 — 겹치면 안 되므로 자물쇠다 (시안 7절) */}
        <SettingRow
          icon={<Lock size={iconSize} />}
          title="개인정보처리방침"
          onClick={() => openExternalUrl(PRIVACY_URL)}
        />
        {APP_VERSION_INFO && (
          <SettingRow
            icon={<Info size={iconSize} />}
            title="버전 정보"
            value={`v${APP_VERSION_INFO.version}${APP_VERSION_INFO.build ? ` (${APP_VERSION_INFO.build})` : ''}`}
            caret={false}
          />
        )}
      </div>
    </div>
  );
};

export default SettingsNewFullSheet;
