import React from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { ConfirmNewBottomSheet } from '../newBottomSheet/ConfirmNewBottomSheet';

const Header = ({ testType }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { recentStudy } = useVocabulary();
  const navigate = useNavigate();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  console.log(recentStudy);

  // React Compiler가 자동으로 useCallback 처리
  const handleBackClick = async () => {
    const ConfirmResult = await pushAwaitNewBottomSheet(
      ConfirmNewBottomSheet,
      {
        title: (
          <>
            학습할 단어가 남아있어요.<br />
            학습을 종료하시겠습니까?😢 
          </>
        ),
        btns: {
          confirm: "종료",
          cancel: "취소",
        }
      },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: true
      }
    );
    if (ConfirmResult) {
      navigate(-1);
    }
    // if (window.confirm('학습을 종료하시겠습니까?')) {
    //   navigate(-1);
    // }
  };

  return (
    <div className='
      relative
      flex items-end justify-center
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-[#fff] 
      dark:bg-[#111]
    '>
      
      <div className="
        absolute left-[10px] bottom-[13px]
        flex items-center justify-center
      ">
        <motion.button
          onClick={handleBackClick}
          className="
            text-[#CCC] dark:text-[#fff]
            rounded-[8px]
          "
          whileHover={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            scale: 1.05
          }}
          whileTap={{ 
            scale: 0.95,
            backgroundColor: 'rgba(0, 0, 0, 0.1)'
          }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 17
          }}
        >
          <CaretLeft size={24} />
        </motion.button>
      </div>
      <div className="center">
        <h2 className='text-[18px] font-[700] leading-[21px]'>
          {testType ===  "today" ? "오늘의 학습" : testType === "test" ? "학습" : "테스트"}
        </h2>
      </div>
      <div className="right">

      </div>
    </div>
  );
};

export default Header; 