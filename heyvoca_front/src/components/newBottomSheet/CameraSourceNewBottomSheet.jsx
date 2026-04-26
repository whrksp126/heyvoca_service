import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

export const CameraSourceNewBottomSheet = () => {
  "use memo";

  const { resolveNewBottomSheet } = useNewBottomSheetActions();

  const handleSelect = (source) => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet(source);
  };

  return (
    <div>
      <div className="
        flex flex-col gap-[10px] items-center justify-center
        pt-[40px] px-[20px] pb-[10px]
      ">
        <h3 className="text-layout-black dark:text-layout-white text-[18px] font-[700]">
          이미지 선택
        </h3>
        <p className="text-layout-black dark:text-layout-white text-[14px] font-[400]">
          어떤 방식으로 이미지를 가져올까요?
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
          onClick={() => handleSelect('library')}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >앨범에서 선택</motion.button>
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={() => handleSelect('camera')}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >카메라로 촬영</motion.button>
      </div>
    </div>
  );
};

export default CameraSourceNewBottomSheet;
