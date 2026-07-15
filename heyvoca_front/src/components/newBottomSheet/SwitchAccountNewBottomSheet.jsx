import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

// 온보딩에 갇힌 기로그인 사용자가 "다른 계정으로 로그인"을 시도할 때 띄우는 확인 바텀시트.
// 확인 시 true, 취소 시 false로 resolve — 실제 로그아웃/이동은 호출한 쪽(Onboarding)에서 처리한다.
export const SwitchAccountNewBottomSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { resolveNewBottomSheet } = useNewBottomSheetActions();

  const handleClose = () => {
    resolveNewBottomSheet(false);
  };

  const handleConfirm = () => {
    resolveNewBottomSheet(true);
  };

  return (
    <div className="relative">
      <div className="flex flex-col gap-[15px] pt-[40px] px-[20px] pb-[10px]">
        <h3 className="text-center text-[18px] font-[700] text-layout-black dark:text-layout-white">
          다른 계정으로 로그인할까요?
        </h3>
        <p className="text-center text-[14px] font-[400] text-[#666] dark:text-layout-gray-300 leading-[1.5]">
          현재 계정은 로그아웃돼요.
        </p>
      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-layout-gray-200
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleClose();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >취소</motion.button>
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleConfirm();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >로그아웃</motion.button>
      </div>
    </div>
  );
};
