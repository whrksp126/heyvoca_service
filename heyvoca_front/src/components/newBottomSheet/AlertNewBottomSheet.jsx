import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';

export const AlertNewBottomSheet = ({ title, btns }) => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheetActions();

  const handleConfirm = () => {
    resolveNewBottomSheet(true);
  };

  return (
    <div className="relative">

      <div className="
        flex flex-col gap-[10px]
        max-h-[calc(90vh-47px)]
        pt-[40px] p-[20px] pb-[105px]
        overflow-y-auto
      ">
        <h3 className="text-center text-[18px] font-[700] text-layout-black dark:text-layout-white">
          {title}
        </h3>
      </div>
      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-center
        p-[20px]
      ">
        <motion.button
          className="
            w-full
            h-[52px]
            rounded-[12px]
            bg-primary-main-600
            text-layout-white text-[16px] font-[700] tracking-[-0.03em]
          "
          onClick={handleConfirm}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >{btns?.confirm || "확인"}</motion.button>
      </div>
    </div>
  );
};

