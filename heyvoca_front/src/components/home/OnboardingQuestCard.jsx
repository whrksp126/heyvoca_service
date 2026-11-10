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
//
// 이슈 #25 12차 — 타이밍 버그 수정. 예전엔 '새로 완료' 판정을 첫 렌더 뒤 effect 에서, 그것도 보상 시트가
// 닫힌 뒤에야 해서 홈에 오면 체크된 모양이 먼저 보였다가 시트가 닫히면 체크가 사라지고 다시 채워졌다.
// 이제 새로 완료된 단계(완료 목록 − 기억한 목록)는 렌더 중에 바로 계산해 첫 프레임부터 '아직 안 함'
// 모양으로 그린다(unlock-status 갱신이 늦게 와도 그 렌더에서 바로 미완료 모양). 연출 시작은
// 홈 탭이 보이고 · 보상 대기열이 비고 · 바텀시트/풀시트/업적 오버레이가 없고 · 보석 비행이 끝난 뒤.
// 기억(localStorage)은 연출을 시작할 때 갱신한다 — 그 전에 화면을 떠나면 다음에 다시 연출한다.


import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { EyeSlash } from '@phosphor-icons/react';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { useUser } from '../../context/UserContext';
import { useQuestAction } from '../onboarding/useQuestAction';
import QuestSteps from '../onboarding/QuestSteps';
import { vibrate, showToast } from '../../utils/osFunction';
import { useNewBottomSheetContext } from '../../context/NewBottomSheetContext';
import { useNewFullSheetContext } from '../../context/NewFullSheetContext';
import { useOverlayState } from '../../context/OverlayContext';
import { isGemRewardPlaying } from '../../context/GemAnimationContext';

const SEEN_KEY_PREFIX = 'heyvoca_quest_seen_done_';
// 조건이 갖춰진 뒤 잠깐 기다렸다 시작 — 시트 닫힘 애니메이션·뒤이어 열리는 시트가 자리 잡을 시간
const START_SETTLE_MS = 500;
const START_RETRY_MS = 300;

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
  // 지금 연출 중인 단계(시작 시점 스냅샷) — { keys, doneKeys }
  const [playing, setPlaying] = useState(null);
  // 이번 화면에서 확인(연출 완료·첫 진입 기록)한 완료 목록 — { storageKey, keys }
  const [ack, setAck] = useState(null);
  const location = useLocation();
  const { stack: bottomStack } = useNewBottomSheetContext();
  const { stack: fullStack } = useNewFullSheetContext();
  const { current: overlayCurrent } = useOverlayState();

  const userId = userProfile?.id;
  const doneSig = missions.filter((m) => m.done).map((m) => m.key).join(',');
  const rewardsPending = (pendingMissionRewards?.length ?? 0) > 0;
  const storageKey = userId ? `${SEEN_KEY_PREFIX}${userId}` : null;

  // 렌더 중에 '새로 완료'를 계산한다 — 첫 프레임부터 체크된 모양이 보이지 않게
  const storedSeen = useMemo(() => (storageKey ? readSeen(storageKey) : null), [storageKey]);
  const seen = ack && ack.storageKey === storageKey ? ack.keys : storedSeen;
  const doneKeys = doneSig ? doneSig.split(',') : [];
  const newly = (questCardVisible && seen && !reduceMotion)
    ? doneKeys.filter((k) => !seen.includes(k))
    : [];
  const newlySig = newly.join(',');

  // 처음 진입(기억 없음)·모션 줄이기 — 지금 상태를 기억만 하고 연출하지 않는다
  useEffect(() => {
    if (!questCardVisible || !storageKey || missions.length === 0 || playing) return;
    if (seen && !reduceMotion) return;
    const keys = doneSig ? doneSig.split(',') : [];
    writeSeen(storageKey, keys);
    setAck({ storageKey, keys });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questCardVisible, storageKey, doneSig, missions.length, reduceMotion, !!seen, !!playing]);

  // 홈만 보이는 상태가 되면 연출 시작
  const isHomeTab = location.pathname === '/home';
  const screenClear = isHomeTab && !rewardsPending && bottomStack.length === 0
    && fullStack.length === 0 && !overlayCurrent;
  useEffect(() => {
    if (playing || !newlySig || !screenClear || !storageKey) return undefined;
    let t = 0;
    const tryStart = () => {
      // 반응형이 아닌 신호는 직접 다시 본다 — 보석 비행, 막 열리려는 시트·오버레이, 백그라운드
      const busy = isGemRewardPlaying()
        || (window.newBottomSheetContext?.stack?.length || 0) > 0
        || !!window.overlayContext?.current
        || (typeof document !== 'undefined' && document.visibilityState === 'hidden');
      if (busy) {
        t = setTimeout(tryStart, START_RETRY_MS);
        return;
      }
      const snapshot = doneSig ? doneSig.split(',') : [];
      writeSeen(storageKey, snapshot);
      setPlaying({ keys: newlySig.split(','), doneKeys: snapshot });
    };
    t = setTimeout(tryStart, START_SETTLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, newlySig, screenClear, storageKey]);

  const handleCelebrated = useCallback(() => {
    vibrate({ duration: 8 });
    if (playing && storageKey) setAck({ storageKey, keys: playing.doneKeys });
    setPlaying(null);
  }, [playing, storageKey]);

  // 연출 중이면 스냅샷, 아니면 '대기 중인 새 완료'(미완료 모양으로 붙잡아 둔다)
  const celebrateKeys = playing ? playing.keys : (newly.length > 0 ? newly : null);
  const celebrateHold = !playing;

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
          celebrateHold={celebrateHold}
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
