import React, { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { CaretRight } from '@phosphor-icons/react';
import { useLocation } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetContext } from '../../context/NewFullSheetContext';
import { useOnboardingUnlock, questTitleOf } from '../../context/OnboardingUnlockContext';
import { useGemAnimation } from '../../context/GemAnimationContext';
import { useStats } from '../../context/StatsContext';
import { useUser } from '../../context/UserContext';
import { useQuestAction } from '../onboarding/useQuestAction';
import QuestSteps from '../onboarding/QuestSteps';
import { vibrate } from '../../utils/osFunction';
import gemImg from '../../assets/images/farm/icon-gem.png';
import { EMPTY_BOOK_ART as emptyBookImg } from '../farm/itemArt';

// 홈 보석 칩(components/home/Main.jsx)
const GEM_TARGET_SELECTOR = '#home-gem-chip';

/*
  입문 퀘스트 바텀시트(이슈 #25 2차). 기능 잠금이 없어져 두 가지 얼굴만 남았다.

  ① 보상 — 미션이 새로 완료돼 보상 연출 대기열(pendingMissionRewards)이 남아 있으면 뜬다
     (OnboardingMissionRewardWatcher 가 학습 화면을 벗어난 뒤 연다).
     '보석 N개 받기'를 누르면 보석 카운터가 **보이는 홈**에서만 칩으로 날아간다.
     다른 화면(다른 탭·풀시트 위)에서는 날아가는 효과 없이 보석이 한 번 튀고 닫힌다.
     보상 자체는 서버가 완료 시점에 이미 지급했다 — 여기는 연출만 한다.
  ② 체크리스트 — 그 밖. 7단계 타임라인 + 지금 퀘스트 하러 가기.
*/
export const UnlockGuideNewBottomSheet = () => {
  "use memo";

  const location = useLocation();
  const { closeNewBottomSheet, popNewBottomSheet } = useNewBottomSheetActions();
  const { stack: fullSheetStack } = useNewFullSheetContext();
  const {
    missions,
    currentMission,
    pendingMissionRewards,
    consumePendingMissionRewards,
  } = useOnboardingUnlock();
  const { triggerFlyingAnimation } = useGemAnimation();
  const { refreshStats } = useStats();
  const { fetchUserProfile } = useUser();
  const { goToQuest } = useQuestAction();
  const gemRef = useRef(null);
  const gemControls = useAnimationControls();
  const [claiming, setClaiming] = useState(false);

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
  const hasBookReward = pendingMissionRewards.some((m) => m.reward_book);
  const totalGemReward = pendingMissionRewards.reduce((sum, m) => sum + (Number(m.reward_gem) || 0), 0);

  // 보석 칩이 실제로 보이는가 — 홈 탭이고, 그 위를 풀시트가 덮고 있지 않을 때만.
  const isHomeChipVisible = () => {
    if (location.pathname !== '/home') return false;
    if (fullSheetStack.length > 0) return false;
    const el = document.querySelector(GEM_TARGET_SELECTOR);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0;
  };

  const syncGems = () => {
    refreshStats?.();
    fetchUserProfile?.();
  };

  // ① '보석 N개 받기'
  const handleRewardDone = async () => {
    if (claiming) return;
    vibrate({ duration: 5 });
    if (totalGemReward > 0 && gemRef.current && isHomeChipVisible()) {
      triggerFlyingAnimation({
        imageUrl: gemImg,
        quantity: Math.min(8, Math.max(3, Math.round(totalGemReward / 3))),
        startPoint: { type: 'element', value: gemRef.current },
        endPoint: { type: 'element', value: GEM_TARGET_SELECTOR },
        animationPreset: 'gem-burst',
        // 홈 보석 칩 숫자는 농장 통계(farm overview)의 gem_cnt 를 먼저 본다 — 도착에 맞춰 다시 읽는다
        onComplete: syncGems,
      });
      consumePendingMissionRewards();
      popNewBottomSheet();
      return;
    }
    // 홈이 아니면 날리지 않는다 — 시트 안에서 보석이 한 번 튀고 닫힌다.
    setClaiming(true);
    syncGems();
    if (totalGemReward > 0) {
      await gemControls.start({ scale: [1, 1.18, 0.9, 1], transition: { duration: 0.35 } });
    }
    consumePendingMissionRewards();
    popNewBottomSheet();
  };

  // ── ① 보상 화면 ──────────────────────────────────────────────
  if (hasCelebration) {
    return (
      <div className="flex flex-col max-h-[85vh] pt-[30px] pb-[20px] px-[20px]">
        <div className="flex flex-col items-center text-center shrink-0 gap-[6px]">
          <h3 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
            퀘스트 완료
          </h3>
          {completedTitles.length > 0 && (
            <p className="text-[14px] font-[600] text-layout-gray-400 dark:text-layout-gray-50">
              {completedTitles.join(', ')}
            </p>
          )}
        </div>

        <div className="flex items-center justify-center py-[24px]">
          <motion.div
            className="flex items-center justify-center gap-[24px]"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          >
            {hasBookReward && (
              <img src={emptyBookImg} alt="" className="w-[72px] h-[72px] object-contain" />
            )}
            {totalGemReward > 0 && (
              <motion.div
                ref={gemRef}
                animate={gemControls}
                className="flex items-center justify-center w-[84px] h-[84px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark"
              >
                <img src={gemImg} alt="" className="w-[46px] h-[46px] object-contain" />
              </motion.div>
            )}
          </motion.div>
        </div>

        <button
          type="button"
          onClick={handleRewardDone}
          disabled={claiming}
          className="shrink-0 h-[52px] rounded-[12px] bg-primary-main-600 text-[16px] font-[700] tracking-[-0.03em] text-layout-white dark:text-layout-black"
        >
          {totalGemReward > 0 ? `보석 ${totalGemReward}개 받기` : '확인'}
        </button>
      </div>
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
        첫 퀘스트
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
