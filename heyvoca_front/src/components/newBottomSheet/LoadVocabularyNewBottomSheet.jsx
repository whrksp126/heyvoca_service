import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Table, FileCsv, FilePlus } from '@phosphor-icons/react';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useUploadQuizletNewBottomSheet } from './UploadQuizletNewBottomSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { useUser } from '../../context/UserContext';
import { userBookCntCheckApi } from '../../api/voca';
import { vibrate } from '../../utils/osFunction';

export const LoadVocabularyNewBottomSheet = () => {
  "use memo";
  const { popNewBottomSheet } = useNewBottomSheet();
  const { showUploadQuizletNewBottomSheet } = useUploadQuizletNewBottomSheet();
  const { userProfile } = useUser();

  const showQuizletUploadBottomSheet = useCallback(async () => {
    // 단어장 생성 가능 여부 확인
    try {
      const result = await userBookCntCheckApi();
      const canAddBook = result?.data?.can_add_book;
      if (result.code != 200) {
        alert('단어장 개수 확인에 실패했습니다.');
        return;
      }
      if (!(userProfile.book_cnt > 0 || canAddBook)) {
        alert('단어장 생성 가능 횟수를 초과했습니다. 보석을 구매하여 추가할 수 있습니다.');
        return;
      }

      // 현재 바텀시트(LoadVocabularyNewBottomSheet) 닫기
      popNewBottomSheet();
      // 퀴즐렛 업로드 바텀시트 열기
      showUploadQuizletNewBottomSheet();
    } catch (error) {
      console.error('단어장 개수 체크 실패:', error);
      alert('단어장 개수 확인에 실패했습니다. 다시 시도해주세요.');
    }
  }, [popNewBottomSheet, showUploadQuizletNewBottomSheet, userProfile]);

  const menuItems = [
    {
      id: 'load-google-sheets',
      text: '구글 스프레트 시트 불러오기',
      icon: Table,
      onClick: () => {
        vibrate({ duration: 5 });
        // TODO: 구글 스프레드시트 불러오기 기능 구현
        console.log('구글 스프레드시트 불러오기');
      }
    },
    {
      id: 'load-csv',
      text: 'CSV 파일 불러오기',
      icon: FileCsv,
      onClick: () => {
        vibrate({ duration: 5 });
        // TODO: CSV 파일 불러오기 기능 구현
        console.log('CSV 파일 불러오기');
      }
    },
    {
      id: 'load-quizlet',
      text: '퀴즐렛 데이터 추가',
      icon: FilePlus,
      onClick: () => {
        vibrate({ duration: 5 });
        showQuizletUploadBottomSheet();
      }
    }
  ];

  return (
    <div className="flex flex-col gap-[30px] items-center p-[20px] pb-[40px] bg-white dark:bg-[#111]">
      {/* Header */}
      <h1 className="text-[18px] font-bold text-[#111] dark:text-[#fff] text-center tracking-[-0.36px]">
        단어장 불러오기
      </h1>

      {/* Menu Items */}
      <div className="flex flex-col gap-[10px] w-full">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              className="
                                flex items-center justify-center gap-[8px]
                                w-full h-[45px]
                                bg-white dark:bg-[#1A1A1A]
                                border border-primary-main-600 border-solid
                                rounded-[8px]
                                text-primary-main-600 font-bold text-[16px] tracking-[-0.32px]
                            "
              onClick={item.onClick}
              whileTap={{ scale: 0.98 }}
            >
              <Icon size={18} weight="bold" />
              <span>{item.text}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};


