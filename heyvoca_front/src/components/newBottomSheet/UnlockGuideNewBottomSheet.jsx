import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Lock } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useOnboardingUnlock, FEATURE_LABELS } from '../../context/OnboardingUnlockContext';
import { vibrate } from '../../utils/osFunction';
import gemImg from '../../assets/images/gem.png';
import emptyBookImg from '../../assets/images/voca_book_1.png';

// 현재 진행 미션의 "무엇을 해야 열리는지" 구체 안내 문구(미션 key별).
// 미션 title만으로는 행동이 애매한 경우(특히 make_book=단어장 만들고 '단어 추가')를 명확히 안내한다.
const MISSION_ACTION_HINTS = {
  ai_test: "AI 추천 테스트를 완료하면 온보딩에서 고른 단어장이 열려요",
  make_book: "단어장을 만든 뒤 단어를 추가하면 '상점'이 열려요",
  buy_book: "상점에서 단어장을 담으면 '사전'이 열려요",
  search_word: "사전에서 단어를 찾아보면 '집중 반복 학습'이 열려요",
  focus_study: "집중 반복 학습을 완료하면 '자유 설정 테스트'가 열려요",
  // 마지막 미션(free_test)은 unlocks=None(더 열릴 기능 없음) — 종료 안내 문구.
  free_test: "자유 설정 테스트를 완료하면 입문 퀘스트가 모두 끝나요",
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

  // 연출 단계: 'revealing'(순차 지급 연출) | 'done'(연출 종료 → 확인 버튼).
  // 예전 'intro'(보상 리스트 나열 + '보상 받기' 탭) 단계는 제거하고, 곧바로 지급 연출을 시작한다.
  const [stage, setStage] = useState(pendingMissionRewards.length > 0 ? 'revealing' : 'done');
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

  // 연출 시작 시 1회 성공 진동 — 리스트/‘보상 받기’ 탭 없이 곧바로 지급 연출을 시작한다.
  useEffect(() => {
    if (pendingMissionRewards.length > 0) vibrate({ type: 'notificationSuccess' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleConfirm = () => {
    vibrate({ duration: 5 });
    // 연출 대기열이 남아있으면 비운 뒤 닫는다(확인으로 마무리).
    if (pendingMissionRewards.length > 0) consumePendingMissionRewards();
    closeNewBottomSheet();
  };

  // ── 보상 지급 연출 화면 (리스트 없이 곧바로 순차 지급 → 확인) ──────────────
  if (hasCelebration) {
    const isDone = stage === 'done';
    const currentItem = rewardItems[Math.min(revealIndex, Math.max(rewardItems.length - 1, 0))];

    return (
      <div className="flex flex-col max-h-[85vh] pt-[30px] pb-[20px] px-[20px]">
        <div className="flex flex-col items-center text-center shrink-0 mb-[24px] gap-[8px]">
          <h3 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
            퀘스트 완료!
          </h3>
          {completedTitles.length > 0 && (
            <p className="text-[13px] font-[500] text-layout-gray-400 dark:text-layout-gray-50">
              {completedTitles.join(', ')}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center justify-center flex-1 min-h-[220px]">
          {isDone ? (
            // 연출 종료 → 받은 보상 요약(정적) + 확인 버튼
            <div className="flex flex-col items-center gap-[18px]">
              <div className="flex items-end justify-center gap-[24px]">
                {hasBookReward && (
                  <div className="flex flex-col items-center gap-[8px]">
                    <img src={emptyBookImg} alt="" className="w-[64px] h-[64px] object-contain" />
                    <span className="text-[13px] font-[700] text-layout-black dark:text-layout-white">빈 단어장 +1개</span>
                  </div>
                )}
                {totalGemReward > 0 && (
                  <div className="flex flex-col items-center gap-[8px]">
                    <div className="flex items-center justify-center w-[64px] h-[64px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark">
                      <img src={gemImg} alt="" className="w-[36px] h-[36px] object-contain" />
                    </div>
                    <span className="text-[13px] font-[700] text-layout-black dark:text-layout-white">보석 +{totalGemReward}개</span>
                  </div>
                )}
              </div>
              <p className="text-[14px] font-[600] text-layout-gray-400 dark:text-layout-gray-50">보상을 받았어요!</p>
            </div>
          ) : (
            <>
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
                      className={`flex items-center justify-center w-[84px] h-[84px] rounded-full ${currentItem.type === 'gem' ? 'bg-primary-main-100 dark:bg-primary-main-dark' : ''}`}
                    >
                      {currentItem.type === 'book' ? (
                        <img src={emptyBookImg} alt="" className="w-[72px] h-[72px] object-contain" />
                      ) : (
                        <img src={gemImg} alt="" className="w-[46px] h-[46px] object-contain" />
                      )}
                    </motion.div>
                    <p className="text-[16px] font-[800] text-layout-black dark:text-layout-white">
                      {currentItem.type === 'book' ? '빈 단어장 +1개 지급!' : `보석 +${currentItem.amount}개 지급!`}
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
            </>
          )}
        </div>

        {isDone && (
          <button
            type="button"
            onClick={handleConfirm}
            className="shrink-0 mt-[24px] h-[45px] rounded-[8px] bg-primary-main-600 text-[16px] font-[700] text-layout-white dark:text-layout-black"
          >
            확인
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
                      ? (MISSION_ACTION_HINTS[mission.key]
                          || (mission.unlocks ? `완료하면 '${featureLabel}' 기능이 열려요` : '완료하면 입문 퀘스트가 끝나요'))
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
