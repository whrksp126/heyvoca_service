import React from 'react';
import { motion } from 'framer-motion';
import { Warning } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

/**
 * 탈퇴 확인 — 짧은 안내만 남긴다(이슈 #25 2차 QA 19).
 * 호출부가 넘기는 통계 props 는 더 이상 쓰지 않는다.
 */
export const WithdrawNewBottomSheet = () => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheetActions();

  const handleClose = () => resolveNewBottomSheet(false);
  const handleConfirm = () => resolveNewBottomSheet(true);

  return (
    <div className="flex flex-col px-[20px] pt-[6px] pb-[20px] bg-layout-white dark:bg-layout-black">
      <div className="text-center">
        <div className="w-[84px] h-[84px] mx-auto mt-[2px] mb-[14px] rounded-full flex items-center justify-center bg-status-error-100 dark:bg-status-error-dark">
          <Warning size={32} className="text-[#F04438]" />
        </div>
        <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
          정말 탈퇴하시겠어요?
        </h3>
        <p className="mt-[8px] text-[13px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
          탈퇴하면 모든 학습 기록이 삭제되고<br />복구할 수 없어요.
        </p>
      </div>

      <div className="flex gap-[10px] mt-[16px]">
        <motion.button
          className="flex-1 h-[48px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200 text-[15px] font-[700]"
          onClick={() => { vibrate({ duration: 5 }); handleClose(); }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          취소
        </motion.button>
        <motion.button
          className="flex-1 h-[48px] rounded-[10px] bg-[#F04438] text-layout-white text-[15px] font-[700]"
          onClick={() => { vibrate({ duration: 5 }); handleConfirm(); }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >
          탈퇴하기
        </motion.button>
      </div>
    </div>
  );
};
