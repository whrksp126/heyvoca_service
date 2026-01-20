import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, File, Plus } from '@phosphor-icons/react';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { UploadQuizletNewBottomSheet } from './UploadQuizletNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

export const LoadVocabularyNewBottomSheet = () => {
  const { popNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();

  const handleClose = () => {
    popNewBottomSheet();
  };

  const showQuizletUploadBottomSheet = useCallback(() => {
    const handleUpload = (quizletText) => {
      // 퀴즐렛 텍스트를 파싱하고 처리하는 로직
      console.log('퀴즐렛 텍스트:', quizletText);
      // TODO: 실제 업로드 및 단어 추가 로직 구현
      popNewBottomSheet();
    };

    pushNewBottomSheet(
      UploadQuizletNewBottomSheet,
      {
        onCancel: popNewBottomSheet,
        onUpload: handleUpload
      },
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [pushNewBottomSheet, popNewBottomSheet]);

  const menuItems = [
    {
      id: 'load-google-sheets',
      text: '구글 스프레드시트 불러오기',
      iconBg: 'bg-[#0F9D58]',
      iconColor: 'text-white',
      onClick: () => {
        vibrate({ duration: 5 });
        // TODO: 구글 스프레드시트 불러오기 기능 구현
        console.log('구글 스프레드시트 불러오기');
      }
    },
    {
      id: 'load-csv',
      text: 'CSV 파일 불러오기',
      iconBg: 'bg-transparent border-[1px] border-[#E5E5E5]',
      iconColor: 'text-[#999]',
      onClick: () => {
        vibrate({ duration: 5 });
        // TODO: CSV 파일 불러오기 기능 구현
        console.log('CSV 파일 불러오기');
      }
    },
    {
      id: 'load-vocat',
      text: '퀴즐렛 데이터 추가',
      iconBg: 'bg-transparent',
      iconColor: 'text-[#999]',
      onClick: () => {
        vibrate({ duration: 5 });
        showQuizletUploadBottomSheet();
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
          불러오기
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
                {item.id === 'load-google-sheets' ? (
                  <div className={`
                    flex items-center justify-center
                    w-[24px] h-[24px]
                    rounded-[4px]
                    ${item.iconBg}
                    ${item.iconColor}
                  `}>
                    <Plus size={16} weight="bold" />
                  </div>
                ) : item.id === 'load-csv' ? (
                  <div className={`
                    flex items-center justify-center
                    w-[24px] h-[24px]
                    rounded-[4px]
                    ${item.iconBg}
                    ${item.iconColor}
                  `}>
                    <Plus size={16} weight="bold" />
                  </div>
                ) : (
                  <File 
                    size={24} 
                    weight="regular"
                    className={item.iconColor}
                  />
                )}
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

