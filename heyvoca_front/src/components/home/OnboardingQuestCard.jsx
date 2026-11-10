// src/components/home/OnboardingQuestCard.jsx
//
// 홈 — 가입 직후 '첫 퀘스트' 카드(이슈 #25 2차).
//
// 7단계를 세로 타임라인으로 모두 보여 준다(완료=체크, 지금 할 것=핑크). 잠금은 없다.
// 각 줄은 아코디언 — 펼치면 달성 방법과 「바로가기」가 나온다(QuestSteps).
// 하단 '퀘스트 하러 가기' 버튼은 2026-11 QA #25 3차에서 뺐다 — 홈 주 버튼과 같은 일을 하는 버튼이 둘이었다.
//
// 이슈 #25 9차: 필수 퀘스트(buy_book·plant_seed·care_farm)를 다 끝내면 「숨기기」가 생긴다
// (11차: 헤더 우측 → 카드 하단 가운데 작은 텍스트 버튼).
// 누르면 홈에서 카드가 사라지고(계정 단위 서버 저장), 마이페이지 '입문 퀘스트'에서 다시 보이게 할 수 있다.
//
// 보이는 조건: 신규 가입자(legacy=false)이고 아직 남은 퀘스트가 있고 숨기지 않았을 때만(questCardVisible).
// 카드 모양·여백은 TodayTasksCard·StreakCard 와 같다(rounded-12, 보더 우선, 그림자 없음).
// className 으로 바깥 상자 스타일을 덧붙일 수 있다(단어장 0개일 때 히어로 밭 자리에 놓일 때).
//
// 이슈 #25 11차 — 완료 연출. 마지막으로 본 완료 목록을 계정별 localStorage 에 기억했다가,
// 홈에 왔을 때 새로 완료된 단계만 QuestSteps 에 celebrateKeys 로 넘겨 순차 연출한다.
// 처음 진입(기억 없음)·새로고침에는 지금 상태를 기억만 하고 연출하지 않는다.
// 보상 시트(pendingMissionRewards)가 남아 있으면 그게 닫힌 뒤 시작한다(시트 뒤에서 몰래 지나가지 않게).


import React, { useCallback, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { EyeSlash } from '@phosphor-icons/react';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { useUser } from '../../context/UserContext';
import { useQuestAction } from '../onboarding/useQuestAction';
import QuestSteps from '../onboarding/QuestSteps';
import { vibrate, showToast } from '../../utils/osFunction';

const SEEN_KEY_PREFIX = 'heyvoca_quest_seen_done_';

const readSeen = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (e) {
    return null;
  }
};

const writeSeen = (key, doneKeys) => {
  try { localStorage.setItem(key, JSON.stringify(doneKeys)); } catch (e) { /* noop */ }
};

const OnboardingQuestCard = ({ className = '' }) => {
  "use memo";

  const {
    missions, currentMissionInfo, questCardVisible, requiredDone, setQuestHidden, pendingMissionRewards,
  } = useOnboardingUnlock();
  const { userProfile } = useUser();
  const { goToQuest } = useQuestAction();
  const reduceMotion = useReducedMotion();
  const [hiding, setHiding] = useState(false);
  const [celebrateKeys, setCelebrateKeys] = useState(null);

  const userId = userProfile?.id;
  const doneSig = missions.filter((m) => m.done).map((m) => m.key).join(',');
  const rewardsPending = (pendingMissionRewards?.length ?? 0) > 0;

  // 새로 완료된 단계 감지 — 마지막으로 본 완료 목록과 비교
  useEffect(() => {
    if (!questCardVisible || !userId || missions.length === 0) return;
    if (celebrateKeys) return; // 연출 중
    if (rewardsPending) return; // 보상 시트가 먼저
    const storageKey = `${SEEN_KEY_PREFIX}${userId}`;
    const doneKeys = doneSig ? doneSig.split(',') : [];
    const seen = readSeen(storageKey);
    // 기억을 먼저 갱신한다 — 연출 도중 화면을 떠나도 과거 완료분을 다시 연출하지 않게
    writeSeen(storageKey, doneKeys);
    if (!seen) return; // 처음 진입 — 기억만
    const newly = doneKeys.filter((k) => !seen.includes(k));
    if (newly.length === 0 || reduceMotion) return;
    setCelebrateKeys(newly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questCardVisible, userId, doneSig, rewardsPending, missions.length]);

  const handleCelebrated = useCallback(() => {
    vibrate({ duration: 8 });
    setCelebrateKeys(null);
  }, []);

  if (!questCardVisible) return null;

  const doneCount = missions.filter((m) => m.done).length;

  const handleHide = async () => {
    if (hiding) return;
    vibrate({ duration: 5 });
    setHiding(true);
    const res = await setQuestHidden(true);
    setHiding(false);
    if (res) showToast('마이페이지에서 언제든 다시 볼 수 있어요.');
    else showToast('잠시 뒤 다시 시도해 주세요.');
  };

  return (
    <section
      aria-label="입문 퀘스트"
      className={`rounded-[12px] pt-[16px] px-[18px] pb-[12px] bg-[rgba(255,255,255,.72)] dark:bg-[rgba(36,36,36,.66)] backdrop-blur-[12px] backdrop-saturate-[1.4] border border-white/80 dark:border-white/[.08] shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_4px_14px_rgba(96,80,52,.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_4px_14px_rgba(0,0,0,.28)] ${className}`}
    >
      <div className="flex items-center justify-between gap-[8px]">
        <b className="text-[17px] font-[800] text-layout-black dark:text-layout-white">입문 퀘스트</b>
        <span className="text-[14px] font-[700] text-layout-gray-300">
          <b className="text-[15px] font-[800] text-status-success-600">{doneCount}</b>/{missions.length}
        </span>
      </div>

      <div className="mt-[8px]">
        <QuestSteps
          missions={missions}
          currentKey={currentMissionInfo?.key}
          onSelect={(key) => goToQuest(key)}
          celebrateKeys={celebrateKeys}
          onCelebrated={handleCelebrated}
        />
      </div>

      {requiredDone && (
        <div className="flex justify-center mt-[4px]">
          <button
            type="button"
            onClick={handleHide}
            disabled={hiding}
            className="inline-flex items-center gap-[4px] h-[28px] px-[8px] text-[12px] font-[600] text-layout-gray-300 disabled:opacity-50"
          >
            <EyeSlash size={13} weight="bold" />
            퀘스트 숨기기
          </button>
        </div>
      )}
    </section>
  );
};

export default OnboardingQuestCard;
