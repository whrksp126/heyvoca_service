// src/components/home/homeCelebrationGate.js
//
// 홈 달성 연출의 "언제 시작해도 되나" 판정 — 이슈 #25 13차.
//
// 입문 퀘스트 카드(OnboardingQuestCard.jsx, 12차)가 쓰는 대기 조건을 그대로 옮겨 공유 유틸로 뽑았다
// (그 파일의 로직은 바꾸지 않았다 — 같은 조건을 여기서 한 번 더 정의해 '오늘 할 일' 카드가 쓴다).
//   반응형 조건   홈 탭이 보이고 · 보상 대기열이 비고 · 바텀시트/풀시트/오버레이가 없을 때(useHomeScreenClear)
//   즉시 조건     보석 비행 · 막 열리려는 시트·오버레이 · 백그라운드(isHomeScreenBusy — 재시도 때 직접 다시 본다)
//
// 퀘스트 연출과 겹치지 않게 — 퀘스트 카드가 연출할 '새로 완료' 단계가 남아 있는지(questPendingCount)를
// 같은 localStorage 기억(heyvoca_quest_seen_done_<userId>)으로 계산하고, 퀘스트 연출이 시작되면
// 그 길이(questCelebrationMs)만큼 기다렸다가 우리 연출을 시작한다(퀘스트 먼저).
import { useLocation } from 'react-router-dom';
import { useNewBottomSheetContext } from '../../context/NewBottomSheetContext';
import { useNewFullSheetContext } from '../../context/NewFullSheetContext';
import { useOverlayState } from '../../context/OverlayContext';
import { isGemRewardPlaying } from '../../context/GemAnimationContext';

/** 조건이 갖춰진 뒤 잠깐 기다렸다 시작(시트 닫힘 애니메이션 · 뒤이어 열리는 시트가 자리 잡을 시간) */
export const START_SETTLE_MS = 500;
export const START_RETRY_MS = 300;

// QuestSteps.jsx 의 연출 박자(CELEBRATE_DELAY · CHECK_MS · LINE_MS)와 같은 값
const QUEST_DELAY_MS = 450;
const QUEST_STEP_MS = 480 + 380;
const QUEST_SEEN_PREFIX = 'heyvoca_quest_seen_done_';

/** 홈만 보이는 상태인가(반응형) — OnboardingQuestCard 의 screenClear 와 같은 조건 */
export const useHomeScreenClear = ({ rewardsPending = false } = {}) => {
  const location = useLocation();
  const { stack: bottomStack } = useNewBottomSheetContext();
  const { stack: fullStack } = useNewFullSheetContext();
  const { current: overlayCurrent } = useOverlayState();
  const isHomeTab = location.pathname === '/home';
  return isHomeTab && !rewardsPending && bottomStack.length === 0
    && fullStack.length === 0 && !overlayCurrent;
};

/** 반응형이 아닌 '지금 바쁨' 신호 — 보석 비행, 막 열리려는 시트·오버레이, 백그라운드 */
export const isHomeScreenBusy = () => isGemRewardPlaying()
  || (window.newBottomSheetContext?.stack?.length || 0) > 0
  || !!window.overlayContext?.current
  || (typeof document !== 'undefined' && document.visibilityState === 'hidden');

/** 퀘스트 카드가 아직 연출하지 않은 '새로 완료' 단계 수(그 카드가 보이지 않으면 0) */
export const questPendingCount = (userId, missions, questCardVisible) => {
  if (!userId || !questCardVisible || !Array.isArray(missions)) return 0;
  let seen = null;
  try {
    const raw = localStorage.getItem(`${QUEST_SEEN_PREFIX}${userId}`);
    seen = raw == null ? null : JSON.parse(raw);
  } catch (e) {
    seen = null;
  }
  if (!Array.isArray(seen)) return 0; // 첫 진입 — 퀘스트 카드도 연출하지 않는다
  return missions.filter((m) => m.done && !seen.includes(m.key)).length;
};

/** 퀘스트 n단계 연출이 시작부터 끝날 때까지 걸리는 시간(ms, 여유 포함) */
export const questCelebrationMs = (n) => QUEST_DELAY_MS + n * QUEST_STEP_MS + 400;
