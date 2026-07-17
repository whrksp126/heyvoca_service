import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Lock, BookBookmark, Sparkle } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useOnboardingUnlock, FEATURE_LABELS } from '../../context/OnboardingUnlockContext';
import { vibrate } from '../../utils/osFunction';
import gemImg from '../../assets/images/gem.png';

// 현재 진행 미션의 "무엇을 해야 열리는지" 구체 안내 문구(미션 key별).
// 미션 title만으로는 행동이 애매한 경우(특히 make_book=단어장 만들고 '단어 추가')를 명확히 안내한다.
const MISSION_ACTION_HINTS = {
  ai_test: "AI 추천 테스트를 완료하면 '단어장'이 열려요",
  make_book: "단어장을 만든 뒤 단어를 추가하면 '상점'이 열려요",
  buy_book: "상점에서 단어장을 담으면 '사전'이 열려요",
  search_word: "사전에서 단어를 찾아보면 '집중 반복 학습'이 열려요",
  focus_study: "집중 반복 학습을 완료하면 '자유 설정 테스트'가 열려요",
};

// 보상 순차 연출에서 한 항목이 화면에 머무는 시간(ms)
const REVEAL_STEP_MS = 1100;

// 잠긴 하단탭/학습카드를 클릭했을 때, 또는 홈 배너를 눌렀을 때 뜨는 입문 퀘스트(미션 체크리스트) 바텀시트.
// 미션이 새로 완료돼 보상 연출 대기열(pendingMissionRewards)이 남아있으면, 이 시트는 자동으로
// "퀘스트 완료! → 보상 받기 → 순차 지급 연출" 화면으로 먼저 열리고, 연출이 끝나면 자연스럽게
// 아래의 일반 체크리스트 화면으로 전환된다.
// props:
//  - highlightKey: 사용자가 클릭한 기능의 unlock key (예: 'vocabook' | 'store' | 'dict' | 'listen' | 'custom') — 선택 사항
export const UnlockGuideNewBottomSheet = ({ highlightKey } = {}) => {
  "use memo";

  const { closeNewBottomSheet } = useNewBottomSheetActions();
  const { missions, currentMission, pendingMissionRewards, consumePendingMissionRewards } = useOnboardingUnlock();

  // 대기 중인 보상이 있으면 이 시트를 "보상 받기" 연출 모드로 먼저 보여준다.
  // 연출이 끝나면 pendingMissionRewards가 비워지며 아래 일반 체크리스트로 자연스럽게 전환된다.
  const hasCelebration = pendingMissionRewards.length > 0;

  const [stage, setStage] = useState('intro'); // 'intro' | 'revealing' | 'done'
  const [revealIndex, setRevealIndex] = useState(0);

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
    () => pendingMissionRewards.map((m) => m.title).filter(Boolean),
    [pendingMissionRewards]
  );
  const hasBookReward = pendingMissionRewards.some((m) => m.reward_book);
  const totalGemReward = pendingMissionRewards.reduce((sum, m) => sum + (m.reward_gem || 0), 0);

  // 지급 연출 순서: 빈 단어장 먼저, 그다음 보석
  const rewardItems = useMemo(() => {
    const items = [];
    if (hasBookReward) items.push({ type: 'book' });
    if (totalGemReward > 0) items.push({ type: 'gem', amount: totalGemReward });
    return items;
  }, [hasBookReward, totalGemReward]);

  const handleClaimRewards = () => {
    vibrate({ type: 'notificationSuccess' });
    setRevealIndex(0);
    setStage('revealing');
  };

  // 한 항목씩 순차로 노출 → 마지막 항목까지 노출되면 'done'으로 전환
  useEffect(() => {
    if (stage !== 'revealing') return;
    if (revealIndex >= rewardItems.length - 1) {
      const timer = setTimeout(() => setStage('done'), REVEAL_STEP_MS);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      vibrate({ duration: 5 });
      setRevealIndex((i) => i + 1);
    }, REVEAL_STEP_MS);
    return () => clearTimeout(timer);
  }, [stage, revealIndex, rewardItems.length]);

  // 연출 종료 → 대기열을 비워 일반 체크리스트로 자연스럽게 복귀
  useEffect(() => {
    if (stage === 'done') consumePendingMissionRewards();
  }, [stage, consumePendingMissionRewards]);

  const handleConfirm = () => {
    vibrate({ duration: 5 });
    closeNewBottomSheet();
  };

  // ── 보상 받기 연출 화면 ──────────────────────────────────────────────
  if (hasCelebration && stage !== 'done') {
    const currentItem = rewardItems[Math.min(revealIndex, Math.max(rewardItems.length - 1, 0))];

    return (
      <div className="flex flex-col max-h-[85vh] pt-[30px] pb-[20px] px-[20px]">
        <div className="flex flex-col items-center text-center shrink-0 mb-[24px] gap-[8px]">
          <div className="flex items-center justify-center w-[56px] h-[56px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark">
            <Sparkle size={28} weight="fill" className="text-primary-main-600" />
          </div>
          <h3 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
            퀘스트 완료!
          </h3>
          {completedTitles.length > 0 && (
            <p className="text-[13px] font-[500] text-layout-gray-400 dark:text-layout-gray-50">
              {completedTitles.join(', ')}
            </p>
          )}
        </div>

        {stage === 'intro' ? (
          <div className="flex flex-col gap-[10px] flex-1 min-h-0">
            {hasBookReward && (
              <div className="flex items-center gap-[12px] px-[14px] py-[12px] rounded-[10px] border-[1px] border-border dark:border-border-dark bg-layout-gray-50 dark:bg-layout-gray-dark">
                <div className="flex items-center justify-center w-[36px] h-[36px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark shrink-0">
                  <BookBookmark size={18} weight="fill" className="text-primary-main-600" />
                </div>
                <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                  빈 단어장
                </span>
              </div>
            )}
            {totalGemReward > 0 && (
              <div className="flex items-center gap-[12px] px-[14px] py-[12px] rounded-[10px] border-[1px] border-border dark:border-border-dark bg-layout-gray-50 dark:bg-layout-gray-dark">
                <div className="flex items-center justify-center w-[36px] h-[36px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark shrink-0">
                  <img src={gemImg} alt="" className="w-[20px] h-[20px] object-contain" />
                </div>
                <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                  보석 +{totalGemReward}개
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 min-h-[220px]">
            <AnimatePresence mode="wait">
              {currentItem && (
                <motion.div
                  key={currentItem.type}
                  initial={{ opacity: 0, y: 16, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16, scale: 0.9 }}
                  transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                  className="flex flex-col items-center gap-[14px]"
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: [0, 1.15, 1], rotate: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="flex items-center justify-center w-[84px] h-[84px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark"
                  >
                    {currentItem.type === 'book' ? (
                      <BookBookmark size={40} weight="fill" className="text-primary-main-600" />
                    ) : (
                      <img src={gemImg} alt="" className="w-[46px] h-[46px] object-contain" />
                    )}
                  </motion.div>
                  <p className="text-[16px] font-[800] text-layout-black dark:text-layout-white">
                    {currentItem.type === 'book' ? '빈 단어장 지급!' : `보석 +${currentItem.amount}개 지급!`}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {rewardItems.length > 1 && (
              <div className="flex items-center gap-[6px] mt-[20px]">
                {rewardItems.map((item, idx) => (
                  <span
                    key={item.type}
                    className={`w-[6px] h-[6px] rounded-full ${idx <= revealIndex ? 'bg-primary-main-600' : 'bg-layout-gray-200 dark:bg-layout-gray-400'
                      }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {stage === 'intro' && (
          <button
            type="button"
            onClick={handleClaimRewards}
            className="shrink-0 mt-[24px] h-[45px] rounded-[8px] bg-primary-main-600 text-[16px] font-[700] text-layout-white dark:text-layout-black"
          >
            보상 받기
          </button>
        )}
      </div>
    );
  }

  // ── 일반 체크리스트 화면 ──────────────────────────────────────────────
  return (
    <div className="flex flex-col max-h-[85vh] pt-[30px] pb-[20px] px-[20px]">
      <div className="flex flex-col items-center text-center shrink-0 mb-[24px]">
        <h3 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
          입문 퀘스트
        </h3>
      </div>

      <ul className="flex flex-col gap-[10px] flex-1 min-h-0 overflow-y-auto">
        {missions.map((mission) => {
          const isCurrent = mission.key === currentMission;
          const isHighlighted = mission.unlocks === highlightKey;
          const featureLabel = FEATURE_LABELS[mission.unlocks] || mission.unlocks;

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
                ) : (
                  <Lock size={13} weight="bold" className="text-layout-white dark:text-layout-black" />
                )}
              </div>

              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                  {mission.order}. {mission.title}
                </span>
                <span className="text-[12px] font-[500] text-layout-gray-300">
                  {mission.done
                    ? (mission.unlocks ? `→ ${featureLabel}이 열렸어요` : '완료했어요')
                    : isCurrent
                      ? (MISSION_ACTION_HINTS[mission.key] || `완료하면 '${featureLabel}' 기능이 열려요`)
                      : '이전 미션을 먼저 완료해주세요'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={handleConfirm}
        className="shrink-0 mt-[24px] h-[45px] rounded-[8px] bg-primary-main-600 text-[16px] font-[700] text-layout-white dark:text-layout-black"
      >
        확인
      </button>
    </div>
  );
};

export default UnlockGuideNewBottomSheet;
