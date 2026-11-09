// src/components/home/OnboardingQuestCard.jsx
//
// 홈 — 가입 직후 '첫 퀘스트' 카드(이슈 #25).
//
// 헤이보카 기능을 한 단계씩 실제로 써 보게 하는 입문 퀘스트. 선행 퀘스트를 마쳐야 다음 기능이
// 열린다(잠금 자체는 BottomNav·학습 방식 시트가 하고, 이 카드는 '지금 할 일'만 말한다).
//
// 보이는 조건: 신규 가입자(legacy=false)이고 아직 남은 퀘스트(current_mission)가 있을 때만.
// 기존 가입자·전부 끝낸 사용자·해금 상태 미조회 시에는 아무것도 그리지 않는다.
//
// 구성(위→아래): 머리줄(첫 퀘스트 · n/6) → 현재 퀘스트 제목·한 줄 설명 → 보상 보석 + 하러 가기
//               → 6단계 진행 줄 → 다음에 열리는 기능.
// 카드 모양·여백은 TodayTasksCard·StreakCard 와 같다(rounded-12, 보더 우선, 그림자 없음).

import React from 'react';
import { CaretRight, LockKeyOpen, Flag } from '@phosphor-icons/react';
import {
  useOnboardingUnlock,
  QUEST_META,
  featureNameOf,
  withSubjectJosa,
  questTitleOf,
} from '../../context/OnboardingUnlockContext';
import { useQuestAction } from '../onboarding/useQuestAction';
import QuestSteps from '../onboarding/QuestSteps';
import gemIcon from '../../assets/images/farm/icon-gem.png';

const OnboardingQuestCard = () => {
  "use memo";

  const { unlock, legacy, missions, currentMissionInfo } = useOnboardingUnlock();
  const { goToQuest } = useQuestAction();

  if (!unlock || legacy || !currentMissionInfo || missions.length === 0) return null;

  const mission = currentMissionInfo;
  const doneCount = missions.filter((m) => m.done).length;
  const title = questTitleOf(mission);
  const desc = QUEST_META[mission.key]?.desc;
  const unlockLabel = mission.unlocks ? featureNameOf(mission.unlocks) : null;

  return (
    <section
      aria-label="첫 퀘스트"
      className="rounded-[12px] pt-[18px] px-[18px] pb-[18px] bg-layout-white dark:bg-layout-gray-dark border border-farm-line dark:border-transparent"
    >
      <div className="flex items-center justify-between">
        <b className="text-[17px] font-[800] text-layout-black dark:text-layout-white">첫 퀘스트</b>
        <span className="text-[14px] font-[700] text-layout-gray-300">
          <b className="text-[15px] font-[800] text-primary-main-600">{doneCount}</b>/{missions.length}
        </span>
      </div>

      {/* 현재 퀘스트 — 이 카드의 주인공 */}
      <div className="mt-[14px] flex flex-col gap-[4px]">
        <span className="text-[12px] font-[700] text-primary-main-600">
          {mission.order ?? doneCount + 1}단계
        </span>
        <b className="text-[18px] font-[800] tracking-[-0.02em] leading-[1.35] text-layout-black dark:text-layout-white">
          {title}
        </b>
        {desc && (
          <span className="text-[13px] font-[600] leading-[1.45] text-layout-gray-400 dark:text-layout-gray-300">
            {desc}
          </span>
        )}
      </div>

      <div className="mt-[14px] flex items-center gap-[10px]">
        {Number(mission.reward_gem) > 0 && (
          <span className="shrink-0 inline-flex items-center gap-[4px] h-[40px] px-[12px] rounded-[10px] bg-primary-main-100 dark:bg-primary-main-dark text-[14px] font-[800] text-layout-black dark:text-layout-white">
            <img src={gemIcon} alt="" draggable={false} className="w-[18px] h-[18px] object-contain select-none" />
            +{mission.reward_gem}
          </span>
        )}
        <button
          type="button"
          onClick={() => goToQuest(mission.key)}
          className="flex-1 inline-flex items-center justify-center gap-[4px] h-[40px] rounded-[10px] bg-primary-main-600 text-[15px] font-[700] tracking-[-0.02em] text-layout-white dark:text-layout-black"
        >
          하러 가기
          <CaretRight size={14} weight="bold" />
        </button>
      </div>

      {/* 6단계 진행 + 다음에 열리는 기능 */}
      <div className="mt-[16px] pt-[14px] border-t border-[#F0F0F0] dark:border-[rgba(255,255,255,.08)] flex flex-col gap-[10px]">
        <QuestSteps missions={missions} currentKey={mission.key} />
        <span className="inline-flex items-center gap-[6px] text-[13px] font-[600] text-layout-gray-400 dark:text-layout-gray-300">
          {unlockLabel ? (
            <>
              <LockKeyOpen size={15} weight="bold" className="shrink-0 text-primary-main-600" />
              <span>
                완료하면 <b className="font-[800] text-layout-black dark:text-layout-white">{unlockLabel}</b>
                {withSubjectJosa(unlockLabel).slice(unlockLabel.length)} 열려요
              </span>
            </>
          ) : (
            <>
              <Flag size={15} weight="bold" className="shrink-0 text-primary-main-600" />
              <span>마지막 퀘스트예요</span>
            </>
          )}
        </span>
      </div>
    </section>
  );
};

export default OnboardingQuestCard;
