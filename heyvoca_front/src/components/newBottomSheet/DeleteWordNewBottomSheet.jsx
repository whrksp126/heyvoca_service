import React from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';


const DeleteWordNewBottomSheet = ({ vocabularyId, id }) => {
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
        <h3 className="text-[18px] font-[700]">단어을 정말 삭제하시겠어요?</h3>
        <p className="text-[14px] font-[400] text-[#111]">삭제 후에는 복구가 불가능해요 😢</p>
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
          onClick={handleCancel}
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
          onClick={handleDelete}
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

export default DeleteWordNewBottomSheet;