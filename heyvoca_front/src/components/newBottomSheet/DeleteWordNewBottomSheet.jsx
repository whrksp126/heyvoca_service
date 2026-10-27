import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { vibrate } from '../../utils/osFunction';

const DeleteWordNewBottomSheet = ({ vocabularyId, id, bookTitle, otherBookCount = 0 }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { deleteWord } = useVocabulary();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { resolveNewBottomSheet } = useNewBottomSheetActions();
  // 삭제 클릭 시    
  const handleDelete = async () => {
    await deleteWord(vocabularyId, id);
    resolveNewBottomSheet({ cancelled: false });
  };
  // 취소 클릭 시
  const handleCancel = () => {
    resolveNewBottomSheet({ cancelled: true });
  };
  return (
    <div className="">
      <div className="
        flex flex-col gap-[15px] items-center justify-center 
        pt-[40px] px-[20px] pb-[10px]
      ">
        <h3 className="text-layout-black dark:text-layout-white text-[18px] font-[700] text-center">
          {bookTitle ? `'${bookTitle}'에서 뺄까요?` : '단어장에서 뺄까요?'}
        </h3>
        {/* 다른 단어장에도 있으면 이 단어장에서만 빠지고 학습 기록은 남는다(VocabularyContext.deleteWord) */}
        <p className="text-layout-black dark:text-layout-white text-[14px] font-[400] text-center">
          {otherBookCount > 0
            ? '다른 단어장에 있는 같은 단어와 학습 기록은 그대로 남아요.'
            : '이 단어의 학습 기록도 함께 지워지고 되돌릴 수 없어요.'}
        </p>
      </div>
      <div className="flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button
          className="
            flex-1
            h-[52px]
            rounded-[12px]
            text-[16px] font-[700] tracking-[-0.03em]
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
          onClick={() => {
            vibrate({ duration: 5 });
            handleCancel();
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
            h-[52px]
            rounded-[12px]
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700] tracking-[-0.03em]
          "
          onClick={() => {
            vibrate({ duration: 5 });
            handleDelete();
          }}
          whileTap={{ scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 15
          }}
        >빼기</motion.button>
      </div>
    </div>
  );
};

export default DeleteWordNewBottomSheet;