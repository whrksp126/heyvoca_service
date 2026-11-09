// src/components/onboarding/OnboardingMissionRewardWatcher.jsx
//
// 온보딩 미션이 완료되면(프론트 direct 신호 completeMission의 newly_completed, 또는
// plant_seed·make_book·buy_book·care_farm처럼 서버가 감지해 완료돼 refreshUnlock diff로 감지된 경우) 보상은
// 이미 백엔드가 지급을 마친 상태다. 이 워처는 그 사실을 "입문 퀘스트" 바텀시트의
// 보상 받기 연출로 순차 노출하는 타이밍만 담당한다.
//
// 학습 결과 화면(/take-test, /take-test/result)이나 집중 반복 학습 화면(/study) 위에
// 겹쳐 보이면 안 되므로, 해당 라우트에 있는 동안은 열지 않고 안전한 화면(홈 등)으로
// 돌아온 뒤에만 연다. make_book/buy_book/search_word는 애초에 해당 기능 화면(단어장,
// 상점, 사전)에서 완료되므로 그 자리에서 바로 열려도 무방하다.

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { useNewBottomSheetContext, useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { UnlockGuideNewBottomSheet } from '../newBottomSheet/UnlockGuideNewBottomSheet';

// 학습 진행/결과 화면과 겹치면 안 되는 라우트 prefix.
// '/take-test'는 '/take-test/result'(학습 결과 화면)도 함께 포함한다.
const REWARD_BLOCKED_PATH_PREFIXES = ['/take-test', '/study'];

const OnboardingMissionRewardWatcher = () => {
  const location = useLocation();
  const { pendingMissionRewards, refreshUnlock, legacy, currentMission } = useOnboardingUnlock();
  const { stack } = useNewBottomSheetContext();
  const { openNewBottomSheet } = useNewBottomSheetActions();

  // 학습·테스트 화면(/take-test·/study)을 벗어나는 순간 해금 상태를 다시 읽는다(이슈 #25).
  // plant_seed·care_farm 은 서버가 학습 저장 시점에 감지하고, focus_study 신호도 결과 화면에서
  // 나가므로, 여기서 diff 로 새 완료를 잡아 보상 연출 대기열에 올린다. 세션 종료 저장이
  // fire-and-forget 이라 조금 늦게 끝날 수 있어 짧은 지연 뒤 한 번 더 읽는다.
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = location.pathname;
    if (legacy || !currentMission) return undefined;
    const wasBlocked = REWARD_BLOCKED_PATH_PREFIXES.some((p) => prev.startsWith(p));
    const isBlocked = REWARD_BLOCKED_PATH_PREFIXES.some((p) => location.pathname.startsWith(p));
    if (!wasBlocked || isBlocked) return undefined;
    refreshUnlock();
    const t = setTimeout(() => refreshUnlock(), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // 같은 보상 대기열에 대해 자동 오픈은 한 번만 시도(스팸 방지).
  // 대기열이 비워지면(consumePendingMissionRewards) 다음 완료 건을 위해 자동 리셋된다.
  const openedRef = useRef(false);

  useEffect(() => {
    if (pendingMissionRewards.length === 0) {
      openedRef.current = false;
      return;
    }
    if (openedRef.current) return;
    // 다른 바텀시트가 이미 열려 있으면 방해하지 않고, 그 시트가 닫힐 때(stack 변화) 다시 판단한다.
    if (stack.length > 0) return;

    const isBlocked = REWARD_BLOCKED_PATH_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
    if (isBlocked) return;

    openedRef.current = true;
    openNewBottomSheet(
      UnlockGuideNewBottomSheet,
      {},
      { isBackdropClickClosable: true, isDragToCloseEnabled: true }
    );
  }, [pendingMissionRewards, location.pathname, stack.length, openNewBottomSheet]);

  return null;
};

export default OnboardingMissionRewardWatcher;
