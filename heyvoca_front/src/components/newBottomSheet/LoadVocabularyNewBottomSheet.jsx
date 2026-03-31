import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Table, FileCsv, FilePlus, FileXls } from '@phosphor-icons/react';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useUploadQuizletNewBottomSheet } from './UploadQuizletNewBottomSheet';
import { useUploadExcelNewBottomSheet } from './UploadExcelNewBottomSheet';
import { useUploadCsvNewBottomSheet } from './UploadCsvNewBottomSheet';
import { useUploadGoogleSheetNewBottomSheet } from './UploadGoogleSheetNewBottomSheet';
import { useUser } from '../../context/UserContext';
import { userBookCntCheckApi } from '../../api/voca';
import { vibrate, getDevicePlatform } from '../../utils/osFunction';
import postMessageManager from '../../utils/postMessageManager';

export const LoadVocabularyNewBottomSheet = () => {
  "use memo";
  const { popNewBottomSheet } = useNewBottomSheet();
  const { showUploadQuizletNewBottomSheet } = useUploadQuizletNewBottomSheet();
  const { showUploadExcelNewBottomSheet } = useUploadExcelNewBottomSheet();
  const { showUploadCsvNewBottomSheet } = useUploadCsvNewBottomSheet();
  const { showUploadGoogleSheetNewBottomSheet } = useUploadGoogleSheetNewBottomSheet();
  const { userProfile } = useUser();

  /**
   * 구글 스프레드시트 불러오기
   */
  const showGoogleSheetUpload = useCallback(async () => {
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

      const platform = getDevicePlatform();
      if (platform === 'web') {
        alert('구글 스프레드시트 불러오기는 앱에서만 사용할 수 있습니다.');
        return;
      }

      // 앱에 구글 시트 인증 요청
      postMessageManager.setupGoogleSheetAuth((data) => {
        postMessageManager.removeGoogleSheetAuth();

        if (data.status === 200 && data.accessToken) {
          // 현재 바텀시트 닫고 구글 시트 바텀시트 열기
          popNewBottomSheet();
          showUploadGoogleSheetNewBottomSheet(data.accessToken);
        } else {
          alert('구글 스프레드시트 인증에 실패했습니다. 다시 시도해주세요.');
        }
      });

      postMessageManager.sendMessageToReactNative('launchGoogleSheetAuth');
    } catch (error) {
      console.error('구글 스프레드시트 불러오기 실패:', error);
      alert('구글 스프레드시트 불러오기에 실패했습니다. 다시 시도해주세요.');
    }
  }, [popNewBottomSheet, showUploadGoogleSheetNewBottomSheet, userProfile]);

  /**
   * 퀴즐렛 데이터 업로드
   */
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

  /**
   * 엑셀 파일 업로드
   */
  const showExcelUploadBottomSheet = useCallback(async () => {
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

      // 현재 바텀시트 닫기
      popNewBottomSheet();
      // Excel 업로드 바텀시트 열기
      showUploadExcelNewBottomSheet();
    } catch (error) {
      console.error('단어장 개수 체크 실패:', error);
      alert('단어장 개수 확인에 실패했습니다. 다시 시도해주세요.');
    }
  }, [popNewBottomSheet, showUploadExcelNewBottomSheet, userProfile]);

  /**
   * CSV 파일 업로드
   */
  const showCsvUploadBottomSheet = useCallback(async () => {
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

      // 현재 바텀시트 닫기
      popNewBottomSheet();
      // CSV 업로드 바텀시트 열기
      showUploadCsvNewBottomSheet();
    } catch (error) {
      console.error('단어장 개수 체크 실패:', error);
      alert('단어장 개수 확인에 실패했습니다. 다시 시도해주세요.');
    }
  }, [popNewBottomSheet, showUploadCsvNewBottomSheet, userProfile]);

  const menuItems = [
    {
      id: 'load-google-sheets',
      text: '구글 스프레트 시트 불러오기',
      icon: Table,
      onClick: () => {
        vibrate({ duration: 5 });
        showGoogleSheetUpload();
      }
    },
    {
      id: 'load-excel',
      text: 'EXCEL 파일 불러오기',
      icon: FileXls,
      onClick: () => {
        vibrate({ duration: 5 });
        showExcelUploadBottomSheet();
      }
    },
    {
      id: 'load-csv',
      text: 'CSV 파일 불러오기',
      icon: FileCsv,
      onClick: () => {
        vibrate({ duration: 5 });
        showCsvUploadBottomSheet();
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
    <div className="flex flex-col gap-[30px] items-center p-[20px] pb-[40px] bg-white dark:bg-layout-black">
      {/* Header */}
      <h1 className="text-[18px] font-bold text-layout-black dark:text-layout-white text-center tracking-[-0.36px]">
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
                                bg-layout-white dark:bg-[#1A1A1A]
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


