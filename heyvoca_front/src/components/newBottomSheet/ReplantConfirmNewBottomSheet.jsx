import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { vibrate } from '../../utils/osFunction';
import { CROP_ASSETS } from '../farm/CropImage';

/**
 * 당근 농장 V2 — 다시 심기(삽) 확인 시트.
 * pushAwaitNewBottomSheet 로 호출 → resolve 값:
 *   { action: 'confirm', count }        실제로 다시 심을 개수 (보유량이 모자라면 보유량)
 *   { action: 'shop', item: 'SHOVEL' }  상점에서 삽 살펴보기
 *   { action: 'cancel' } / null         닫힘·백드롭
 *
 * 기획 7.2 — 삽은 예약이고, 확정 소비는 첫 진단 문제를 맞힌 시점이다.
 * 취소는 첫 진단이 시작되기 전 10초 안에만 가능하므로 그 사실을 미리 알려 준다.
 */
export const ReplantConfirmNewBottomSheet = ({
  count = 0,
  shovelCnt = 0,
  cancelSeconds = 10,
}) => {
  const { resolveNewBottomSheet } = useNewBottomSheet();

  const applyCount = Math.min(count, shovelCnt);
  const enough = shovelCnt >= count && count > 0;
  const canApply = applyCount > 0;

  const handleConfirm = () => {
    vibrate({ duration: 5 });
    if (!canApply) return;
    resolveNewBottomSheet({ action: 'confirm', count: applyCount });
  };

  const handleShop = () => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet({ action: 'shop', item: 'SHOVEL' });
  };

  const handleCancel = () => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet({ action: 'cancel' });
  };

  return (
    <div className="flex flex-col items-center gap-[18px] p-[20px] pb-[28px]">
      <motion.img
        src={CROP_ASSETS.shovel}
        alt="삽"
        draggable={false}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="w-[64px] h-[64px] object-contain select-none"
      />

      <div className="flex flex-col items-center gap-[6px]">
        <h1 className="text-[18px] font-[800] text-layout-black dark:text-layout-white text-center">
          {enough
            ? `작물 ${count}개를 다시 심을까요?`
            : `삽이 ${shovelCnt}개 남아 있어요`}
        </h1>
        <p className="text-[13px] font-[400] text-layout-gray-300 text-center leading-[1.55]">
          {enough
            ? '씨앗부터 다시 시작해요. 지금까지의 학습 기록은 그대로 남아요.'
            : `${count}개를 골랐지만 지금은 ${applyCount}개까지 다시 심을 수 있어요.`}
        </p>
      </div>

      <div className="w-full rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark px-[13px] py-[11px]">
        <p className="text-[12.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 leading-[1.6]">
          삽은 첫 진단 문제를 맞히면 그때 사용돼요.
          <br />
          진단이 시작되기 전 {cancelSeconds}초 안에는 되돌릴 수 있어요.
        </p>
      </div>

      <div className="flex flex-col w-full gap-[10px]">
        <motion.button
          type="button"
          onClick={handleConfirm}
          whileTap={canApply ? { scale: 0.97 } : undefined}
          disabled={!canApply}
          className="
            flex items-center justify-center gap-[6px]
            w-full py-[14px] rounded-[8px]
            bg-primary-main-600 text-layout-white text-[16px] font-[700]
            disabled:opacity-40
          "
        >
          <img src={CROP_ASSETS.shovel} alt="" className="w-[20px] h-[20px] object-contain" />
          {canApply ? `${applyCount}개 다시 심기` : '다시 심기'}
        </motion.button>

        {!enough && (
          <motion.button
            type="button"
            onClick={handleShop}
            whileTap={{ scale: 0.97 }}
            className="w-full py-[14px] rounded-[8px] border-[1.5px] border-primary-main-300 text-[15px] font-[700] text-primary-main-600"
          >
            상점에서 삽 살펴보기
          </motion.button>
        )}

        <motion.button
          type="button"
          onClick={handleCancel}
          whileTap={{ scale: 0.97 }}
          className="w-full py-[14px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[15px] font-[600] text-layout-gray-400 dark:text-layout-gray-200"
        >
          다음에 할게요
        </motion.button>

        <p className="text-center text-[12px] font-[400] text-layout-gray-300">
          보유한 삽 {shovelCnt}개
        </p>
      </div>
    </div>
  );
};

export default ReplantConfirmNewBottomSheet;
