import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

// 단어장 불러오기 등의 최종 결과(성공/실패)를 표시하는 공용 바텀시트.
// 상점 결과 시트(StorePurchaseResultNewBottomSheet)와 시각적 톤을 맞춤.
const ImportResultNewBottomSheet = ({
  success = true,
  title = '',
  message = '',
  addedCount = null,
  mergedCount = null,
  confirmLabel = '확인',
  onConfirm = null,
}) => {
  "use memo";
  const { popNewBottomSheet, clearStack } = useNewBottomSheetActions();

  const handleConfirm = () => {
    vibrate({ duration: 5 });
    if (onConfirm) {
      onConfirm();
    } else if (success) {
      // 성공 시에는 시트 스택 전체 닫기 (불러오기 흐름 종료)
      clearStack();
    } else {
      popNewBottomSheet();
    }
  };

  const heading = success
    ? title
      ? `${title} 단어장이 추가되었어요`
      : '단어장이 추가되었어요'
    : '문제가 발생했어요';

  return (
    <div className="flex flex-col gap-[24px] items-center pt-[36px] pb-[20px] px-[20px] relative">
      <div className="flex flex-col items-center gap-[12px] w-full">
        <div className="size-[64px] flex items-center justify-center">
          {success ? (
            <CheckCircle weight="fill" className="w-full h-full text-primary-main-600" />
          ) : (
            <WarningCircle weight="fill" className="w-full h-full text-red-500" />
          )}
        </div>
        <h1 className="text-[18px] font-[700] leading-[1.4] text-layout-black dark:text-layout-white text-center tracking-[-0.36px] whitespace-pre-line">
          {heading}
        </h1>

        {success && (addedCount != null || mergedCount != null) && (
          <p className="text-[13px] text-layout-gray-400 text-center">
            {addedCount != null && <>총 <span className="font-[700] text-layout-black dark:text-layout-white">{addedCount}</span>개</>}
            {mergedCount != null && mergedCount > 0 && (
              <> · 중복 <span className="font-[700] text-layout-black dark:text-layout-white">{mergedCount}</span>개 병합</>
            )}
          </p>
        )}

        {message && (
          <p className="text-[13px] text-layout-gray-400 text-center whitespace-pre-line">
            {message}
          </p>
        )}
      </div>

      <div className="w-full">
        <motion.button
          onClick={handleConfirm}
          className="w-full h-[45px] rounded-[8px] bg-primary-main-600 text-layout-white dark:text-layout-black font-[700] text-[16px] tracking-[-0.32px] flex items-center justify-center"
          whileTap={{ scale: 0.95 }}
        >
          {confirmLabel}
        </motion.button>
      </div>
    </div>
  );
};

export default ImportResultNewBottomSheet;
