import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, File, Plus } from '@phosphor-icons/react';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { UploadQuizletNewBottomSheet } from './UploadQuizletNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { useUser } from '../../context/UserContext';
import { userBookCntCheckApi } from '../../api/voca';
import { vibrate } from '../../utils/osFunction';

export const LoadVocabularyNewBottomSheet = () => {
  const { popNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();
  const { addVocabularySheetFromBackend } = useVocabulary();
  const { userProfile } = useUser();

  const handleClose = () => {
    popNewBottomSheet();
  };

  const showQuizletUploadBottomSheet = useCallback(async () => {
    // 단어장 생성 가능 여부 확인
    try {
      const result = await userBookCntCheckApi();
      const canAddBook = result?.data?.can_add_book;
      if(result.code != 200){
        alert('단어장 개수 확인에 실패했습니다.');
        return;
      }
      if (!(userProfile.book_cnt > 0 || canAddBook)) {
        alert('단어장 생성 가능 횟수를 초과했습니다. 보석을 구매하여 추가할 수 있습니다.');
        return;
      }

      const handleUpload = (vocabularySheetData) => {
        // 백엔드에서 생성된 단어장 데이터를 로컬 state에 추가
        try {
          // console.log('백엔드에서 생성된 단어장 데이터:', vocabularySheetData);
          addVocabularySheetFromBackend(vocabularySheetData);
          alert('퀴즐렛 데이터가 성공적으로 추가되었습니다.');
          // 모든 바텀시트 닫기
          popNewBottomSheet(); // UploadQuizletNewBottomSheet 닫기
          popNewBottomSheet(); // LoadVocabularyNewBottomSheet 닫기
        } catch (error) {
          console.error('단어장 추가 실패:', error);
          alert('단어장 추가에 실패했습니다.');
        }
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
    } catch (error) {
      console.error('단어장 개수 체크 실패:', error);
      alert('단어장 개수 확인에 실패했습니다. 다시 시도해주세요.');
    }
  }, [pushNewBottomSheet, popNewBottomSheet, addVocabularySheetFromBackend, userProfile]);    

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

