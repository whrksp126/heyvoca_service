import React, { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Table, FileCsv, FilePlus, FileXls, FilePdf, FileArrowUp } from '@phosphor-icons/react';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useUploadQuizletNewBottomSheet } from './UploadQuizletNewBottomSheet';
import { useUploadQuizletPdfNewBottomSheet } from './UploadQuizletPdfNewBottomSheet';
import { useUploadExcelNewBottomSheet } from './UploadExcelNewBottomSheet';
import { useUploadCsvNewBottomSheet } from './UploadCsvNewBottomSheet';
import { useUploadGoogleSheetNewBottomSheet } from './UploadGoogleSheetNewBottomSheet';
import { useUploadAnkiNewBottomSheet } from './UploadAnkiNewBottomSheet';
import { useUser } from '../../context/UserContext';
import { userBookCntCheckApi } from '../../api/voca';
import { vibrate, getDevicePlatform, showToast } from '../../utils/osFunction';
import postMessageManager from '../../utils/postMessageManager';
import ImportResultNewBottomSheet from './ImportResultNewBottomSheet';

export const LoadVocabularyNewBottomSheet = () => {
  "use memo";
  const { popNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();
  const { showUploadQuizletNewBottomSheet } = useUploadQuizletNewBottomSheet();
  const { showUploadExcelNewBottomSheet } = useUploadExcelNewBottomSheet();
  const { showUploadCsvNewBottomSheet } = useUploadCsvNewBottomSheet();
  const { showUploadGoogleSheetNewBottomSheet } = useUploadGoogleSheetNewBottomSheet();
  const { showUploadQuizletPdfNewBottomSheet } = useUploadQuizletPdfNewBottomSheet();
  const { showUploadAnkiNewBottomSheet } = useUploadAnkiNewBottomSheet();
  const { userProfile } = useUser();

  // 단어장 개수 체크 — 통과 시 true, 실패 시 결과 시트/토스트로 안내 후 false
  const checkBookCnt = useCallback(async () => {
    try {
      const result = await userBookCntCheckApi();
      if (result?.code !== 200) {
        showToast('단어장 개수 확인에 실패했어요.');
        return false;
      }
      const canAddBook = result?.data?.can_add_book;
      if (!(userProfile.book_cnt > 0 || canAddBook)) {
        pushNewBottomSheet(ImportResultNewBottomSheet, {
          success: false,
          title: '',
          message: '단어장 생성 가능 횟수를 초과했어요.\n보석을 구매하면 더 추가할 수 있어요.',
        });
        return false;
      }
      return true;
    } catch (error) {
      console.error('단어장 개수 체크 실패:', error);
      showToast('단어장 개수 확인에 실패했어요.');
      return false;
    }
  }, [userProfile, pushNewBottomSheet]);

  /**
   * 구글 스프레드시트 불러오기
   */
  const showGoogleSheetUpload = useCallback(async () => {
    if (!(await checkBookCnt())) return;

    const platform = getDevicePlatform();
    if (platform === 'web') {
      pushNewBottomSheet(ImportResultNewBottomSheet, {
        success: false,
        message: '구글 스프레드시트 불러오기는\n앱에서만 사용할 수 있어요.',
      });
      return;
    }

    // 앱에 구글 시트 인증 요청
    postMessageManager.setupGoogleSheetAuth((data) => {
      postMessageManager.removeGoogleSheetAuth();

      if (data.status === 200 && data.accessToken) {
        popNewBottomSheet();
        showUploadGoogleSheetNewBottomSheet(data.accessToken);
      } else {
        showToast('구글 스프레드시트 인증에 실패했어요. 다시 시도해주세요.');
      }
    });

    postMessageManager.sendMessageToReactNative('launchGoogleSheetAuth');
  }, [checkBookCnt, popNewBottomSheet, pushNewBottomSheet, showUploadGoogleSheetNewBottomSheet]);

  const showQuizletUploadBottomSheet = useCallback(async () => {
    if (!(await checkBookCnt())) return;
    popNewBottomSheet();
    showUploadQuizletNewBottomSheet();
  }, [checkBookCnt, popNewBottomSheet, showUploadQuizletNewBottomSheet]);

  const showExcelUploadBottomSheet = useCallback(async () => {
    if (!(await checkBookCnt())) return;
    popNewBottomSheet();
    showUploadExcelNewBottomSheet();
  }, [checkBookCnt, popNewBottomSheet, showUploadExcelNewBottomSheet]);

  const showCsvUploadBottomSheet = useCallback(async () => {
    if (!(await checkBookCnt())) return;
    popNewBottomSheet();
    showUploadCsvNewBottomSheet();
  }, [checkBookCnt, popNewBottomSheet, showUploadCsvNewBottomSheet]);

  const showQuizletPdfUploadBottomSheet = useCallback(async () => {
    if (!(await checkBookCnt())) return;
    popNewBottomSheet();
    showUploadQuizletPdfNewBottomSheet();
  }, [checkBookCnt, popNewBottomSheet, showUploadQuizletPdfNewBottomSheet]);

  const showAnkiUploadBottomSheet = useCallback(async () => {
    if (!(await checkBookCnt())) return;
    popNewBottomSheet();
    showUploadAnkiNewBottomSheet();
  }, [checkBookCnt, popNewBottomSheet, showUploadAnkiNewBottomSheet]);

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
      id: 'load-quizlet-pdf',
      text: '퀴즐렛 PDF 불러오기',
      icon: FilePdf,
      onClick: () => {
        vibrate({ duration: 5 });
        showQuizletPdfUploadBottomSheet();
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
    },
    {
      id: 'load-anki',
      text: 'Anki 단어장 불러오기',
      icon: FileArrowUp,
      onClick: () => {
        vibrate({ duration: 5 });
        showAnkiUploadBottomSheet();
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
