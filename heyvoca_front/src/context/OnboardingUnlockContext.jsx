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
import { getUnlockStatusApi, completeOnboardingMissionApi, setQuestHiddenApi } from '../api/study';
import { ONBOARDING_MIGRATED_EVENT } from '../utils/studyDataEvents';

/**
 * 입문 퀘스트 체인(이슈 #25 2차) — 화면 문구 정본.
 * 순서·보상의 정본은 서버(/onboarding/unlock-status)다. 제목은 서버 title 이 있으면 그것을 쓴다.
 * **기능 잠금은 없다** — 처음부터 모든 탭·기능을 쓸 수 있다. 1번(구매)만 먼저 하게 유도하고,
 * 그 뒤 2~7은 순서 상관없이 각자 완료된다.
 *
 *  1 buy_book    서점에서 단어장 구매   [서버 감지]
 *  2 plant_seed  새 씨앗 심기           [서버 감지]
 *  3 care_farm   농장 돌보기            [서버 감지]
 *  4 search_word 사전에서 단어 검색     [프론트 신호]
 *  5 make_book   단어장 만들고 단어 추가 [서버 감지]
 *  6 free_test   자유 설정 테스트       [프론트 신호]
 *  7 focus_study 집중 반복 듣기         [프론트 신호]
 */
export const QUEST_ORDER = ['buy_book', 'plant_seed', 'care_farm', 'search_word', 'make_book', 'free_test', 'focus_study'];

export const QUEST_META = {
  buy_book: { title: '서점에서 단어장 구매' },
  plant_seed: { title: '새 씨앗 심기' },
  care_farm: { title: '농장 돌보기' },
  search_word: { title: '사전에서 단어 검색' },
  make_book: { title: '단어장 만들고 단어 추가' },
  free_test: { title: '자유 설정 테스트' },
  focus_study: { title: '집중 반복 듣기' },
};

// 프론트가 완료 신호를 보내는 미션. 나머지(buy_book·plant_seed·care_farm·make_book)는
// 서버가 학습 저장·단어장 생성·구매 시점에 스스로 감지하므로 refreshUnlock 만 한다.
export const FRONTEND_SIGNAL_MISSIONS = ['search_word', 'free_test', 'focus_study'];

// 필수 퀘스트(이슈 #25 9차) — 셋 다 끝나야 홈 퀘스트 카드를 숨길 수 있다(서버 required_done 이 정본).
export const REQUIRED_QUESTS = ['buy_book', 'plant_seed', 'care_farm'];

export const questTitleOf = (mission) =>
  (mission?.title || QUEST_META[mission?.key]?.title || '').trim();

