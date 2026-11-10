// src/components/rewards/openRewardSheet.js
//
// React 밖(UserContext·VocabularyContext — Provider 트리 상 바텀시트 Context 보다 바깥)에서
// 보상 받기 시트(RewardClaimSheet)를 띄우는 진입점. 다른 window.*Context 와 같은 전역 참조 패턴.
//
// 업적 달성 연출(AchievementRewardOverlay)이 먼저 뜨는 경우, 그 오버레이들이 모두 닫힌 뒤에 연다
// — 업적 → 보석 보상 순서가 지켜지고, 두 연출이 한 화면에 겹쳐 그려지지 않는다.
import { RewardClaimSheet } from './RewardClaimSheet';

const SHEET_OPTIONS = { isBackdropClickClosable: true, isDragToCloseEnabled: true };
// 오버레이 퇴장(0.3s) 애니메이션과 시트 등장 애니메이션이 겹치지 않게
const AFTER_OVERLAY_MS = 320;

/**
 * @param {object} p
 * @param {Promise[]} [p.after]   먼저 끝나야 하는 오버레이 Promise 들(showAwaitOverlay 반환값)
 * @param {string} p.title
 * @param {string} [p.subtitle]
 * @param {number} p.gemFrom      받기 전 보석 잔액
 * @param {number} p.gemTo        받은 뒤 보석 잔액
 */
export const openGemRewardSheet = async ({ after = [], title, subtitle, gemFrom, gemTo }) => {
  const amount = Number(gemTo) - Number(gemFrom);
  if (!(amount > 0)) return;
  if (after.length > 0) {
    await Promise.all(after).catch(() => {});
    await new Promise((r) => setTimeout(r, AFTER_OVERLAY_MS));
  }
  const ctx = window.newBottomSheetContext;
  if (!ctx?.openNewBottomSheet) return;
  ctx.openNewBottomSheet(
    RewardClaimSheet,
    {
      title,
      subtitle,
      items: [{ kind: 'gem', count: amount }],
      gem: { gemFrom: Number(gemFrom), gemTo: Number(gemTo) },
    },
    SHEET_OPTIONS,
  );
};

export default openGemRewardSheet;
