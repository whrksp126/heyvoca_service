import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Lock, CaretRight } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useOnboardingUnlock, FEATURE_LABELS } from '../../context/OnboardingUnlockContext';
import { vibrate } from '../../utils/osFunction';

// 미션 key → CTA 동작 매핑. make_book/buy_book은 백엔드 훅 전용(사용자가 실제 행동을 완료해야 자동 처리)이라
// 이동만 시켜주고 완료 처리는 하지 않는다.
const MISSION_CTA = {
  ai_test: { label: '학습하러 가기', type: 'study' },
  make_book: { label: '단어장 만들러 가기', type: 'navigate', path: '/vocabulary-sheets' },
  buy_book: { label: '서점 가기', type: 'navigate', path: '/book-store' },
  search_word: { label: '사전에서 찾아보기', type: 'navigate', path: '/dictionary' },
  focus_study: { label: '학습하러 가기', type: 'study' },
};

// 잠긴 하단탭/학습카드를 클릭했을 때, 또는 홈 배너를 눌렀을 때 뜨는 단계별 미션 체크리스트 바텀시트.
// props:
//  - highlightKey: 사용자가 클릭한 기능의 unlock key (예: 'vocabook' | 'store' | 'dict' | 'listen' | 'custom') — 선택 사항
export const UnlockGuideNewBottomSheet = ({ highlightKey } = {}) => {
  "use memo";

  const navigate = useNavigate();
  const { closeNewBottomSheet } = useNewBottomSheetActions();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { missions, currentMission } = useOnboardingUnlock();

  const handleCta = (missionKey) => {
    vibrate({ duration: 5 });
    const cta = MISSION_CTA[missionKey];
    if (!cta) return;

    closeNewBottomSheet();

    if (cta.type === 'study') {
      // 학습하기 풀시트를 새로 열기 위해 닫힘 트랜지션 이후 여는 편이 자연스럽다.
      // StudyNewFullSheet를 동적 import로 불러와 순환 참조(StudyNewFullSheet → 이 컴포넌트)를 피한다.
      setTimeout(() => {
        import('../newfullsheet/StudyNewFullSheet').then(({ default: StudyNewFullSheet }) => {
          pushNewFullSheet(StudyNewFullSheet, {}, { smFull: true, closeOnBackdropClick: true });
        });
      }, 300);
      return;
    }

    if (cta.type === 'navigate' && cta.path) {
      navigate(cta.path);
    }
  };

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
          const cta = MISSION_CTA[mission.key];

          return (
            <li
              key={mission.key}
              className={`
                flex flex-col gap-[10px]
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
              <div className="flex items-center gap-[12px]">
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
                        ? `완료하면 '${featureLabel}' 기능이 열려요 · 보석 +${mission.reward_gem}`
                        : '이전 미션을 먼저 완료해주세요'}
                  </span>
                </div>
              </div>

              {isCurrent && cta && (
                <button
                  type="button"
                  onClick={() => handleCta(mission.key)}
                  className="
                    flex items-center justify-center gap-[6px]
                    h-[38px] rounded-[8px]
                    bg-primary-main-600
                    text-[13px] font-[700] text-layout-white dark:text-layout-black
                  "
                >
                  {cta.label}
                  <CaretRight size={14} weight="bold" />
                </button>
              )}
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
