import React, { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Lock, CaretRight } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import {
  useOnboardingUnlock,
  QUEST_META,
  questTitleOf,
  featureNameOf,
  withObjectJosa,
  withSubjectJosa,
} from '../../context/OnboardingUnlockContext';
import { useGemAnimation } from '../../context/GemAnimationContext';
import { useStats } from '../../context/StatsContext';
import { useQuestAction } from '../onboarding/useQuestAction';
import QuestSteps from '../onboarding/QuestSteps';
import { vibrate } from '../../utils/osFunction';
import gemImg from '../../assets/images/farm/icon-gem.png';
import { EMPTY_BOOK_ART as emptyBookImg } from '../farm/itemArt';

// 홈 보석 칩(components/home/Main.jsx). 없으면(다른 화면) 화면 우측 상단으로 날린다.
const GEM_TARGET_SELECTOR = '#home-gem-chip';

/*
  입문 퀘스트 바텀시트(이슈 #25 v2 체인). 세 가지 얼굴이 있다.

  ① 보상 — 미션이 새로 완료돼 보상 연출 대기열(pendingMissionRewards)이 남아 있으면 먼저 뜬다
     (OnboardingMissionRewardWatcher 가 학습 화면을 벗어난 뒤 연다). '받기'를 누르면 보석이
     홈 우측 상단 보석 칩으로 날아가고(GemAnimation) 시트가 닫힌다. 보상 자체는 서버가 완료
     시점에 이미 지급했다 — 여기는 연출만 한다.
  ② 잠금 안내 — 잠긴 탭·집중 반복·자유 설정을 눌렀을 때(highlightKey 가 잠긴 기능).
     "'<선행 퀘스트>'를 완료하면 열려요" + 퀘스트 하러 가기.
  ③ 체크리스트 — 그 밖(보상 확인 뒤 등). 6단계 목록 + 지금 퀘스트 하러 가기.

  props:
   - highlightKey: 사용자가 누른 기능의 unlock key ('vocabook' | 'dict' | 'store' | 'listen' | 'custom') — 선택
*/
export const UnlockGuideNewBottomSheet = ({ highlightKey } = {}) => {
  "use memo";

  const { closeNewBottomSheet, popNewBottomSheet } = useNewBottomSheetActions();
  const {
    missions,
    currentMission,
    currentMissionInfo,
    missionForFeature,
    isFeatureLocked,
    pendingMissionRewards,
    consumePendingMissionRewards,
  } = useOnboardingUnlock();
  const { triggerFlyingAnimation } = useGemAnimation();
  const { refreshStats } = useStats();
  const { goToQuest } = useQuestAction();
  const gemRef = useRef(null);

  const hasCelebration = pendingMissionRewards.length > 0;

  // 스와이프/백드롭 클릭 등으로 연출 도중 시트가 닫혀도 대기열을 비워 재노출 스팸을 방지한다.
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

  const completedTitles = useMemo(
    () => pendingMissionRewards.map((m) => questTitleOf(m)).filter(Boolean),
    [pendingMissionRewards]
  );
  const hasBookReward = pendingMissionRewards.some((m) => m.reward_book);
  const totalGemReward = pendingMissionRewards.reduce((sum, m) => sum + (Number(m.reward_gem) || 0), 0);
  // 이번 보상으로 새로 열린 기능(들)
  const newlyUnlocked = pendingMissionRewards.map((m) => m.unlocks).filter(Boolean);

  useEffect(() => {
    if (pendingMissionRewards.length > 0) vibrate({ type: 'notificationSuccess' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ① 보상 '받기' — 보석이 보석 칩으로 날아가고, 리워드 시트만 닫는다(아래 시트 보존).
  const handleRewardDone = () => {
    vibrate({ duration: 5 });
    if (totalGemReward > 0 && gemRef.current) {
      const hasChip = !!document.querySelector(GEM_TARGET_SELECTOR);
      triggerFlyingAnimation({
        imageUrl: gemImg,
        quantity: Math.min(8, Math.max(3, Math.round(totalGemReward / 3))),
        startPoint: { type: 'element', value: gemRef.current },
        endPoint: hasChip
          ? { type: 'element', value: GEM_TARGET_SELECTOR }
          : { type: 'position', value: 'right-top' },
        animationPreset: 'gem-burst',
        // 홈 보석 칩 숫자는 농장 통계(farm overview)의 gem_cnt 를 먼저 본다 — 도착에 맞춰 다시 읽는다
        onComplete: () => refreshStats?.(),
      });
    } else {
      refreshStats?.();
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
            퀘스트 완료!
          </h3>
          {completedTitles.length > 0 && (
            <p className="text-[13px] font-[500] text-layout-gray-400 dark:text-layout-gray-50">
              {completedTitles.join(', ')}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center justify-center h-[172px] py-[16px]">
          <motion.div
            className="flex items-end justify-center gap-[24px]"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          >
            {hasBookReward && (
              <div className="flex flex-col items-center gap-[10px]">
                <img src={emptyBookImg} alt="" className="w-[72px] h-[72px] object-contain" />
                <span className="text-[13px] font-[700] text-layout-black dark:text-layout-white">빈 단어장 +1개</span>
              </div>
            )}
            {totalGemReward > 0 && (
              <div className="flex flex-col items-center gap-[10px]">
                <div
                  ref={gemRef}
                  className="flex items-center justify-center w-[84px] h-[84px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark"
                >
                  <img src={gemImg} alt="" className="w-[46px] h-[46px] object-contain" />
                </div>
                <span className="text-[13px] font-[700] text-layout-black dark:text-layout-white">보석 +{totalGemReward}개</span>
              </div>
            )}
          </motion.div>
        </div>

        {newlyUnlocked.length > 0 && (
          <p className="shrink-0 text-center text-[14px] font-[700] text-layout-black dark:text-layout-white">
            {withSubjectJosa(newlyUnlocked.map(featureNameOf).join(', '))} 열렸어요
          </p>
        )}

        <button
          type="button"
          onClick={handleRewardDone}
          className="shrink-0 mt-[20px] h-[52px] rounded-[12px] bg-primary-main-600 text-[16px] font-[700] tracking-[-0.03em] text-layout-white dark:text-layout-black"
        >
          {totalGemReward > 0 ? '보석 받기' : '확인'}
        </button>
      </div>
    );
  }

  const handleGo = () => {
    if (!currentMission) { closeNewBottomSheet(); return; }
    goToQuest(currentMission, { fromSheet: true });
  };
  const handleClose = () => {
    vibrate({ duration: 5 });
    closeNewBottomSheet();
  };

  const footer = (
    <div className="shrink-0 mt-[24px] flex gap-[8px]">
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
          onClick={handleGo}
          className="flex-1 inline-flex items-center justify-center gap-[4px] h-[52px] rounded-[12px] bg-primary-main-600 text-[16px] font-[700] tracking-[-0.03em] text-layout-white dark:text-layout-black"
        >
          퀘스트 하러 가기
          <CaretRight size={16} weight="bold" />
        </button>
      )}
    </div>
  );

  // ── ② 잠금 안내 ─────────────────────────────────────────────
  const lockedNow = highlightKey && isFeatureLocked(highlightKey);
  if (lockedNow) {
    const prereq = missionForFeature(highlightKey);
    const prereqTitle = prereq ? questTitleOf(prereq) : '';
    const currentTitle = currentMissionInfo ? questTitleOf(currentMissionInfo) : '';
    const prereqIsCurrent = prereq && prereq.key === currentMission;

    return (
      <div className="flex flex-col max-h-[85vh] pt-[30px] pb-[20px] px-[20px]">
        <div className="flex flex-col items-center text-center shrink-0 gap-[8px]">
          <span className="flex items-center justify-center w-[56px] h-[56px] rounded-full bg-layout-gray-100 dark:bg-[rgba(255,255,255,.08)]">
            <Lock size={26} weight="bold" className="text-layout-gray-400 dark:text-layout-gray-300" />
          </span>
          <h3 className="mt-[4px] text-[18px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
            {withSubjectJosa(featureNameOf(highlightKey))} 아직 잠겨 있어요
          </h3>
          <p className="text-[14px] font-[600] leading-[1.5] text-layout-gray-400 dark:text-layout-gray-300">
            {prereqTitle
              ? <>'{prereqTitle}'{withObjectJosa(prereqTitle).slice(prereqTitle.length)} 완료하면 열려요</>
              : '이전 퀘스트를 완료하면 열려요'}
            {!prereqIsCurrent && currentTitle && (
              <><br />지금은 '{currentTitle}'부터 해 주세요</>
            )}
          </p>
        </div>

        <div className="mt-[22px] px-[4px]">
          <QuestSteps missions={missions} currentKey={currentMission} highlightKey={highlightKey} />
        </div>

        {footer}
      </div>
    );
  }

  // ── ③ 체크리스트 ─────────────────────────────────────────────
  return (
    <div className="flex flex-col max-h-[85vh] pt-[30px] pb-[20px] px-[20px]">
      <div className="flex flex-col items-center text-center shrink-0 mb-[24px]">
        <h3 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
          첫 퀘스트
        </h3>
      </div>

      <ul className="flex flex-col gap-[10px] flex-1 min-h-0 overflow-y-auto">
        {missions.map((mission) => {
          const isCurrent = mission.key === currentMission;
          const isHighlighted = highlightKey && mission.unlocks === highlightKey;
          const featureName = mission.unlocks ? featureNameOf(mission.unlocks) : '';
          const title = questTitleOf(mission);

          let sub;
          if (mission.done) {
            sub = mission.unlocks ? `${withSubjectJosa(featureName)} 열렸어요` : '완료했어요';
          } else if (isCurrent) {
            sub = mission.unlocks
              ? `${QUEST_META[mission.key]?.desc ? `${QUEST_META[mission.key].desc} · ` : ''}완료하면 ${withSubjectJosa(featureName)} 열려요`
              : (QUEST_META[mission.key]?.desc || '마지막 퀘스트예요');
          } else {
            sub = '이전 퀘스트를 먼저 완료해 주세요';
          }

          return (
            <li
              key={mission.key}
              className={`
                flex items-center gap-[12px]
                px-[14px] py-[12px]
                rounded-[10px]
                border-[1px]
                ${mission.done
                  ? 'border-status-success-300 bg-status-success-50 dark:border-status-success-dark dark:bg-status-success-dark'
                  : isCurrent
                    ? 'border-primary-main-600 bg-primary-main-100 dark:bg-primary-main-dark'
                    : `border-border dark:border-border-dark bg-layout-gray-50 dark:bg-layout-gray-dark ${isHighlighted ? '' : 'opacity-60'}`
                }
              `}
            >
              <div
                className={`
                  flex items-center justify-center w-[26px] h-[26px] rounded-full shrink-0
                  ${mission.done
                    ? 'bg-status-success-600'
                    : isCurrent
                      ? 'bg-primary-main-600'
                      : 'bg-layout-gray-300 dark:bg-layout-gray-400'
                  }
                `}
              >
                {mission.done ? (
                  <CheckCircle size={18} weight="fill" className="text-layout-white" />
                ) : isCurrent ? (
                  <span className="text-[12px] font-[800] text-layout-white dark:text-layout-black">{mission.order}</span>
                ) : (
                  <Lock size={13} weight="bold" className="text-layout-white dark:text-layout-black" />
                )}
              </div>

              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                  {mission.order}. {title}
                </span>
                <span className="text-[12px] font-[500] text-layout-gray-300">{sub}</span>
              </div>

              {Number(mission.reward_gem) > 0 && !mission.done && (
                <span className="shrink-0 inline-flex items-center gap-[3px] text-[12px] font-[800] text-layout-gray-400 dark:text-layout-gray-300">
                  <img src={gemImg} alt="" className="w-[14px] h-[14px] object-contain" />
                  +{mission.reward_gem}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {footer}
    </div>
  );
};

export default UnlockGuideNewBottomSheet;
