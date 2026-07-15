// src/context/OnboardingUnlockContext.jsx
//
// 온보딩 행동 기반 미션 해금 시스템 — 전역 상태.
// 백엔드 계약: GET /onboarding/unlock-status, POST /onboarding/mission/complete
// (자세한 계약은 src/api/study.jsx의 getUnlockStatusApi / completeOnboardingMissionApi 주석 참고)
//
// legacy 유저(기존 가입자)는 missions 전부 done=true, unlocked 전부 true, current_mission=null로 내려오므로
// 이 Context를 구독하는 UI(미션 배너/체크리스트 등)는 legacy일 때 자동으로 숨겨진다.

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useUser } from './UserContext';
import { useOverlayActions } from './OverlayContext';
import { getUnlockStatusApi, completeOnboardingMissionApi } from '../api/study';
import GemRewardOverlay from '../components/overlay/GemRewardOverlay';

// 잠금 대상 기능 key → 한국어 라벨 (UnlockGuideNewBottomSheet, 홈 배너 등에서 공용으로 사용)
export const FEATURE_LABELS = {
  vocabook: '단어장',
  store: '상점',
  dict: '사전',
  listen: '집중 반복 학습',
  custom: '자유 설정 테스트',
};

export const OnboardingUnlockContext = createContext(null);

export const OnboardingUnlockProvider = ({ children }) => {
  const { isLogin, isLoginChecked, fetchUserProfile, setUserProfile } = useUser();
  const { showOverlay } = useOverlayActions();

  const [unlock, setUnlock] = useState(null); // unlock-status 응답 data 전체
  const [loading, setLoading] = useState(false);
  const [celebration, setCelebration] = useState(null); // 최근 트리거된 축하 연출 항목(참고/디버그용)

  // 직전 missions 스냅샷 — refreshUnlock 시 done false→true 전환 감지(diff)용
  const missionsRef = useRef(null);

  // 새로 완료된 미션들에 대한 축하 오버레이를 순서대로 큐잉
  const celebrateMissions = useCallback((newlyDoneMissions) => {
    if (!newlyDoneMissions || newlyDoneMissions.length === 0) return;
    newlyDoneMissions.forEach((mission) => {
      const label = FEATURE_LABELS[mission.unlocks] || mission.unlocks || '새 기능';
      const rewardGem = mission.reward_gem ?? 0;
      const entry = { key: mission.key, label, reward_gem: rewardGem };
      setCelebration(entry);
      showOverlay(GemRewardOverlay, {
        gemCount: rewardGem,
        title: `${label} 기능이 열렸어요!`,
        description: '다음 미션에 도전해보세요!',
      });
    });
  }, [showOverlay]);

  // unlock-status 응답(data)을 상태에 반영. celebrate=true면 이전 missions와 비교해 새로 완료된 항목을 축하 연출.
  const applyUnlockData = useCallback((data, { celebrate = true } = {}) => {
    if (!data) return;
    const prevMissions = missionsRef.current;

    if (celebrate && prevMissions && Array.isArray(data.missions)) {
      const newlyDone = data.missions.filter((m) => {
        const prev = prevMissions.find((p) => p.key === m.key);
        return m.done && (!prev || !prev.done);
      });
      celebrateMissions(newlyDone);
    }

    missionsRef.current = Array.isArray(data.missions) ? data.missions : null;
    setUnlock(data);
  }, [celebrateMissions]);

  // 해금 상태 재조회
  const refreshUnlock = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getUnlockStatusApi();
      if (res?.code === 200 && res.data) {
        applyUnlockData(res.data);
        return res.data;
      }
      return null;
    } catch (error) {
      console.error('refreshUnlock 오류:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyUnlockData]);

  // 로그인 상태에서 최초 1회 조회. 로그아웃 시 초기화.
  useEffect(() => {
    if (isLogin && isLoginChecked) {
      refreshUnlock();
    } else if (!isLogin && isLoginChecked) {
      setUnlock(null);
      missionsRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogin, isLoginChecked]);

  // 프론트 트리거 미션 완료 처리 — key: 'ai_test' | 'search_word' | 'focus_study'
  // (make_book/buy_book은 백엔드 훅 전용 — 여기서 호출하지 않음)
  const completeMission = useCallback(async (key) => {
    // 이미 완료된 미션이거나 legacy 유저면 호출 스킵(멱등이라 안전하지만 불필요한 호출 방지)
    const existing = unlock?.missions?.find((m) => m.key === key);
    if (unlock?.legacy || existing?.done) {
      return { skipped: true };
    }

    try {
      const res = await completeOnboardingMissionApi(key);
      if (res?.code !== 200 || !res.data) return null;

      const { newly_completed, reward_gem, unlocks, gem_cnt } = res.data;

      // diff 기반 축하 연출은 스킵하고(celebrate:false), newly_completed 응답을 직접 사용해 트리거
      applyUnlockData(res.data, { celebrate: false });

      if (newly_completed) {
        celebrateMissions([{ key, unlocks, reward_gem }]);
      }

      if (typeof gem_cnt === 'number') {
        setUserProfile((prev) => ({ ...prev, gem_cnt }));
      }
      // 서버 기준 유저 프로필 최신화(보석 등)
      fetchUserProfile();

      return res.data;
    } catch (error) {
      console.error('completeMission 오류:', error);
      return null;
    }
  }, [unlock, applyUnlockData, celebrateMissions, setUserProfile, fetchUserProfile]);

  // featureKey(vocabook/store/dict/listen/custom) 잠금 여부.
  // legacy거나 unlock 미조회(null)면 낙관적으로 열림 처리(false=안 잠김).
  const isFeatureLocked = useCallback((featureKey) => {
    if (!unlock || unlock.legacy) return false;
    return unlock.unlocked?.[featureKey] === false;
  }, [unlock]);

  const consumeCelebration = useCallback(() => {
    setCelebration(null);
  }, []);

  const value = {
    unlock,
    loading,
    legacy: unlock?.legacy ?? false,
    missions: unlock?.missions ?? [],
    currentMission: unlock?.current_mission ?? null,
    unlocked: unlock?.unlocked ?? {},
    thresholds: unlock?.thresholds ?? {},
    completedSessions: unlock?.completed_sessions ?? 0,
    isFeatureLocked,
    refreshUnlock,
    completeMission,
    // 축하 연출 상태/소비 API(참고용) — 실제 오버레이 표시는 Context 내부에서 자동 트리거됨
    celebration,
    consumeCelebration,
  };

  return (
    <OnboardingUnlockContext.Provider value={value}>
      {children}
    </OnboardingUnlockContext.Provider>
  );
};

export const useOnboardingUnlock = () => {
  const context = useContext(OnboardingUnlockContext);
  if (!context) {
    throw new Error('useOnboardingUnlock must be used within OnboardingUnlockProvider');
  }
  return context;
};
