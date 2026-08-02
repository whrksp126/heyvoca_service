import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { vibrate } from '../../utils/osFunction';
import { CROP_ASSETS } from '../farm/CropImage';

/**
 * 당근 농장 V2 — 영양 회복제 일괄 적용 확인 시트.
 * pushAwaitNewBottomSheet 로 호출 → resolve 값:
 *   { action: 'confirm', count }          실제로 사용할 개수 (보유량이 모자라면 보유량)
 *   { action: 'shop', item: 'NUTRIENT' }  상점에서 회복제 살펴보기
 *   { action: 'cancel' } / null           닫힘·백드롭
 *
 * 기획 7.3 — 보유량보다 많이 골랐으면 보유한 만큼만 쓰거나 부족분을 채우도록 안내한다.
 * 회복제는 즉시 소비되고, 지금까지 키운 단계는 그대로 보존된다.
 */
export const RecoverConfirmNewBottomSheet = ({
  count = 0,
  nutrientCnt = 0,
}) => {
  const { resolveNewBottomSheet } = useNewBottomSheet();

  const applyCount = Math.min(count, nutrientCnt);
  const enough = nutrientCnt >= count && count > 0;
  const canApply = applyCount > 0;
  const shortage = Math.max(0, count - nutrientCnt);

  const handleConfirm = () => {
    vibrate({ duration: 5 });
    if (!canApply) return;
    resolveNewBottomSheet({ action: 'confirm', count: applyCount });
  };

  const handleShop = () => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet({ action: 'shop', item: 'NUTRIENT' });
  };

  const handleCancel = () => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet({ action: 'cancel' });
  };

  return (
    <div className="flex flex-col items-center gap-[18px] p-[20px] pb-[28px]">
      <motion.img
        src={CROP_ASSETS.nutrient}
        alt="영양 회복제"
        draggable={false}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="w-[64px] h-[64px] object-contain select-none"
      />

      <div className="flex flex-col items-center gap-[6px]">
        <h1 className="text-[18px] font-[800] text-layout-black dark:text-layout-white text-center leading-[1.4]">
          {enough
            ? `${count}개 작물에 영양 회복제 ${count}개를 사용할까요?`
            : `영양 회복제가 ${nutrientCnt}개 남아 있어요`}
        </h1>
        <p className="text-[13px] font-[400] text-layout-gray-300 text-center leading-[1.55]">
          {enough
            ? '지금까지 키운 단계를 그대로 두고 되살려요.'
            : `${count}개를 골랐으니 ${shortage}개가 더 필요해요. 지금 있는 ${applyCount}개만 먼저 써도 괜찮아요.`}
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
          <img src={CROP_ASSETS.nutrient} alt="" className="w-[20px] h-[20px] object-contain" />
          {enough ? `영양 회복제 ${applyCount}개 사용하기` : `${applyCount}개만 사용하기`}
        </motion.button>

        {!enough && (
          <motion.button
            type="button"
            onClick={handleShop}
            whileTap={{ scale: 0.97 }}
            className="w-full py-[14px] rounded-[8px] border-[1.5px] border-primary-main-300 text-[15px] font-[700] text-primary-main-600"
          >
            상점에서 영양 회복제 살펴보기
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
          보유한 영양 회복제 {nutrientCnt}개
        </p>
      </div>
    </div>
  );
};

export default RecoverConfirmNewBottomSheet;
