import React, { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Lock } from '@phosphor-icons/react';
import { useNewBottomSheetActions, useNewBottomSheetContext } from '../../context/NewBottomSheetContext';
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

// 잠긴 하단탭/학습카드를 클릭했을 때, 또는 홈 배너를 눌렀을 때 뜨는 입문 퀘스트(미션 체크리스트) 바텀시트.
// 미션이 새로 완료돼 보상 연출 대기열(pendingMissionRewards)이 남아있으면, 이 시트는 자동으로
// "퀘스트 완료! → 보상 받기 → 순차 지급 연출" 화면으로 먼저 열리고, 연출이 끝나면 자연스럽게
// 아래의 일반 체크리스트 화면으로 전환된다.
// props:
//  - highlightKey: 사용자가 클릭한 기능의 unlock key (예: 'vocabook' | 'store' | 'dict' | 'listen' | 'custom') — 선택 사항
export const UnlockGuideNewBottomSheet = ({ highlightKey } = {}) => {
  "use memo";

  const { closeNewBottomSheet, openNewBottomSheet, popNewBottomSheet } = useNewBottomSheetActions();
  const { stack } = useNewBottomSheetContext();
  const { missions, currentMission, pendingMissionRewards, consumePendingMissionRewards } = useOnboardingUnlock();

  // 대기 중인 보상이 있으면 이 시트를 "보상 받기" 연출 모드로 먼저 보여준다.
  // 연출이 끝나면 pendingMissionRewards가 비워지며 아래 일반 체크리스트로 자연스럽게 전환된다.
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
    () => pendingMissionRewards.map((m) => m.title).filter(Boolean),
    [pendingMissionRewards]
  );
  const hasBookReward = pendingMissionRewards.some((m) => m.reward_book);
  const totalGemReward = pendingMissionRewards.reduce((sum, m) => sum + (m.reward_gem || 0), 0);

  // 리워드 등장 시 1회 성공 진동. (순차 연출 없이 처음부터 최종 상태로 한 번에 등장)
  useEffect(() => {
    if (pendingMissionRewards.length > 0) vibrate({ type: 'notificationSuccess' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 리워드 연출 '확인' — 리워드 시트만 닫고(아래로 슬라이드) 입문 퀘스트 목록 시트를 새로 연다
  // (아래→위 등장). pop으로 리워드 시트만 제거하므로 아래에 다른 시트가 있으면 그대로 보존된다.
  const handleRewardDone = () => {
    vibrate({ duration: 5 });
    const soloReward = stack.length <= 1;   // 리워드 시트가 스택의 유일한 시트인가
    consumePendingMissionRewards();          // 대기열 비움 → (재)오픈 시 목록으로 렌더
    popNewBottomSheet();                     // 리워드 시트만 닫음(아래 시트 보존)
    if (soloReward) {
      // 리워드가 유일했으면, 닫힘 후 목록 시트를 아래→위로 새로 등장시킨다.
      setTimeout(() => {
        openNewBottomSheet(
          UnlockGuideNewBottomSheet,
          {},
          { isBackdropClickClosable: true, isDragToCloseEnabled: true }
        );
      }, 320);
    }
  };

  // 체크리스트 '확인' — 이 시트만 닫는다.
  const handleConfirm = () => {
    vibrate({ duration: 5 });
    closeNewBottomSheet();
  };

  // ── 보상 화면 — 최종 상태로 한 번에 등장(순차 연출/글자 변경 없음) → 확인 ──────────
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

        {/* 받은 보상을 처음부터 최종 형태로 한 번에 표시(한 번 pop-in). 텍스트/크기 변경 없음. */}
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
                <div className="flex items-center justify-center w-[84px] h-[84px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark">
                  <img src={gemImg} alt="" className="w-[46px] h-[46px] object-contain" />
                </div>
                <span className="text-[13px] font-[700] text-layout-black dark:text-layout-white">보석 +{totalGemReward}개</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* 확인 버튼은 처음부터 고정 노출(늦게 삽입되지 않음). 연출 중 눌러도 목록으로 넘어간다. */}
        <button
          type="button"
          onClick={handleRewardDone}
          className="shrink-0 mt-[20px] h-[45px] rounded-[8px] bg-primary-main-600 text-[16px] font-[700] text-layout-white dark:text-layout-black"
        >
          확인
        </button>
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
