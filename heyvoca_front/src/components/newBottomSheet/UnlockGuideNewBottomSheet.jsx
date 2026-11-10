import React, { useEffect, useRef } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useOnboardingUnlock, questTitleOf } from '../../context/OnboardingUnlockContext';
import { useStats } from '../../context/StatsContext';
import { useUser } from '../../context/UserContext';
import { useQuestAction } from '../onboarding/useQuestAction';
import QuestSteps from '../onboarding/QuestSteps';
import { vibrate } from '../../utils/osFunction';
import { RewardClaimSheet } from '../rewards/RewardClaimSheet';

/*
  입문 퀘스트 바텀시트(이슈 #25 2차). 기능 잠금이 없어져 두 가지 얼굴만 남았다.

  ① 보상 — 미션이 새로 완료돼 보상 연출 대기열(pendingMissionRewards)이 남아 있으면 뜬다
     (OnboardingMissionRewardWatcher 가 학습 화면을 벗어난 뒤 연다).
     화면은 공용 보상 시트(rewards/RewardClaimSheet)다 — 업적 달성 보상과 같은 화면·같은 효과(8차 QA).
     「보상 받기」를 누르면 어느 화면에서든 우측 상단에 보석 칩이 떠 보석이 날아 들어가고 숫자가 오른다.
     보상 자체는 서버가 완료 시점에 이미 지급했다 — 여기는 연출만 한다.
  ② 체크리스트 — 그 밖. 7단계 타임라인 + 지금 퀘스트 하러 가기.
*/
export const UnlockGuideNewBottomSheet = () => {
  "use memo";

  const { closeNewBottomSheet } = useNewBottomSheetActions();
  const {
    missions,
    currentMission,
    pendingMissionRewards,
    consumePendingMissionRewards,
  } = useOnboardingUnlock();
  const { refreshStats } = useStats();
  const { fetchUserProfile, userProfile } = useUser();
  const { goToQuest } = useQuestAction();

  const hasCelebration = pendingMissionRewards.length > 0;

  // 스와이프/백드롭 클릭 등으로 시트가 닫혀도 대기열을 비워 재노출 스팸을 방지한다.
  // (보상 자체는 완료 시점에 이미 지급됐으므로 큐를 비워도 데이터 손실은 없음)
  const pendingLenRef = useRef(pendingMissionRewards.length);
  useEffect(() => {
    pendingLenRef.current = pendingMissionRewards.length;
  });
  useEffect(() => {
    return () => {
      if (pendingLenRef.current > 0) consumePendingMissionRewards();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingMissionRewards.length > 0) vibrate({ type: 'notificationSuccess' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedTitles = pendingMissionRewards.map((m) => questTitleOf(m)).filter(Boolean);
  const bookReward = pendingMissionRewards.filter((m) => m.reward_book).length;
  const totalGemReward = pendingMissionRewards.reduce((sum, m) => sum + (Number(m.reward_gem) || 0), 0);

  // ── ① 보상 화면 ──────────────────────────────────────────────
  if (hasCelebration) {
    return (
      <RewardClaimSheet
        title="퀘스트 완료"
        subtitle={completedTitles.join(', ')}
        items={[
          { kind: 'book', count: bookReward },
          { kind: 'gem', count: totalGemReward },
        ]}
        gem={{
          hint: userProfile?.gem_cnt,
          // 새 잔액은 프로필을 다시 읽어 얻는다(이미 지급된 값). 출발값은 새 잔액 - 받은 보석.
          gemTo: async () => {
            const r = await fetchUserProfile?.();
            return r?.userProfile?.gem_cnt;
          },
        }}
        onClaim={() => consumePendingMissionRewards()}
        // 홈 보석 칩 숫자는 농장 통계(farm overview)의 gem_cnt 를 먼저 본다 — 연출이 끝나면 다시 읽는다
        onClaimed={() => refreshStats?.()}
      />
    );
  }

  // ── ② 체크리스트 ─────────────────────────────────────────────
  const handleClose = () => {
    vibrate({ duration: 5 });
    closeNewBottomSheet();
  };

  return (
    <div className="flex flex-col max-h-[85vh] pt-[26px] pb-[20px] px-[20px]">
      <h3 className="shrink-0 text-center text-[18px] font-[700] text-layout-black dark:text-layout-white">
        입문 퀘스트
      </h3>

      <div className="mt-[14px] flex-1 min-h-0 overflow-y-auto">
        <QuestSteps
          missions={missions}
          currentKey={currentMission}
          onSelect={(key) => goToQuest(key, { fromSheet: true })}
        />
      </div>

      <div className="shrink-0 mt-[20px] flex gap-[8px]">
        <button
          type="button"
          onClick={handleClose}
          className="h-[52px] px-[22px] rounded-[12px] bg-layout-gray-100 dark:bg-[rgba(255,255,255,.08)] text-[16px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white"
        >
          닫기
        </button>
        {currentMission && (
          <button
            type="button"
            onClick={() => goToQuest(currentMission, { fromSheet: true })}
            className="flex-1 inline-flex items-center justify-center gap-[4px] h-[52px] rounded-[12px] bg-primary-main-600 text-[16px] font-[700] tracking-[-0.03em] text-layout-white dark:text-layout-black"
          >
            퀘스트 하러 가기
            <CaretRight size={16} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
};

export default UnlockGuideNewBottomSheet;
