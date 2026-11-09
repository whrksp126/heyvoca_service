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
  dict: '찾기', // 키는 백엔드 계약이라 'dict' 그대로, 사용자에게 보이는 이름만 시안 §10 의 탭 이름

  listen: '집중 반복 학습',
  custom: '자유 설정 테스트',
};

/**
 * v2 입문 퀘스트 체인(이슈 #25) — 화면 문구 정본.
 * 순서·보상·해금 대상의 정본은 서버(/onboarding/unlock-status)다. 여기서는 서버 응답에 없는
 * '한 줄 설명'·'하러 가기 문구'만 들고, 제목은 서버 title 이 있으면 그것을 쓴다(없을 때 폴백).
 *
 *  1 plant_seed  새 씨앗 심기                → vocabook(단어장 탭)   [서버 감지]
 *  2 make_book   단어장 만들고 단어 직접 추가 → dict(찾기 탭)         [서버 감지]
 *  3 search_word 찾기에서 단어 검색          → store(상점 탭)        [프론트 신호]
 *  4 buy_book    상점에서 단어장 담기         → listen(집중 반복 학습) [서버 감지]
 *  5 focus_study 집중 반복 학습 완료          → custom(자유 설정 테스트) [프론트 신호]
 *  6 care_farm   농장 돌보기(복습) 완료       → (마무리)              [서버 감지]
 */
export const QUEST_META = {
  plant_seed: { title: '새 씨앗 심기', desc: '새 단어 몇 개를 만나고 밭에 심어 보세요' },
  make_book: { title: '단어장 만들고 단어 직접 추가', desc: '내 단어장을 만들고 단어를 하나 넣어 보세요' },
  search_word: { title: '찾기에서 단어 검색', desc: '궁금한 단어를 하나 찾아보세요' },
  buy_book: { title: '상점에서 단어장 담기', desc: '마음에 드는 단어장을 하나 담아 보세요' },
  focus_study: { title: '집중 반복 학습 완료', desc: '단어를 듣고 따라 읽으며 끝까지 한 번 익혀 보세요' },
  care_farm: { title: '농장 돌보기', desc: '심은 단어를 한 번 복습해 밭을 돌봐 주세요' },
};

// 프론트가 완료 신호를 보내는 미션. 나머지(plant_seed·make_book·buy_book·care_farm)는
// 서버가 학습 저장·단어장 생성·담기 시점에 스스로 감지하므로 refreshUnlock 만 한다.
export const FRONTEND_SIGNAL_MISSIONS = ['search_word', 'focus_study'];

export const questTitleOf = (mission) =>
  (mission?.title || QUEST_META[mission?.key]?.title || '').trim();

// 받침 유무로 조사 고르기 — 한글이 아니면(영문·숫자 끝) 받침 없는 쪽으로 둔다.
const hasBatchim = (w) => {
  const last = w.charCodeAt(w.length - 1);
  return last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
};
export const withObjectJosa = (word) => {
  const w = (word || '').trim();
  return `${w}${hasBatchim(w) ? '을' : '를'}`;
};
export const withSubjectJosa = (word) => {
  const w = (word || '').trim();
  return `${w}${hasBatchim(w) ? '이' : '가'}`;
};
// 해금 대상의 화면 이름 — 탭이면 '찾기 탭'처럼 붙인다.
const TAB_FEATURES = ['vocabook', 'dict', 'store'];
export const featureNameOf = (featureKey) => {
  const label = FEATURE_LABELS[featureKey] || featureKey || '';
  return TAB_FEATURES.includes(featureKey) ? `${label} 탭` : label;
};

/**
 * 온보딩 행동 미션·기능 잠금 스위치.
 *
 * 당근 농장 V2 를 검토하는 동안 꺼 둔다. 켜져 있으면 단어장·상점·사전 탭이 잠기고
 * 홈에 미션 배너와 보상 팝업이 떠서, 정작 봐야 할 화면에 닿기까지 미션을 먼저 깨야 한다.
 *
 * 코드를 지우지 않고 스위치로 둔 이유는 새 기획에 맞춰 **다시 설계할 대상**이기 때문이다.
 * 되살리려면 이 값을 true 로 되돌리면 된다 — 아래 로직은 전부 그대로 살아 있다.
 *
 * 끈 상태에서는 `unlock` 을 legacy(기존 가입자) 형태로 고정한다. 이 Context 를 구독하는
 * UI 는 이미 legacy 일 때 스스로 숨도록 만들어져 있어서, 화면마다 조건을 새로 넣을 필요가 없다.
 *
 * **가입 퍼널(`/onboarding` 페이지)은 이 스위치와 무관하다.** 그건 비로그인 사용자의
 * 레벨·목표 선택과 회원가입 흐름이라 끄면 신규 가입이 막힌다.
 */
