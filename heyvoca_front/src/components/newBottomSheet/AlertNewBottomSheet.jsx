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
        max-h-[calc(90vh-47px)] h-full
        pt-[40px] p-[20px] pb-[105px]
        overflow-y-auto
      ">
        <h3 className="text-center text-[18px] font-[700]">
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
            h-[45px]
            rounded-[8px]
            bg-primary-main-600
            text-[#fff] text-[16px] font-[700]
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

