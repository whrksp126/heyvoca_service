import React from 'react';
import { CheckCircle, Lock } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useOnboardingUnlock, FEATURE_LABELS } from '../../context/OnboardingUnlockContext';
import { vibrate } from '../../utils/osFunction';

// 현재 진행 미션의 "무엇을 해야 열리는지" 구체 안내 문구(미션 key별).
// 미션 title만으로는 행동이 애매한 경우(특히 make_book=단어장 만들고 '단어 추가')를 명확히 안내한다.
const MISSION_ACTION_HINTS = {
  ai_test: "AI 추천 테스트를 완료하면 '단어장'이 열려요",
  make_book: "단어장을 만든 뒤 단어를 추가하면 '상점'이 열려요",
  buy_book: "상점에서 단어장을 담으면 '사전'이 열려요",
  search_word: "사전에서 단어를 찾아보면 '집중 반복 학습'이 열려요",
  focus_study: "집중 반복 학습을 완료하면 '자유 설정 테스트'가 열려요",
};

// 잠긴 하단탭/학습카드를 클릭했을 때, 또는 홈 배너를 눌렀을 때 뜨는 입문 퀘스트(미션 체크리스트) 바텀시트.
// props:
//  - highlightKey: 사용자가 클릭한 기능의 unlock key (예: 'vocabook' | 'store' | 'dict' | 'listen' | 'custom') — 선택 사항
export const UnlockGuideNewBottomSheet = ({ highlightKey } = {}) => {
  "use memo";

  const { closeNewBottomSheet } = useNewBottomSheetActions();
  const { missions, currentMission } = useOnboardingUnlock();

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
                    ? `→ ${featureLabel}이 열렸어요`
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
        onClick={() => { vibrate({ duration: 5 }); closeNewBottomSheet(); }}
        className="shrink-0 mt-[24px] h-[45px] rounded-[8px] bg-primary-main-600 text-[16px] font-[700] text-layout-white dark:text-layout-black"
      >
        확인
      </button>
    </div>
  );
};

export default UnlockGuideNewBottomSheet;