export const ONBOARDING_MISSIONS_ENABLED = true; // 이슈 #25 — v2 체인으로 되살림

// 스위치를 껐을 때 쓰는 응답. 백엔드가 기존 가입자에게 내려주는 형태와 같다.
const DISABLED_UNLOCK = {
  legacy: true,
  missions: [],
  current_mission: null,
  unlocked: {},
  thresholds: {},
  completed_sessions: 0,
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
    if (!data) return 0;
    const prevMissions = missionsRef.current;

    let newlyDoneCount = 0;
    // legacy 응답은 전부 done=true 라 diff 하면 '전부 새로 완료'로 보인다 — 연출 대상에서 뺀다.
    if (celebrate && prevMissions && !data.legacy && Array.isArray(data.missions)) {
      const newlyDone = data.missions.filter((m) => {
        const prev = prevMissions.find((p) => p.key === m.key);
        return m.done && (!prev || !prev.done);
      });
      newlyDoneCount = newlyDone.length;
      queueMissionRewards(newlyDone);
    }

    missionsRef.current = Array.isArray(data.missions) ? data.missions : null;
    setUnlock(data);
    return newlyDoneCount;
  }, [queueMissionRewards]);

  // 해금 상태 재조회
  const refreshUnlock = useCallback(async () => {
    // 스위치가 꺼져 있으면 조회하지 않는다. 서버는 그대로 두고 화면만 덮는다.
    if (!ONBOARDING_MISSIONS_ENABLED) {
      setUnlock(DISABLED_UNLOCK);
      return DISABLED_UNLOCK;
    }
    try {
      setLoading(true);
      const res = await getUnlockStatusApi();
      if (res?.code === 200 && res.data) {
        const newlyDone = applyUnlockData(res.data);
        // 서버 감지 미션(plant_seed·make_book·buy_book·care_farm)은 완료 시점에 보석이 이미
        // 지급돼 있다 — 보석 카운터가 연출 뒤 맞는 값을 보이도록 프로필을 다시 읽는다.
        if (newlyDone > 0) fetchUserProfile();
        return res.data;
      }
      return null;
    } catch (error) {
      console.error('refreshUnlock 오류:', error);
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 프론트 트리거 미션 완료 처리 — key: FRONTEND_SIGNAL_MISSIONS('search_word' | 'focus_study')
  // (plant_seed·make_book·buy_book·care_farm 은 서버 감지 — 여기서 호출하지 않고 refreshUnlock 으로 반영)
  // 보상(보석 지급 + make_book이면 빈 단어장 생성)은 백엔드가 이 호출 시점에 이미 처리한다.
  // 여기서는 완료 상태만 갱신하고, "보상 받기" 연출은 pendingMissionRewards 큐에 적재해
  // OnboardingMissionRewardWatcher가 학습 결과 화면과 겹치지 않는 안전한 라우트에서 자동으로 보여준다.
  const completeMission = useCallback(async (key) => {
    // 이미 완료된 미션이거나 legacy 유저면 호출 스킵(멱등이라 안전하지만 불필요한 호출 방지)
    if (!ONBOARDING_MISSIONS_ENABLED || !FRONTEND_SIGNAL_MISSIONS.includes(key)) {
      return { skipped: true };
    }
    const existing = unlock?.missions?.find((m) => m.key === key);
    // unlock 미조회(null)·legacy·이미 완료면 스킵 — legacy 사용자에게는 아무 호출도 나가지 않는다
    if (!unlock || unlock.legacy || existing?.done) {
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

  const missionsList = unlock?.missions ?? [];
  const currentMissionKey = unlock?.current_mission ?? null;
  const currentMissionInfo = currentMissionKey
    ? missionsList.find((m) => m.key === currentMissionKey) || null
    : null;
  // featureKey 를 여는 미션(잠금 안내의 '선행 퀘스트')
  const missionForFeature = useCallback(
    (featureKey) => (unlock?.missions ?? []).find((m) => m.unlocks === featureKey) || null,
    [unlock]
  );

  const value = {
    unlock,
    currentMissionInfo,
    missionForFeature,
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
