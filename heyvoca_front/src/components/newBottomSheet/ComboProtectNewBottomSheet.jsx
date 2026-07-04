import React from 'react';
import { Flame } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { vibrate } from '../../utils/osFunction';
import gemImg from '../../assets/images/gem.png';

/**
 * 콤보 위기(오답) 순간 보호 팝업.
 * pushAwaitNewBottomSheet로 호출 → 'protect' | 'forfeit' resolve.
 * (닫힘/백드롭 클릭은 null → 호출부에서 forfeit 처리)
 */
export const ComboProtectNewBottomSheet = ({ atRiskCombo = 0, protectCost = 1, gemCnt = 0 }) => {
  const { resolveNewBottomSheet } = useNewBottomSheet();

  const canProtect = gemCnt >= protectCost;

  const handleProtect = () => {
    vibrate({ duration: 5 });
    if (!canProtect) return;
    resolveNewBottomSheet('protect');
  };

  const handleForfeit = () => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet('forfeit');
  };

  return (
    <div className="flex flex-col items-center gap-[20px] p-[20px] pb-[28px]">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        className="flex items-center justify-center w-[64px] h-[64px] rounded-full bg-primary-main-100 dark:bg-layout-gray-dark"
      >
        <Flame weight="fill" className="text-[36px] text-primary-main-600" />
      </motion.div>

      <div className="flex flex-col items-center gap-[6px]">
        <h1 className="text-[18px] font-[800] text-layout-black dark:text-layout-white">
          콤보 {atRiskCombo}이 사라질 위기예요!
        </h1>
        <p className="text-[13px] font-[400] text-layout-gray-300 text-center">
          보석으로 지키면 연속 정답 기록이 그대로 이어져요.
        </p>
      </div>

      <div className="flex flex-col w-full gap-[10px]">
        <motion.button
          type="button"
          onClick={handleProtect}
          whileTap={canProtect ? { scale: 0.97 } : undefined}
          disabled={!canProtect}
          className="
            flex items-center justify-center gap-[6px]
            w-full py-[14px] rounded-[8px]
            bg-primary-main-600 text-layout-white text-[16px] font-[700]
            disabled:opacity-40
          "
        >
          <img src={gemImg} alt="보석" className="w-[18px] h-[16px]" />
          {protectCost}개로 콤보 지키기
        </motion.button>
        <motion.button
          type="button"
          onClick={handleForfeit}
          whileTap={{ scale: 0.97 }}
          className="w-full py-[14px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[15px] font-[600] text-layout-gray-400 dark:text-layout-gray-200"
        >
          괜찮아요, 포기할래요
        </motion.button>
        <p className="text-center text-[12px] font-[400] text-layout-gray-300">
          {canProtect ? `보유 보석 ${gemCnt}개` : `보석이 부족해요 (보유 ${gemCnt}개)`}
        </p>
      </div>
    </div>
  );
};

export default ComboProtectNewBottomSheet;
