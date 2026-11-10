// src/components/rewards/RewardClaimSheet.jsx
//
// 보상 받기 바텀시트 — 퀘스트 완료(입문 퀘스트, UnlockGuideNewBottomSheet)와 업적 달성 보상
// (openRewardSheet: 서점 구매·단어장 추가·출석)이 **같은 화면·같은 효과**로 쓴다(2026-11 QA #25 8차).
//
//   · 보상 아이템(빈 단어장·보석 …)마다 아이콘 우측 상단에 알림 배지처럼 개수를 띄운다.
//   · 버튼은 보상이 있으면 「보상 받기」, 단순 확인용이면 「확인」.
//   · 「보상 받기」를 누르면 시트가 닫히고, 화면 우측 상단에 보석 현황 칩이 떠 보석이 그리로 날아
//     들어간 뒤 숫자가 이전값 → 새값으로 굴러 오른다(GemAnimationContext.flyGemReward).
//   · 보상 자체는 서버가 이미 지급했다 — 여기는 연출만 한다.
import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useGemAnimation } from '../../context/GemAnimationContext';
import { vibrate } from '../../utils/osFunction';
import gemImg from '../../assets/images/farm/icon-gem.png';
import { EMPTY_BOOK_ART as emptyBookImg } from '../farm/itemArt';

const ITEM_ART = {
  book: { src: emptyBookImg, round: false },
  gem: { src: gemImg, round: true },
};

/** 알림 숫자 배지 — 아이콘 우측 상단 */
export const RewardCountBadge = ({ count }) => (
  <span
    className="
      absolute -top-[4px] -right-[4px] z-10
      inline-flex items-center justify-center
      min-w-[24px] h-[24px] px-[7px] rounded-full
      bg-status-error-500 border-[2px] border-layout-white dark:border-layout-black
      text-[12px] font-[800] leading-none tabular-nums text-layout-white
    "
  >
    {Number(count).toLocaleString()}
  </span>
);

/**
 * @param {string} title
 * @param {string} [subtitle]
 * @param {{kind:'book'|'gem', count:number}[]} items  0 개수는 빼고 넘긴다
 * @param {{gemTo:number|(() => number|Promise<number>), gemFrom?:number, hint?:number}} [gem]  보석 잔액(카운트업 용)
 * @param {() => (void|Promise)} [onClaim]  「보상 받기」를 누른 순간(대기열 비우기·잔액 다시 읽기 등)
 * @param {() => void} [onClaimed]  보석 연출까지 끝난 뒤
 */
export const RewardClaimSheet = ({ title, subtitle, items = [], gem, onClaim, onClaimed }) => {
  "use memo";

  const { popNewBottomSheet } = useNewBottomSheetActions();
  const { flyGemReward } = useGemAnimation();
  const gemRef = useRef(null);
  const [claiming, setClaiming] = useState(false);

  const shown = items.filter((it) => Number(it.count) > 0 && ITEM_ART[it.kind]);
  const gemAmount = shown.filter((it) => it.kind === 'gem').reduce((s, it) => s + Number(it.count), 0);
  const label = shown.length > 0 ? '보상 받기' : '확인';

  const handleClaim = () => {
    if (claiming) return;
    setClaiming(true);
    vibrate({ duration: 5 });
    // 시트가 닫히기 전에 출발 위치를 잰다(flyGemReward 가 호출 즉시 잰다)
    if (gemAmount > 0) {
      flyGemReward({
        source: gemRef.current,
        amount: gemAmount,
        // 함수면 누른 순간 부른다(퀘스트 보상 — 프로필을 다시 읽어 새 잔액을 얻는다)
        gemTo: typeof gem?.gemTo === 'function' ? gem.gemTo() : gem?.gemTo,
        gemFrom: gem?.gemFrom,
        hint: gem?.hint,
        onComplete: onClaimed,
      });
    }
    try { onClaim?.(); } catch (e) { /* 연출이 우선 */ }
    popNewBottomSheet();
    if (gemAmount <= 0) onClaimed?.();
  };

  return (
    <div className="flex flex-col max-h-[85vh] pt-[30px] pb-[20px] px-[20px]">
      <div className="flex flex-col items-center text-center shrink-0 gap-[6px]">
        <h3 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
          {title}
        </h3>
        {subtitle ? (
          <p className="text-[14px] font-[600] text-layout-gray-400 dark:text-layout-gray-50">
            {subtitle}
          </p>
        ) : null}
      </div>

      {shown.length > 0 && (
        <div className="flex items-center justify-center py-[24px]">
          <motion.div
            className="flex items-center justify-center gap-[24px]"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 16 }}
          >
            {shown.map((it) => {
              const art = ITEM_ART[it.kind];
              return (
                <div key={it.kind} className="relative">
                  {art.round ? (
                    <div
                      ref={it.kind === 'gem' ? gemRef : undefined}
                      className="flex items-center justify-center w-[84px] h-[84px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark"
                    >
                      <img src={art.src} alt="" draggable={false} className="w-[46px] h-[46px] object-contain" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center w-[84px] h-[84px]">
                      <img src={art.src} alt="" draggable={false} className="w-[72px] h-[72px] object-contain" />
                    </div>
                  )}
                  <RewardCountBadge count={it.count} />
                </div>
              );
            })}
          </motion.div>
        </div>
      )}

      <button
        type="button"
        onClick={handleClaim}
        disabled={claiming}
        className={`shrink-0 h-[52px] rounded-[12px] bg-primary-main-600 text-[16px] font-[700] tracking-[-0.03em] text-layout-white dark:text-layout-black ${shown.length > 0 ? '' : 'mt-[24px]'}`}
      >
        {label}
      </button>
    </div>
  );
};

export default RewardClaimSheet;
