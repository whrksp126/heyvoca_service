import React, { useCallback, useMemo } from 'react';
import { Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useBottomSheet } from '../../context/BottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';

export const useBookStoreBottomSheet = (bookStoreId) => {
  const { showBottomSheet, handleBack } = useBottomSheet();
  const { bookStore, isBookStoreLoading, addVocabularySheet} = useVocabulary();

  const selectedBookStoreVocabulary = useMemo(() => {
    if (!bookStore || !bookStoreId) return null;
    return bookStore.find(book => book.id === bookStoreId);
  }, [bookStore, bookStoreId, isBookStoreLoading]);
  
  const handleClose = useCallback(() => {
    handleBack();
  }, [handleBack]);

  const handleAdd = useCallback(async (data) => {
    try {
      // await addVocabularySheet(newVocabularySheet);
      handleClose();
    } catch (error) {
      console.error('단어장 추가 실패:', error);
    }
  }, [handleClose, addVocabularySheet]);

  const handleAddBookStoreVocabularySheet = useCallback(() => {
    showBottomSheet(
      <AddBookStore id={bookStoreId} onCancel={handleClose} onSet={handleAdd} />,
      { isBackdropClickClosable: false, isDragToCloseEnabled: true }
    );
  }, [handleClose, showBottomSheet]);


  const showBookStorePreviewBottomSheet = useCallback(() => {

    showBottomSheet(
      <PreviewBookStore 
        onCancel={handleClose}
        onSet={handleAddBookStoreVocabularySheet}
      />,
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: true
      }
    );
  }, [handleClose, handleAdd]);

  const showBookStoreAddBottomSheet = useCallback(() => {
    showBottomSheet(
      <AddBookStore id={bookStoreId} onCancel={handleClose} onSet={handleAdd} />,
      { isBackdropClickClosable: false, isDragToCloseEnabled: true }
    );
  }, [handleClose, showBottomSheet]);

  return {
    showBookStorePreviewBottomSheet,
    showBookStoreAddBottomSheet,
  };
};

const PreviewBookStore = ({onCancel, onSet }) => {
  return (
    <div className="">
      <div>
        <div className="left"></div>
        <div className="
          flex items-center justify-center
          p-[20px] pb-[0px]
          ">
          <h1 className="text-[18px] font-[700]">단어장 미리보기</h1>
        </div>
        <div className="right"></div>
      </div>
      <div className="
        flex flex-col gap-[30px]
        p-[20px]
      ">
        <div>top</div>
        <div>middle</div>
        <div>bottom</div>
      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onCancel}
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
            bg-[#FF8DD4]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onSet}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >추가</motion.button>
      </div>
    </div>
  );
}; 

const AddBookStore = ({ onCancel, onSet }) => {
  return (
    <div className="">
      <div className="
        flex flex-col gap-[15px] items-center justify-center 
        pt-[40px] px-[20px] pb-[10px]
      ">
        <h3 className="text-[18px] font-[700]">
          '토익 준비용 🔥'을 내 단어장에 추가하시겠어요?
        </h3>
        <p className="text-[14px] font-[400] text-[#111]">
        추가 후에는 내 단어장에서 수정 가능해요 😉
        </p>
      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button 
          className="
            flex-1
            h-[45px]
            rounded-[8px]
            bg-[#ccc]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onCancel}
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
            bg-[#FF8DD4]
            text-[#fff] text-[16px] font-[700]
          "
          onClick={onSet}
          whileTap={{ scale: 0.95 }}
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 15
          }}
        >삭제</motion.button>
      </div>
    </div>
  );
};