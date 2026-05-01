import React from 'react';
import { motion } from 'framer-motion';
import { SpinnerGap } from '@phosphor-icons/react';
import ProgressBar from './ProgressBar';

// 단어장 불러오기 흐름의 분석/저장 진행률 시트 공용 view.
// 모든 Upload 시트에서 step === 'progress' 단계에 사용.
const ImportProgressView = ({
  title = '진행 중',
  label = '',
  helperText = '잠시만 기다려주세요.',
  value = 0,
  total = 0,
  onCancel,
  cancelDisabled = false,
}) => {
  "use memo";
  return (
    <div className="relative">
      <div className="flex items-center justify-center p-[20px] pb-[0px]">
        <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">{title}</h1>
      </div>

      <div className="flex flex-col items-center justify-center gap-[18px] min-h-[260px] px-[24px] pt-[24px] pb-[105px]">
        <SpinnerGap size={36} className="animate-spin text-primary-main-600" />
        <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white">
          {label || title}
        </p>
        <div className="w-full">
          <ProgressBar value={value} total={total} label="" />
        </div>
        <p className="text-[12px] text-layout-gray-400 text-center whitespace-pre-line">
          {helperText}
        </p>
      </div>

      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-center gap-[15px]
        p-[20px]
        bg-gradient-to-b from-transparent to-layout-white dark:to-layout-black
      ">
        <motion.button
          className="w-full h-[45px] rounded-[8px] bg-layout-gray-200 text-layout-white dark:text-layout-black text-[16px] font-[700] disabled:opacity-50"
          onClick={onCancel}
          disabled={cancelDisabled}
          whileTap={{ scale: 0.95 }}
        >
          취소
        </motion.button>
      </div>
    </div>
  );
};

export default ImportProgressView;
