import React from 'react';
import {
  CircleHalf, Quotes, SpeakerHigh, Bell,
  Plant, Flask, FileText, Lock, Info, Translate,
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

/**
 * 설정 — 마이페이지 우상단 기어에서 들어온다 (시안 설정 1절 ①).
 * 그룹은 기기 관리 · 학습 관리 · 실험실 · 정보 넷이다.
 * 같은 시트를 여는 줄은 하나로 합쳤다 — 돌봄 알림은 '알림', 새 단어·복습량은 '하루 학습량'.
 * 이 화면에는 분홍이 0개다 — 값이 전부 회색 텍스트다 (시안 6절).
 */
const SettingsNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { pushNewFullSheet } = useNewFullSheetActions();
  const { userProfile, learningLang } = useUser();
  const { isDark } = useTheme();
  const { showExamples, showFurigana, setShowFurigana } = useExampleSettings();
  // 후리가나 표시 — 일본어 학습 중일 때만 노출(learningLang 이 아직 없으면 항상 노출)
  const showFuriganaRow = learningLang === undefined || learningLang === 'ja';
  // 손맛(햅틱)은 모든 사용자에게 항상 적용된다 — 설정 토글 없음(lib/feel/haptics.js).
  // 당겨서 새로고침 진단 표시는 개발 전용 디버그였다 — 설정 토글 제거(hooks/usePullToRefresh.js).

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
        {/* ── 기기 관리 ── */}
        <GroupLabel first>기기 관리</GroupLabel>
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
        {showFuriganaRow && (
          <SettingRow
            icon={<Translate size={iconSize} />}
            title="후리가나 표시"
            sub="일본어 예문의 한자 위에 읽기를 달아요"
            toggle={showFurigana}
            onClick={() => setShowFurigana(!showFurigana)}
          />
        )}
        <SettingRow
          icon={<SpeakerHigh size={iconSize} />}
          title="음성"
          onClick={() => openSheet(VoiceSettingsNewFullSheet)}
        />
        {/* 돌봄 알림(물주기 · 시듦 · 부패 · 연속 위험)도 이 줄에서 들어간다 — 값은 그 묶음의 켜짐 여부다.
            하루 도구 구매 한도 항목은 연속 학습 보호권 개편으로 제거했다
            (계약 scratchpad/streak_shield_contract.md §1 "보석 하루 사용 한도 완전 제거"). */}
        <SettingRow
          icon={<Bell size={iconSize} />}
          title="알림"
          sub="돌봄 알림 · 주간 요약 · 혜택 소식"
          value={isCareNotifyOn(farm) ? '돌봄 켜짐' : '돌봄 꺼짐'}
          onClick={() => openSheet(PushNotificationsNewFullSheet)}
        />

        {/* ── 학습 관리 — 새 단어 수와 복습량을 한 줄에 요약한다(둘 다 '학습 설정' 시트에서 바꾼다) ── */}
        <GroupLabel>학습 관리</GroupLabel>
        <SettingRow
          first
          icon={<Plant size={iconSize} />}
          title="하루 학습량"
          value={`새 단어 ${newLimit === 0 ? '무제한' : `${newLimit}개`} · 복습 ${farm.reviewAuto ? '자동' : '직접'}`}
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
