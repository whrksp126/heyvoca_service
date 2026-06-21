import React from 'react';
import { motion } from 'framer-motion';
import { SpeakerSlash } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import { LISTENING_SKIP_DURATION_MIN } from '../../utils/listeningSkip';

const SkipListeningNewBottomSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { resolveNewBottomSheet } = useNewBottomSheetActions();

  const handleConfirm = () => {
    resolveNewBottomSheet({ confirmed: true });
  };
  const handleCancel = () => {
    resolveNewBottomSheet({ confirmed: false });
  };

  return (
    <div className="">
      <div className="
        flex flex-col gap-[12px] items-center justify-center
        pt-[36px] px-[20px] pb-[10px]
      ">
        <div className="
          flex items-center justify-center
          w-[56px] h-[56px] rounded-full
          bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600
        ">
          <SpeakerSlash size={30} weight="fill" />
        </div>
        <h3 className="text-layout-black dark:text-layout-white text-[18px] font-[700]">듣기 일시 중단</h3>
        <p className="text-layout-gray-400 dark:text-layout-gray-50 text-[14px] font-[400] text-center leading-[1.6]">
          <span className="text-primary-main-600 font-[700]">{LISTENING_SKIP_DURATION_MIN}분간</span> 듣기 유형 문제를 출제하지 않습니다.
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
            handleCancel();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
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
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >일시 중단</motion.button>
      </div>
    </div>
  );
};

export default SkipListeningNewBottomSheet;
