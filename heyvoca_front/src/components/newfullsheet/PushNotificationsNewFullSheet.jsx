import React, { useState, useEffect, useRef } from 'react';
import { Drop, Leaf, Warning, Flame, CalendarBlank, Gift, Info } from '@phosphor-icons/react';

import { vibrate, showToast, isAppVersionAtLeast } from '../../utils/osFunction';
import { useUser } from '../../context/UserContext';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import postMessageManager from '../../utils/postMessageManager';
import { readFarmSettings, writeFarmSettings } from '../../utils/farmSettings';
import { SheetBar, GroupLabel, SettingRow, InfoBox } from './settingsUi';

// 앱(WebView) 환경 여부 — 순수 웹에서는 OS 알림 권한 개념이 없어 게이팅을 건너뛴다.
const isRNWebView = typeof window !== 'undefined' && !!window.ReactNativeWebView;

// OS 알림 권한 네이티브 핸들러(requestNotificationPermission/checkNotificationPermission/openAppSettings)가
// 포함된 앱 최소 버전. 이 버전 미만 앱(또는 순수 웹)에서는 네이티브 권한 게이팅을 건너뛰고
// 기존 동작(토글 즉시 반영)으로 폴백한다 — 구버전 앱에서 응답을 못 받아 멈추는 것을 방지.
const NOTIF_PERMISSION_MIN_APP_VERSION = '1.0.3';
const supportsNativePermission = isRNWebView && isAppVersionAtLeast(NOTIF_PERMISSION_MIN_APP_VERSION);

/**
 * 알림 설정 — 토글 하나에서 다섯 개로 (시안 설정 3절).
 *
 * 서버가 아는 값은 둘뿐이다(is_study_allowed / is_marketing_allowed).
 *   오늘의 물주기 → is_study_allowed (기존 "학습 유도 알림"과 같은 알림이다)
 *   혜택 · 이벤트 → is_marketing_allowed
 * 시듦 경고 · 부패 임박 · 연속 학습 위험 · 주간 요약은 아직 계약이 없어 기기 로컬에 남는다.
 * (utils/farmSettings.js 주석 참고)
 */
const PushNotificationsNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { fcmToken, isLogin } = useUser();

  // localStorage 캐시 우선 → 매번 로딩 없이 즉시 렌더. 마운트 후 백그라운드로 최신화.
  const cachedPush = (() => {
    try { return JSON.parse(localStorage.getItem('pushSettings')) || null; } catch (e) { return null; }
  })();
  const [isStudyAllowed, setIsStudyAllowed] = useState(cachedPush?.study ?? true);
  const [isMarketingAllowed, setIsMarketingAllowed] = useState(cachedPush?.marketing ?? false);
  const [farm, setFarm] = useState(readFarmSettings);

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

  // 토글을 켤 때만 OS 권한을 확보한다. 미허용이면 켜지 않고 설정으로 유도한다.
  const grantIfTurningOn = async (turningOn) => {
    if (!turningOn) return true;
    if (permRequestInFlight.current) return false;
    permRequestInFlight.current = true;
    const { granted, token } = await ensureNotificationPermission();
    permRequestInFlight.current = false;
    permissionGrantedRef.current = granted;
    if (!granted) {
      guideToEnableNotification();
      return false;
    }
    if (token && token !== effectiveToken) {
      setEffectiveToken(token);
      await registerToken(token);
    }
    return true;
  };

  // ── 서버가 아는 두 값 ─────────────────────────────
  const toggleServerFlag = async (key) => {
    vibrate({ duration: 5 });
    const isStudy = key === 'study';
    const current = isStudy ? isStudyAllowed : isMarketingAllowed;
    const setLocal = isStudy ? setIsStudyAllowed : setIsMarketingAllowed;
    const next = !current;

    if (!(await grantIfTurningOn(next))) { setLocal(false); return; }

    setLocal(next);
    const merged = isStudy
      ? { study: next, marketing: isMarketingAllowed }
      : { study: isStudyAllowed, marketing: next };
    try { localStorage.setItem('pushSettings', JSON.stringify(merged)); } catch (e) { /* noop */ }
    await persistSetting(
      effectiveToken,
      { [isStudy ? 'is_study_allowed' : 'is_marketing_allowed']: next },
      () => setLocal(current),
    );
  };

  // ── 아직 계약이 없어 기기 로컬에만 남는 값 ─────────
  const toggleFarmFlag = async (key) => {
    vibrate({ duration: 5 });
    const next = !farm[key];
    if (!(await grantIfTurningOn(next))) return;
    setFarm(writeFarmSettings({ ...farm, [key]: next }));
  };

  const iconSize = 16;

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <SheetBar title="알림 설정" />

      <div className="flex-1 overflow-y-auto px-[16px] pb-[20px]">
        <GroupLabel first>농장 알림</GroupLabel>
        <SettingRow
          first
          icon={<Drop size={iconSize} />}
          title="오늘의 물주기"
          sub="오후 1시 · 저녁 9시"
          toggle={isStudyAllowed}
          onClick={() => toggleServerFlag('study')}
        />
        {/* 시듦과 부패는 급한 정도가 달라 같은 경고 아이콘을 쓰지 않는다 (시안 7절) */}
        <SettingRow
          icon={<Leaf size={iconSize} />}
          title="시듦 경고"
          sub="물 줄 때가 지난 작물이 있을 때"
          toggle={farm.notifyWilt}
          onClick={() => toggleFarmFlag('notifyWilt')}
        />
        {/* 부패는 공포로 쓰지 않는다 — 사실 서술로 적는다 (시안 3절) */}
        <SettingRow
          icon={<Warning size={iconSize} />}
          title="부패 임박"
          sub="오늘 안 주면 썩는 작물이 있을 때"
          toggle={farm.notifyRot}
          onClick={() => toggleFarmFlag('notifyRot')}
        />
        <SettingRow
          icon={<Flame size={iconSize} />}
          title="연속 학습 위험"
          sub="자정까지 5개를 못 맞혔을 때"
          toggle={farm.notifyStreak}
          onClick={() => toggleFarmFlag('notifyStreak')}
        />

        <GroupLabel>요약</GroupLabel>
        <SettingRow
          first
          icon={<CalendarBlank size={iconSize} />}
          title="주간 요약"
          sub="월요일 아침에 지난주 성장을"
          toggle={farm.notifyWeekly}
          onClick={() => toggleFarmFlag('notifyWeekly')}
        />

        <GroupLabel>기타</GroupLabel>
        <SettingRow
          first
          icon={<Gift size={iconSize} />}
          title="혜택 · 이벤트"
          toggle={isMarketingAllowed}
          onClick={() => toggleServerFlag('marketing')}
        />

        <InfoBox icon={<Info size={13} />}>
          알림은 <b className="font-[700] text-layout-gray-500 dark:text-layout-gray-100">하루 최대 3번</b>까지만 보내요.
          여러 조건이 겹치면 가장 급한 것 하나로 합쳐서 보내드려요.
        </InfoBox>
        <InfoBox tone="warn" icon={<Warning size={13} />}>
          기기에서 알림을 꺼두면 여기 설정과 관계없이 오지 않아요.
        </InfoBox>
      </div>
    </div>
  );
};

export default PushNotificationsNewFullSheet;
