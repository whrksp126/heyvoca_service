import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Lightbulb, CaretRight, Lock } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { UnlockGuideNewBottomSheet } from './UnlockGuideNewBottomSheet';
import { StudySetupNewBottomSheet } from './StudySetupNewBottomSheet';
import { TestSetupNewBottomSheet } from './TestSetupNewBottomSheet';
import { vibrate } from '../../utils/osFunction';
import { primeSfx } from '../../utils/audio';

/*
  단어장 상세에서 "이 단어장 물주기"를 눌렀을 때 뜨는 방식 선택.

  홈의 주 버튼은 방식을 묻지 않고 곧바로 AI 추천 학습을 연다 — 홈은 무엇을 할지
  정해 주는 자리라서다(useQuickReview 주석). 방식을 고르는 일은 여기로 왔다.
  여기서는 '이 단어장'이라는 대상이 이미 정해져 있어, 남은 선택이 실제로 방식뿐이다.

  그래서 두 갈래만 둔다. AI 추천은 단어장을 가리지 않고 전체에서 뽑는 방식이라
  단어장 하나를 펼쳐 놓은 이 자리에는 들어올 수 없다.

  해금(입문 퀘스트)은 학습 종류 시트에 있던 규칙을 그대로 가져왔다 —
  잠긴 항목을 누르면 시작하지 않고 무엇을 하면 열리는지 안내한다.
*/

const CARD_LOCK_KEY = { study: 'listen', test: 'custom' };

export const BookStudyTypeNewBottomSheet = ({ vocabularySheetId, maxVocabularyCount }) => {
  "use memo";

  const { pushNewBottomSheet, popNewBottomSheet } = useNewBottomSheetActions();
  const { missions, isFeatureLocked } = useOnboardingUnlock();

  const lockedOf = (key) => isFeatureLocked(CARD_LOCK_KEY[key]);

  // 잠긴 항목 설명 — 그 기능을 여는 미션 이름으로 말한다
  const lockTextOf = (key) => {
    const mission = missions.find((m) => m.unlocks === CARD_LOCK_KEY[key]);
    if (mission?.title) {
      return `'${mission.title.replace(/\s*완료\s*$/, '').trim()}' 미션을 완료하면 열려요`;
    }
    return '이전 미션을 완료하면 열려요';
  };

  const OPTIONS = [
    {
      key: 'study',
      icon: <Brain size={16} weight="fill" />,
      title: '집중 반복 학습',
      desc: '보고 듣고 따라 읽으며 뜻과 예문까지 익혀요',
      open: () => pushNewBottomSheet(
        StudySetupNewBottomSheet,
        { vocabularySheetId, maxVocabularyCount },
        { isBackdropClickClosable: false, isDragToCloseEnabled: true }
      ),
    },
    {
      key: 'test',
      icon: <Lightbulb size={16} weight="fill" />,
      title: '자유 설정 테스트',
      desc: '문제 유형과 개수를 직접 골라 점검해요',
      open: () => pushNewBottomSheet(
        TestSetupNewBottomSheet,
        { vocabularySheetId, maxVocabularyCount, testType: 'exam' },
        { isBackdropClickClosable: false, isDragToCloseEnabled: true }
      ),
    },
  ];

  const handleClick = (option) => {
    // 효과음 unlock 은 user gesture 동기 시점에만 걸린다(iOS WKWebView)
    primeSfx();
    vibrate({ duration: 5 });
    if (lockedOf(option.key)) {
      pushNewBottomSheet(
        UnlockGuideNewBottomSheet,
        { highlightKey: CARD_LOCK_KEY[option.key] },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true }
      );
      return;
    }
    popNewBottomSheet();
    option.open();
  };

  return (
    <div className="flex flex-col px-[20px] pt-[18px] pb-[20px]">
      <h1 className="max-w-full truncate text-[16px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
        어떻게 돌볼까요?
      </h1>

      <div className="mt-[10px]">
        {OPTIONS.map((option, idx) => {
          const locked = lockedOf(option.key);
          return (
            <motion.button
              key={option.key}
              type="button"
              onClick={() => handleClick(option)}
              whileTap={{ scale: 0.99, backgroundColor: 'rgba(0,0,0,0.03)' }}
              className={`
                flex items-center gap-[11px] w-full py-[12px] text-left rounded-[8px]
                ${idx > 0 ? 'border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.07)]' : ''}
              `}
            >
              <span
                className={`
                  relative w-[30px] h-[30px] shrink-0 rounded-[9px] flex items-center justify-center
                  bg-layout-gray-50 dark:bg-[#2A2A2A] text-layout-gray-400
                  ${locked ? 'opacity-45' : ''}
                `}
              >
                {option.icon}
                {locked && (
                  <span className="absolute -top-[4px] -right-[5px] flex items-center justify-center w-[16px] h-[16px] rounded-full bg-layout-gray-300 dark:bg-layout-gray-400">
                    <Lock size={9} weight="bold" className="text-layout-white" />
                  </span>
                )}
              </span>

              <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
                  {option.title}
                </span>
                <small className="block mt-[2px] text-[11.5px] font-[500] tracking-[-0.02em] leading-[1.5] text-layout-gray-300">
                  {locked ? lockTextOf(option.key) : option.desc}
                </small>
              </span>

              <CaretRight size={13} weight="bold" className="shrink-0 text-layout-gray-200" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default BookStudyTypeNewBottomSheet;
