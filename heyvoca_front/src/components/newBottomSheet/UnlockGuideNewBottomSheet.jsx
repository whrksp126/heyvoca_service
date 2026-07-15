import React from 'react';
import { CheckCircle, Lock } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

// 온보딩 점진 해금 5단계 정의 — 백엔드 UNLOCK_THRESHOLDS(heyvoca_back/app/routes/onboarding.py)와 동일 순서/키.
const STAGES = [
  { key: 'vocabook', order: 1, label: '단어장' },
  { key: 'store', order: 2, label: '상점' },
  { key: 'dict', order: 3, label: '사전' },
  { key: 'listen', order: 4, label: '집중 반복 학습' },
  { key: 'custom', order: 5, label: '자유 설정 테스트' },
];

// 잠긴 하단탭/학습카드를 클릭했을 때 뜨는 단계별 해금 안내 바텀시트.
// props:
//  - unlock: getUnlockStatusApi() 응답 data ({ legacy, completed_sessions, thresholds, unlocked })
//  - highlightKey: 사용자가 클릭한 기능의 lockKey (예: 'vocabook' | 'store' | 'dict' | 'listen' | 'custom')
export const UnlockGuideNewBottomSheet = ({ unlock, highlightKey }) => {
  "use memo";

  const { popNewBottomSheet } = useNewBottomSheetActions();

  const legacy = unlock?.legacy ?? false;
  const completedSessions = unlock?.completed_sessions ?? 0;
  const thresholds = unlock?.thresholds ?? { vocabook: 1, store: 2, dict: 3, listen: 4, custom: 5 };
  const unlockedMap = unlock?.unlocked ?? {};

  const isUnlocked = (key) => {
    if (legacy) return true;
    if (typeof unlockedMap[key] === 'boolean') return unlockedMap[key];
    return completedSessions >= (thresholds[key] ?? 0);
  };

  return (
    <div className="flex flex-col gap-[24px] pt-[30px] pb-[20px] px-[20px]">
      <div className="flex flex-col gap-[4px] items-center text-center">
        <h3 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
          학습을 이어가면 기능이 열려요
        </h3>
        <p className="text-[13px] font-[500] text-layout-gray-300">
          현재 학습 {completedSessions}회 완료
        </p>
      </div>

      <ul className="flex flex-col gap-[10px]">
        {STAGES.map((stage) => {
          const unlocked = isUnlocked(stage.key);
          const isHighlighted = stage.key === highlightKey;
          const threshold = thresholds[stage.key] ?? stage.order;
          const remaining = Math.max(0, threshold - completedSessions);

          return (
            <li
              key={stage.key}
              className={`
                flex items-center gap-[12px]
                px-[14px] py-[12px]
                rounded-[10px]
                border-[1px]
                ${unlocked
                  ? 'border-status-success-300 bg-status-success-50 dark:border-status-success-dark dark:bg-status-success-dark'
                  : isHighlighted
                    ? 'border-primary-main-600 bg-primary-main-100 dark:bg-primary-main-dark'
                    : 'border-border dark:border-border-dark bg-layout-gray-50 dark:bg-layout-gray-dark'
                }
              `}
            >
              <div
                className={`
                  flex items-center justify-center w-[26px] h-[26px] rounded-full shrink-0
                  ${unlocked ? 'bg-status-success-600' : 'bg-layout-gray-300 dark:bg-layout-gray-400'}
                `}
              >
                {unlocked ? (
                  <CheckCircle size={18} weight="fill" className="text-layout-white" />
                ) : (
                  <Lock size={13} weight="bold" className="text-layout-white dark:text-layout-black" />
                )}
              </div>

              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
                  {stage.order}회 · {stage.label}
                </span>
                <span className="text-[12px] font-[500] text-layout-gray-300">
                  {unlocked ? '해제 완료' : `학습 ${threshold}회 필요 · ${remaining}회 남음`}
                </span>
              </div>

              {isHighlighted && !unlocked && (
                <span className="text-[11px] font-[700] text-primary-main-600 shrink-0">
                  지금 선택
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => { vibrate({ duration: 5 }); popNewBottomSheet(); }}
        className="h-[45px] rounded-[8px] bg-primary-main-600 text-[16px] font-[700] text-layout-white dark:text-layout-black"
      >
        확인
      </button>
    </div>
  );
};

export default UnlockGuideNewBottomSheet;
