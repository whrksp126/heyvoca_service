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
import { getUnlockStatusApi, completeOnboardingMissionApi } from '../api/study';

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
  const { isLogin, isLoginChecked, userProfile, fetchUserProfile, setUserProfile } = useUser();

  const [unlock, setUnlock] = useState(null); // unlock-status 응답 data 전체
  const [loading, setLoading] = useState(false);
  // 보상 지급이 완료됐지만 아직 유저에게 "보상 받기" 연출로 보여주지 못한 미션 큐.
  // (백엔드가 완료 시점에 이미 보석/빈 단어장을 지급하므로, 이 큐는 순수 연출용 대기열이다)
  // 실제 자동 노출은 OnboardingMissionRewardWatcher가 라우트(학습 결과 화면 회피)를 보고 처리한다.
  const [pendingMissionRewards, setPendingMissionRewards] = useState([]);

  // 직전 missions 스냅샷 — refreshUnlock 시 done false→true 전환 감지(diff)용
  const missionsRef = useRef(null);

  // 새로 완료된 미션(들)을 보상 연출 대기열에 큐잉(key 기준 중복 방지).
  // 실제 표시는 OnboardingMissionRewardWatcher가 안전한 라우트에서만 자동으로 연다.
  const queueMissionRewards = useCallback((newlyDoneMissions) => {
    if (!newlyDoneMissions || newlyDoneMissions.length === 0) return;
    setPendingMissionRewards((prev) => {
      const merged = [...prev];
      newlyDoneMissions.forEach((mission) => {
        if (!mission?.key) return;
        if (merged.some((m) => m.key === mission.key)) return;
        merged.push(mission);
      });
      return merged;
    });
  }, []);

  // unlock-status 응답(data)을 상태에 반영. celebrate=true면 이전 missions와 비교해 새로 완료된 항목을 보상 큐에 적재.
  const applyUnlockData = useCallback((data, { celebrate = true } = {}) => {
    if (!data) return;
    const prevMissions = missionsRef.current;

    if (celebrate && prevMissions && Array.isArray(data.missions)) {
      const newlyDone = data.missions.filter((m) => {
        const prev = prevMissions.find((p) => p.key === m.key);
        return m.done && (!prev || !prev.done);
      });
      queueMissionRewards(newlyDone);
    }

    missionsRef.current = Array.isArray(data.missions) ? data.missions : null;
    setUnlock(data);
  }, [queueMissionRewards]);

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

  // 로그인 상태에서 조회. 로그아웃 시 초기화.
  // userProfile.id / onboarding_ver도 의존성에 포함 — 온보딩 직후 애플 가입/로그인 시
  // unlock-status를 먼저 가져온 뒤 migrate가 onboarding_ver='1'을 세팅하는 레이스가 있어
  // (그 순간엔 legacy=true로 잡혀 미션/잠금이 숨겨진다), migrate 후 fetchUserProfile로
  // onboarding_ver가 갱신되면 여기서 재조회해 legacy=false(미션 노출) 상태로 정정한다.
  useEffect(() => {
    if (isLogin && isLoginChecked) {
      refreshUnlock();
    } else if (!isLogin && isLoginChecked) {
      setUnlock(null);
      missionsRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogin, isLoginChecked, userProfile?.id, userProfile?.onboarding_ver]);

  // 프론트 트리거 미션 완료 처리 — key: 'ai_test' | 'search_word' | 'focus_study' | 'free_test'
  // (make_book/buy_book은 백엔드 훅 전용 — 여기서 호출하지 않음)
  // 보상(보석 지급 + make_book이면 빈 단어장 생성)은 백엔드가 이 호출 시점에 이미 처리한다.
  // 여기서는 완료 상태만 갱신하고, "보상 받기" 연출은 pendingMissionRewards 큐에 적재해
  // OnboardingMissionRewardWatcher가 학습 결과 화면과 겹치지 않는 안전한 라우트에서 자동으로 보여준다.
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

      // diff 기반 큐잉은 스킵하고(celebrate:false), newly_completed 응답을 직접 사용해 큐잉
      applyUnlockData(res.data, { celebrate: false });

      if (newly_completed) {
        // 응답에 포함된 unlock-status 전체 missions에서 완료된 항목의 전체 정보(title/order/reward_book 등)를 찾는다.
        const fullMission = Array.isArray(res.data.missions)
          ? res.data.missions.find((m) => m.key === key)
          : null;
        queueMissionRewards([fullMission || { key, unlocks, reward_gem, title: FEATURE_LABELS[unlocks] || unlocks, reward_book: false }]);
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
  }, [unlock, applyUnlockData, queueMissionRewards, setUserProfile, fetchUserProfile]);

  // featureKey(vocabook/store/dict/listen/custom) 잠금 여부.
  // legacy거나 unlock 미조회(null)면 낙관적으로 열림 처리(false=안 잠김).
  const isFeatureLocked = useCallback((featureKey) => {
    if (!unlock || unlock.legacy) return false;
    return unlock.unlocked?.[featureKey] === false;
  }, [unlock]);

  // "보상 받기" 연출을 다 보여줬거나(또는 사용자가 시트를 닫아) 더 이상 대기열이 필요 없을 때 비운다.
  // 보상 자체는 이미 완료 시점에 지급되었으므로, 큐를 비워도 데이터 손실은 없다(연출만 재노출되지 않음).
  const consumePendingMissionRewards = useCallback(() => {
    setPendingMissionRewards([]);
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
    // 보상 받기 연출 대기열 — 실제 자동 노출은 OnboardingMissionRewardWatcher가 처리
    pendingMissionRewards,
    consumePendingMissionRewards,
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
