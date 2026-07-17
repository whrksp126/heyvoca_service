// src/components/onboarding/OnboardingMissionRewardWatcher.jsx
//
// 온보딩 미션이 완료되면(프론트 direct 신호 completeMission의 newly_completed, 또는
// make_book/buy_book처럼 백엔드 훅으로 완료돼 refreshUnlock diff로 감지된 경우) 보상은
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
  const { pendingMissionRewards } = useOnboardingUnlock();
  const { stack } = useNewBottomSheetContext();
  const { openNewBottomSheet } = useNewBottomSheetActions();

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
