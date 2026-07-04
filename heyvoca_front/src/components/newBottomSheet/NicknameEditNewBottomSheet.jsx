import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

/**
 * 닉네임 변경 바텀시트.
 * pushAwaitNewBottomSheet로 호출 → 저장 시 새 닉네임 문자열, 취소 시 null resolve.
 */
export const NicknameEditNewBottomSheet = ({ initialNickname = '' }) => {
  const { resolveNewBottomSheet } = useNewBottomSheet();
  const inputRef = useRef(null);

  const handleSubmit = () => {
    vibrate({ duration: 5 });
    const nickname = (inputRef.current?.value || '').trim();
    if (!nickname) return alert('닉네임을 입력해주세요.');
    if (nickname.length > 8) return alert('닉네임은 8자 이내로 입력해주세요.');
    resolveNewBottomSheet(nickname);
  };

  const handleCancel = () => {
    vibrate({ duration: 5 });
    resolveNewBottomSheet(null);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-center p-[20px] pb-[0px]">
        <h1 className="text-[18px] font-bold text-layout-black dark:text-layout-white">
          닉네임 변경
        </h1>
      </div>

      <div className="flex flex-col gap-[30px] p-[20px]">
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[14px] font-bold text-layout-black dark:text-layout-white">닉네임</h3>
          <input
            ref={inputRef}
            type="text"
            defaultValue={initialNickname}
            maxLength={8}
            placeholder="8자 이내로 입력해주세요"
            className="
              w-full px-[16px] py-[14px] rounded-[8px]
              border border-border dark:border-border-dark
              bg-layout-white dark:bg-layout-black
              text-[16px] text-layout-black dark:text-layout-white
              placeholder:text-layout-gray-300
              focus:outline-none focus:border-primary-main-600
            "
          />
        </div>

        <div className="flex gap-[10px]">
          <motion.button
            type="button"
            onClick={handleCancel}
            whileTap={{ scale: 0.97 }}
            className="flex-1 py-[14px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[16px] font-[700] text-layout-gray-400 dark:text-layout-gray-200"
          >
            취소
          </motion.button>
          <motion.button
            type="button"
            onClick={handleSubmit}
            whileTap={{ scale: 0.97 }}
            className="flex-1 py-[14px] rounded-[8px] bg-primary-main-600 text-[16px] font-[700] text-layout-white"
          >
            저장
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default NicknameEditNewBottomSheet;
