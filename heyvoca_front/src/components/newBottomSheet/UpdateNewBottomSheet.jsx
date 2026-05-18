import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { openExternalUrl, vibrate } from '../../utils/osFunction';

export const UpdateNewBottomSheet = ({ mode, platform, storeUrl }) => {
  "use memo";

  const { resolveNewBottomSheet } = useNewBottomSheetActions();
  const isForce = mode === 'force';

  const handleUpdate = () => {
    vibrate({ duration: 5 });
    if (storeUrl) openExternalUrl(storeUrl);
    resolveNewBottomSheet(true);
  };

  const handleLater = () => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet(false);
  };

  return (
    <div>
      <div className="
        flex flex-col gap-[15px] items-center justify-center
        pt-[40px] px-[20px] pb-[10px]
      ">
        <h3 className="text-layout-black dark:text-layout-white text-[18px] font-[700]">
          {isForce ? '업데이트가 필요합니다' : '새로운 버전이 있어요'}
        </h3>
        <p className="text-layout-black dark:text-layout-white text-[14px] font-[400] text-center leading-[20px]">
          {isForce
            ? '원활한 서비스 이용을 위해 최신 버전으로 업데이트 후 다시 실행해 주세요.'
            : '더 나은 사용을 위해 최신 버전으로 업데이트를 권장드려요.'}
        </p>
        {platform && (
          <p className="text-layout-gray-400 text-[12px] font-[400]">
            {platform === 'iOS' ? 'App Store' : 'Google Play'}로 이동합니다
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        {!isForce && (
          <motion.button
            className="
              flex-1
              h-[45px]
              rounded-[8px]
              bg-layout-gray-200
              text-layout-white dark:text-layout-black text-[16px] font-[700]
            "
            onClick={handleLater}
            whileTap={{ scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 15
            }}
          >나중에</motion.button>
        )}
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={handleUpdate}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >지금 업데이트</motion.button>
      </div>
    </div>
  );
};
