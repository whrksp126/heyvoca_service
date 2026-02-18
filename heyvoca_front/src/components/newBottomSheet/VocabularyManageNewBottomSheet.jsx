import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { FolderPlus, ArrowSquareIn } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabularySetNewBottomSheet } from './VocabularySetNewBottomSheet';
import { VocabularyLimitNewBottomSheet } from './VocabularyLimitNewBottomSheet';
import { LoadVocabularyNewBottomSheet } from './LoadVocabularyNewBottomSheet';
import { userBookCntCheckApi } from '../../api/voca';
import { vibrate } from '../../utils/osFunction';
import { useUser } from '../../context/UserContext';

export const useVocabularyManageNewBottomSheet = () => {
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  const showVocabularyManageNewBottomSheet = useCallback(() => {
    pushNewBottomSheet(
      VocabularyManageNewBottomSheet,
      {},
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );
  }, [pushNewBottomSheet]);

  return {
    showVocabularyManageNewBottomSheet
  };
};

export const VocabularyManageNewBottomSheet = () => {
  const { popNewBottomSheet, pushNewBottomSheet } = useNewBottomSheetActions();
  const { showVocabularySetNewBottomSheet } = useVocabularySetNewBottomSheet();
  const { userProfile } = useUser();

  const handleClose = () => {
    popNewBottomSheet();
  };

  const showLoadVocabularyBottomSheet = useCallback(() => {
    pushNewBottomSheet(
      LoadVocabularyNewBottomSheet,
      {},
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );
  }, [pushNewBottomSheet]);

  const menuItems = [
    {
      id: 'create-vocabulary',
      icon: FolderPlus,
      text: '단어장 생성',
      onClick: async () => {
        vibrate({ duration: 5 });
        const result = await userBookCntCheckApi();
        if (userProfile.book_cnt > 0 || result.data.can_add_book) {
          popNewBottomSheet();
          showVocabularySetNewBottomSheet();
        } else {
          popNewBottomSheet();
          pushNewBottomSheet(
            VocabularyLimitNewBottomSheet,
            {},
            {
              isBackdropClickClosable: true,
              isDragToCloseEnabled: true
            }
          );
        }
      }
    },
    {
      id: 'load-vocabulary',
      icon: ArrowSquareIn,
      text: '단어장 불러오기',
      onClick: async () => {
        vibrate({ duration: 5 });
        const result = await userBookCntCheckApi();
        if (userProfile.book_cnt > 0 || result.data.can_add_book) {
          popNewBottomSheet();
          showLoadVocabularyBottomSheet();
        } else {
          popNewBottomSheet();
          pushNewBottomSheet(
            VocabularyLimitNewBottomSheet,
            {},
            {
              isBackdropClickClosable: true,
              isDragToCloseEnabled: true
            }
          );
        }
      }
    }
  ];

  return (
    <div className="flex flex-col items-center gap-[30px] p-[20px]">
      {/* Header Info */}
      <div className="flex flex-col items-center justify-center gap-[5px] w-full text-center">
        <h1 className="text-[18px] font-bold text-[#111] dark:text-[#fff] tracking-[-0.36px]">
          단어장 추가
        </h1>
        <p className="text-[12px] font-medium text-[#999] tracking-[-0.24px]">
          추가 가능 단어장 {userProfile.book_cnt}개
        </p>
      </div>

      {/* Menu Buttons */}
      <div className="flex flex-col gap-[10px] w-full">
        {menuItems.map((item) => {
          const IconComponent = item.icon;
          return (
            <motion.button
              key={item.id}
              className="
                flex items-center justify-center gap-[8px]
                w-full h-[45px] px-[15px]
                bg-white dark:bg-[#111]
                border border--primary-main-600 border-solid rounded-[8px]
                transition-colors
              "
              onClick={item.onClick}
              whileTap={{ scale: 0.98 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 15
              }}
            >
              <IconComponent
                size={18}
                weight="bold"
                className="text-primary-main-600"
              />
              <span className="text-[16px] font-bold text-primary-main-600 tracking-[-0.32px]">
                {item.text}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};



