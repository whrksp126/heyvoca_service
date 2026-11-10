// src/components/myPage/QuestSection.jsx
//
// 마이페이지 — 입문 퀘스트(이슈 #25 9차).
// 홈 퀘스트 카드를 숨긴 뒤에도 남은 퀘스트 진행 상황을 보고 「바로가기」로 실행할 수 있게 한다.
// 홈에 다시 보이기/숨기기를 여기서 관리한다(계정 단위 서버 저장 — POST /onboarding/quest-visibility).
// 필수 퀘스트(서점 구매·새 씨앗 심기·농장 돌보기)가 남아 있으면 숨길 수 없다.
// legacy(이슈 #25 이전 가입자)에게는 그리지 않는다.

import React, { useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { useQuestAction } from '../onboarding/useQuestAction';
import QuestSteps from '../onboarding/QuestSteps';
import { vibrate, showToast } from '../../utils/osFunction';

const QuestSection = () => {
  "use memo";

  const { unlock, legacy, missions, currentMissionInfo, requiredDone, questHidden, setQuestHidden } = useOnboardingUnlock();
  const { goToQuest } = useQuestAction();
  const [busy, setBusy] = useState(false);

  if (!unlock || legacy || missions.length === 0) return null;

  const doneCount = missions.filter((m) => m.done).length;
  const allDone = doneCount >= missions.length;

  const toggle = async () => {
    if (busy) return;
    vibrate({ duration: 5 });
    setBusy(true);
    const res = await setQuestHidden(!questHidden);
    setBusy(false);
    if (!res) { showToast('잠시 뒤 다시 시도해 주세요.'); return; }
    showToast(questHidden ? '홈에 입문 퀘스트를 다시 보여 드려요.' : '홈에서 입문 퀘스트를 숨겼어요.');
  };

  // 홈 보이기/숨기기 버튼 — 다 끝냈으면 카드가 홈에 없으니 버튼도 없다(이슈 #25 11차: 설명 문구 없이 하단 가운데)
  let visibilityBtn = null;
  if (!allDone) {
    if (questHidden) visibilityBtn = { label: '홈에 다시 보이기', icon: Eye };
    else if (requiredDone) visibilityBtn = { label: '홈에서 숨기기', icon: EyeSlash };
  }

  return (
    <div>
      <div className="flex items-baseline gap-[8px] mb-[7px]">
        <h4 className="text-[15px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">입문 퀘스트</h4>
        <span className="flex-1 text-[11.5px] font-[500] tracking-[-0.02em] text-layout-gray-300">
          {allDone ? '모두 끝냈어요' : `${doneCount} / ${missions.length} 완료`}
        </span>
      </div>

      <div className="px-[16px] pt-[10px] pb-[8px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
        <QuestSteps
          missions={missions}
          currentKey={currentMissionInfo?.key}
          onSelect={(key) => goToQuest(key)}
        />

        {visibilityBtn && (
          <div className="flex justify-center mt-[4px]">
            <button
              type="button"
              onClick={toggle}
              disabled={busy}
              className="inline-flex items-center gap-[4px] h-[28px] px-[8px] text-[12px] font-[600] text-layout-gray-300 disabled:opacity-50"
            >
              <visibilityBtn.icon size={13} weight="bold" />
              {visibilityBtn.label}
            </button>
          </div>
        )}
        {!allDone && !questHidden && !requiredDone && (
          <p className="mt-[4px] py-[6px] text-center text-[12px] font-[600] tracking-[-0.02em] text-layout-gray-300 break-keep">
            필수 퀘스트를 모두 끝내면 홈에서 숨길 수 있어요.
          </p>
        )}
      </div>
    </div>
  );
};

export default QuestSection;
