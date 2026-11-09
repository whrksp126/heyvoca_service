// src/components/home/OnboardingQuestCard.jsx
//
// 홈 — 가입 직후 '첫 퀘스트' 카드(이슈 #25 2차).
//
// 7단계를 세로 타임라인으로 모두 보여 준다(완료=체크, 지금 할 것=핑크). 잠금은 없다.
// 하단 '퀘스트 하러 가기'는 미완료 중 첫 번째 퀘스트로 바로 데려가고, 각 줄을 눌러도 그 퀘스트로 간다.
//
// 보이는 조건: 신규 가입자(legacy=false)이고 아직 남은 퀘스트가 있을 때만.
// 카드 모양·여백은 TodayTasksCard·StreakCard 와 같다(rounded-12, 보더 우선, 그림자 없음).

import React from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { useQuestAction } from '../onboarding/useQuestAction';
import QuestSteps from '../onboarding/QuestSteps';

const OnboardingQuestCard = () => {
  "use memo";

  const { unlock, legacy, missions, currentMissionInfo } = useOnboardingUnlock();
  const { goToQuest } = useQuestAction();

  if (!unlock || legacy || !currentMissionInfo || missions.length === 0) return null;

  const doneCount = missions.filter((m) => m.done).length;

  return (
    <section
      aria-label="첫 퀘스트"
      className="rounded-[12px] pt-[16px] px-[18px] pb-[16px] bg-layout-white dark:bg-layout-gray-dark border border-farm-line dark:border-transparent"
    >
      <div className="flex items-center justify-between">
        <b className="text-[17px] font-[800] text-layout-black dark:text-layout-white">첫 퀘스트</b>
        <span className="text-[14px] font-[700] text-layout-gray-300">
          <b className="text-[15px] font-[800] text-primary-main-600">{doneCount}</b>/{missions.length}
        </span>
      </div>

      <div className="mt-[8px]">
        <QuestSteps
          missions={missions}
          currentKey={currentMissionInfo.key}
          onSelect={(key) => goToQuest(key)}
        />
      </div>

      <button
        type="button"
        onClick={() => goToQuest(currentMissionInfo.key)}
        className="mt-[12px] w-full inline-flex items-center justify-center gap-[4px] h-[44px] rounded-[10px] bg-primary-main-600 text-[15px] font-[700] tracking-[-0.02em] text-layout-white dark:text-layout-black"
      >
        퀘스트 하러 가기
        <CaretRight size={14} weight="bold" />
      </button>
    </section>
  );
};

export default OnboardingQuestCard;
