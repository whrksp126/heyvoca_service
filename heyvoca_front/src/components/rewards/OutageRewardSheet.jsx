// 2026-11-26 장애 사과 보상 시트 — 오늘만 쓴다(제거: OutageRewardWatcher 마운트 한 줄 + 이 폴더의 Outage* 2개 파일).
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import shieldImg from '../../assets/images/farm/item-streak-shield.png';
import { RewardCountBadge } from './RewardClaimSheet';

const SPARKS = [
  { x: -64, y: -52, d: 0.0 },
  { x: 66, y: -40, d: 0.4 },
  { x: -52, y: 46, d: 0.8 },
  { x: 60, y: 54, d: 1.2 },
];

export const OutageRewardSheet = ({ onConfirm }) => {
  "use memo";
  const { popNewBottomSheet } = useNewBottomSheetActions();
  const [done, setDone] = useState(false);

  const handleConfirm = () => {
    if (done) return;
    setDone(true);
    vibrate({ duration: 5 });
    try { onConfirm?.(); } catch (e) { /* 연출이 우선 */ }
    popNewBottomSheet();
  };

  return (
    <div className="flex flex-col pt-[30px] pb-[20px] px-[20px]">
      <div className="flex flex-col items-center text-center gap-[6px]">
        <h3 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">
          연속 학습 보호권 1개를 받았어요
        </h3>
        <p className="text-[14px] font-[600] text-layout-gray-400 dark:text-layout-gray-50">
          오늘 불편을 드려 죄송해요
        </p>
      </div>

      <div className="flex items-center justify-center py-[28px]">
        <div className="relative flex items-center justify-center w-[160px] h-[160px]">
          <motion.div
            className="absolute inset-0 rounded-full bg-primary-main-100 dark:bg-primary-main-dark"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1, 1.08, 1], opacity: [0, 0.9, 0.6, 0.8] }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
          />
          {SPARKS.map((s, i) => (
            <motion.span
              key={i}
              className="absolute left-1/2 top-1/2 w-[8px] h-[8px] rounded-full bg-primary-main-600"
              style={{ marginLeft: s.x, marginTop: s.y }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 1.6, delay: 0.5 + s.d * 0.4, repeat: Infinity, repeatDelay: 0.6 }}
            />
          ))}
          <motion.div
            className="relative"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.1 }}
          >
            <img src={shieldImg} alt="" draggable={false} className="w-[110px] h-[110px] object-contain" />
            <RewardCountBadge count={1} />
          </motion.div>
        </div>
      </div>

      <p className="text-center text-[16px] font-[700] text-primary-main-600 mb-[20px]">보호권 +1</p>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={done}
        className="shrink-0 h-[52px] rounded-[12px] bg-primary-main-600 text-[16px] font-[700] tracking-[-0.03em] text-layout-white dark:text-layout-black"
      >
        확인
      </button>
    </div>
  );
};

export default OutageRewardSheet;
