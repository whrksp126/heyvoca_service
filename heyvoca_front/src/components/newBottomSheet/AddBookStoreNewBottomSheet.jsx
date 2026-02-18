import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { useVocabulary } from '../../context/VocabularyContext';
import StoreNewFullSheet from '../newFullSheet/StoreNewFullSheet';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { deductGemApi } from '../../api/auth';
import { showToast } from '../../utils/osFunction';
import { vibrate } from '../../utils/osFunction';

export const AddBookStoreNewBottomSheet = ({ bookStoreVocabularySheet }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { addBookStoreVocabularySheet } = useVocabulary();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewBottomSheet, clearStack, closeNewBottomSheet } = useNewBottomSheetActions();
  const { getUserProfile, setUserProfile } = useUser();
  const [alertType, setAlertType] = useState(null);
  const { pushNewFullSheet } = useNewFullSheetActions();
  useEffect(() => {
    const userProfile = getUserProfile();
    if (bookStoreVocabularySheet.gem == 0) {
      setAlertType("free");
    } else if (userProfile.gem_cnt < bookStoreVocabularySheet.gem) {
      setAlertType("unavailable");
    } else {
      setAlertType("available");
    }
  }, [bookStoreVocabularySheet])

  // React Compiler가 자동으로 useCallback 처리
  const handleClose = () => {
    if (alertType == "unavailable") {
      closeNewBottomSheet();
    } else {
      popNewBottomSheet();
    }
  };

  const handleSet = async () => {
    if (!alertType) return;
    if (alertType == "unavailable") {
      closeNewBottomSheet();
      pushNewFullSheet(StoreNewFullSheet, {}, {
        smFull: true,
        closeOnBackdropClick: true
      });
      return;
    }
    if (alertType == "available") {
      // 보석 차감 후 단어장 추가
      // 백엔드에서 bookstore_id를 받아서 자동으로 description을 생성함
      const result = await deductGemApi({
        gem_cnt: bookStoreVocabularySheet.gem,
        bookstore_id: bookStoreVocabularySheet.id
      });
      if (!result || result.code != 200) return showToast("보석 차감에 실패했습니다.");
      setUserProfile(prevProfile => ({ ...prevProfile, gem_cnt: result.data.remaining_gem_cnt }));
    }
    try {
      await addBookStoreVocabularySheet(bookStoreVocabularySheet);
      clearStack();
    } catch (error) {
      console.error('단어장 추가 실패:', error);
      const errorMessage = error?.message || '단어장 추가에 실패했습니다.';
      showToast(errorMessage);
    }
  };

  return (
    <div className="">
      <div className="
        flex flex-col gap-[15px] items-center justify-center 
        pt-[40px] px-[20px] pb-[10px]
      ">
        {alertType == "free" &&
          <h3 className="
          text-layout-black dark:text-layout-white text-[18px] font-[700] text-center
          whitespace-normal
          break-words
        ">
            ${bookStoreVocabularySheet.name}을 내 단언 장에 추가하시겠어요?
          </h3>
        }
        {alertType == "unavailable" &&
          <h3 className="
          text-layout-black dark:text-layout-white text-[18px] font-[700] text-center
          whitespace-normal
          break-words
        ">
            보석이 부족합니다.<br />보석을 충전 후 이용해주세요 🥺
          </h3>
        }
        {alertType == "available" &&
          <h3 className="
          text-layout-black dark:text-layout-white text-[18px] font-[700] text-center
          whitespace-normal
          break-words
        ">
            보석 {bookStoreVocabularySheet.gem}개로 ‘{bookStoreVocabularySheet.name}’을 내 단어장에 추가하시겠어요?
          </h3>
        }
        {alertType != "unavailable" &&
          <p className="text-layout-black dark:text-layout-white text-[14px] font-[400]">
            추가 후에는 내 단어장에서 수정 가능해요 😉
          </p>
        }

      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-layout-gray-200
            text-layout-white dark:text-layout-black text-[16px] font-[700]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleClose();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >취소</motion.button>
        <motion.button
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg--primary-main-600
            text-layout-white text-[16px] font-[700]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleSet();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >{alertType == "unavailable" ? "상점으로 이동" : "추가"}</motion.button>
      </div>
    </div>
  );
};