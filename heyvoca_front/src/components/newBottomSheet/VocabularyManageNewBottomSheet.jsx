import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Stack, BookOpen, Plus, Download, ArrowsDownUp } from '@phosphor-icons/react';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useVocabularySetBottomSheet } from '../vocabularySheets/VocabularyBottomSheet';
import { LoadVocabularyNewBottomSheet } from './LoadVocabularyNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

export const useVocabularyManageNewBottomSheet = () => {
  const { pushNewBottomSheet, popNewBottomSheet } = useNewBottomSheet();

  const showVocabularyManageNewBottomSheet = useCallback(() => {
    pushNewBottomSheet(
      VocabularyManageNewBottomSheet,
      {},
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [pushNewBottomSheet]);

  return {
    showVocabularyManageNewBottomSheet
  };
};

export const VocabularyManageNewBottomSheet = () => {
  const { popNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();
  const { showVocabularySetBottomSheet } = useVocabularySetBottomSheet();

  const handleClose = () => {
    popNewBottomSheet();
  };

  const showLoadVocabularyBottomSheet = useCallback(() => {
    pushNewBottomSheet(
      LoadVocabularyNewBottomSheet,
      {},
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [pushNewBottomSheet]);

  const menuItems = [
    {
      id: 'create-vocabulary',
      icon: BookOpen,
      iconPlus: true,
      text: '단어장 생성',
      onClick: () => {
        vibrate({ duration: 5 });
        // 기존 단어장 추가 바텀 시트
        showVocabularySetBottomSheet();
      }
    },
    {
      id: 'load-vocabulary',
      icon: Download,
      text: '단어장 불러오기',
      onClick: () => {
        vibrate({ duration: 5 });
        showLoadVocabularyBottomSheet();
      }
    }
  ];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#111]">
      {/* Header */}
      <div className="
        flex items-center justify-between
        p-[20px] pb-[0px]
      ">
        <h1 className="text-[18px] font-[700] text-[#111] dark:text-[#fff]">
          단어장 관리
        </h1>
        <button
          type="button"
          className="
            inline-flex items-center justify-center
            w-[24px] h-[24px]
            text-[#111] dark:text-[#fff]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleClose();
          }}
        >
          <X size={24} weight="bold" />
        </button>
      </div>

      {/* Menu Items */}
      <div className="flex flex-col">
        {menuItems.map((item, index) => {
          const IconComponent = item.icon;
          return (
            <React.Fragment key={item.id}>
              {index > 0 && (
                <div className="h-[1px] bg-[#E5E5E5] dark:bg-[#333]" />
              )}
              <motion.button
                className="
                  flex items-center gap-[12px]
                  w-full
                  p-[20px]
                  text-left
                  bg-white dark:bg-[#111]
                  hover:bg-[#F5F5F5] dark:hover:bg-[#1A1A1A]
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
                <div className="relative">
                  <IconComponent
                    size={24}
                    weight="regular"
                    className="text-[#111] dark:text-[#fff]"
                  />
                  {item.iconPlus && (
                    <Plus
                      size={12}
                      weight="bold"
                      className="
                        absolute -top-[2px] -right-[2px]
                        text-[#FF8DD4]
                      "
                    />
                  )}
                </div>
                <span className="
                  text-[16px] font-[400]
                  text-[#111] dark:text-[#fff]
                ">
                  {item.text}
                </span>
              </motion.button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

