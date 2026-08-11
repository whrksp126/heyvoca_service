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
import emptyBookImg from '../../assets/images/farm/book-empty.png';

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
      <div className="relative flex flex-col items-center justify-center w-full text-center">
        <h1 className="text-[18px] font-bold text-layout-black dark:text-layout-white tracking-[-0.36px]">
          단어장 추가
        </h1>

        {/*
          "추가 가능 단어장 N개" 문장을 이 칩으로 바꿨다.
          그 수는 결국 **보유한 빈 단어장 아이템 개수**라, 마이페이지 창고·상점에서
          쓰는 것과 같은 그림으로 보여 주는 편이 "내가 가진 물건"이라는 걸 바로 알린다.
          문장으로 적으면 같은 값을 화면마다 다른 말로 부르게 된다.
        */}
        <span
          className="
            absolute top-0 right-0
            inline-flex items-center gap-[4px]
            h-[26px] pl-[4px] pr-[9px] rounded-full
            bg-layout-gray-50 dark:bg-layout-gray-dark
            text-[13px] font-[800] tracking-[-0.02em]
            text-layout-black dark:text-layout-white
          "
          title={`보유한 빈 단어장 ${userProfile.book_cnt ?? 0}개`}
        >
          <img
            src={emptyBookImg}
            alt="빈 단어장"
            draggable={false}
            className="block w-[22px] h-[22px] object-contain select-none"
          />
          {userProfile.book_cnt ?? 0}
        </span>
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
                bg-layout-white dark:bg-layout-black
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