// 서버 순서(order)를 따르되, 없으면 QUEST_ORDER 순서로 정렬한다.
const sortMissions = (missions) => [...missions].sort((a, b) => {
  const oa = a.order ?? (QUEST_ORDER.indexOf(a.key) + 1 || 99);
  const ob = b.order ?? (QUEST_ORDER.indexOf(b.key) + 1 || 99);
  return oa - ob;
});

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
  // 조회 순번 — 늦게 도착한 옛 응답이 새 응답을 덮지 않게(이슈 #25 10차).
  // 가입 직후엔 로그인 순간(migrate 전, legacy=true)과 migrate 직후(legacy=false) 두 번 조회한다.
  // 첫 응답이 늦게 오면 legacy=true 로 덮여 홈 입문 퀘스트가 사라졌다.
  const seqRef = useRef(0);

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
    const seq = ++seqRef.current;
    try {
      setLoading(true);
      const res = await getUnlockStatusApi();
      if (seq !== seqRef.current) return null; // 더 새 조회가 이미 나갔다 — 이 응답은 버린다
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
      if (seq === seqRef.current) setLoading(false);
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
      seqRef.current += 1; // 진행 중 조회 응답 무시
      setUnlock(null);
      missionsRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLogin, isLoginChecked, userProfile?.id, userProfile?.onboarding_ver]);

  // migrate 완료 신호 — 퀘스트 대상 판정(legacy)은 migrate 가 남기는 placement 세션으로 정해진다.
  // onboarding_ver 변화만 기다리면 프로필 재조회가 늦거나 값이 이미 '1' 인 경로에서 legacy=true 가
  // 그대로 남는다. 단어장·통계 Context 와 같은 신호로 직접 다시 받는다(이슈 #25 10차).
  useEffect(() => {
    if (!isLogin) return undefined;
    const onMigrated = () => { refreshUnlock(); };
    window.addEventListener(ONBOARDING_MIGRATED_EVENT, onMigrated);
    return () => window.removeEventListener(ONBOARDING_MIGRATED_EVENT, onMigrated);
  }, [isLogin, refreshUnlock]);

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

      const { newly_completed, reward_gem, gem_cnt } = res.data;

      // diff 기반 큐잉은 스킵하고(celebrate:false), newly_completed 응답을 직접 사용해 큐잉
      seqRef.current += 1; // 진행 중이던 옛 조회 응답이 이 결과를 덮지 않게
      applyUnlockData(res.data, { celebrate: false });

      if (newly_completed) {
        // 응답에 포함된 unlock-status 전체 missions에서 완료된 항목의 전체 정보(title/order/reward_book 등)를 찾는다.
        const fullMission = Array.isArray(res.data.missions)
          ? res.data.missions.find((m) => m.key === key)
          : null;
        queueMissionRewards([fullMission || { key, reward_gem, title: QUEST_META[key]?.title, reward_book: false }]);
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

  // 홈 퀘스트 카드 숨기기/다시 보이기(이슈 #25 9차) — 계정 단위 서버 저장.
  // 필수 셋이 남아 있으면 서버가 409 로 거절한다. 성공하면 응답(unlock-status)으로 상태를 갱신한다.
  const setQuestHidden = useCallback(async (hidden) => {
    if (!unlock || unlock.legacy) return null;
    const res = await setQuestHiddenApi(hidden);
    if (res?.code === 200 && res.data) {
      seqRef.current += 1; // 진행 중이던 옛 조회 응답이 이 결과를 덮지 않게
      applyUnlockData(res.data, { celebrate: false });
      return res.data;
    }
    return null;
  }, [unlock, applyUnlockData]);

  // 기능 잠금은 없앴다(이슈 #25 2차) — 예전 호출부 호환용으로만 남긴다. 항상 열림.
  const isFeatureLocked = useCallback(() => false, []);

  // "보상 받기" 연출을 다 보여줬거나(또는 사용자가 시트를 닫아) 더 이상 대기열이 필요 없을 때 비운다.
  // 보상 자체는 이미 완료 시점에 지급되었으므로, 큐를 비워도 데이터 손실은 없다(연출만 재노출되지 않음).
  const consumePendingMissionRewards = useCallback(() => {
    setPendingMissionRewards([]);
  }, []);

  const missionsList = sortMissions(unlock?.missions ?? []);
  // 지금 할 퀘스트 = 미완료 중 첫 번째(순서 무관 완료라 서버 current_mission 보다 이게 정확하다).
  const currentMissionInfo = missionsList.find((m) => !m.done) || null;
  // 필수 셋 완료 — 서버 값이 없으면(구서버) missions 로 계산한다
  const requiredDone = unlock?.required_done
    ?? REQUIRED_QUESTS.every((k) => missionsList.find((m) => m.key === k)?.done ?? true);
  const questHidden = !!unlock?.quest_hidden;
  // 홈 퀘스트 카드가 보이는지 — 신규 가입자(legacy=false)·남은 퀘스트 있음·숨기지 않음
  const questCardVisible = !!unlock && !(unlock?.legacy) && !!currentMissionInfo
    && missionsList.length > 0 && !questHidden;

  const value = {
    unlock,
    currentMissionInfo,
    loading,
    legacy: unlock?.legacy ?? false,
    missions: missionsList,
    currentMission: currentMissionInfo?.key ?? null,
    thresholds: unlock?.thresholds ?? {},
    completedSessions: unlock?.completed_sessions ?? 0,
    isFeatureLocked,
    refreshUnlock,
    // 이슈 #25 9차 — 필수 퀘스트·홈 카드 숨김
    requiredDone,
    questHidden,
    questCardVisible,
    setQuestHidden,
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
