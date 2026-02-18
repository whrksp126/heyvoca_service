import React from 'react';
import { Plus, PencilSimple } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
// import { useVocabularySetBottomSheet } from './VocabularyBottomSheet';
import { useVocabularyManageNewBottomSheet } from '../newBottomSheet/VocabularyManageNewBottomSheet';
import { useNewFullSheet } from '../../hooks/useNewFullSheet';
// import UpdateVocabularySheet from './UpdateVocabularySheet';
import UpdateVocabularySheetNewFullSheet from '../newFullSheet/UpdateVocabularySheetNewFullSheet';
import { useUser } from '../../context/UserContext';
import { userBookCntCheckApi } from '../../api/voca';
import { vibrate } from '../../utils/osFunction';

const Header = () => {
  // const { showVocabularySetBottomSheet } = useVocabularySetBottomSheet();
  const { showVocabularyManageNewBottomSheet } = useVocabularyManageNewBottomSheet();
  const { pushNewFullSheet } = useNewFullSheet();
  const { userProfile } = useUser();

  const buttonVariants = {
    tap: {
      scale: 0.85,
      rotate: -8,
      backgroundColor: "rgba(255, 141, 212, 0.2)",
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 15
      }
    }
  };

  const handleAddClick = async () => {
    showVocabularyManageNewBottomSheet();
  };

  const handleEditClick = () => {
    pushNewFullSheet(UpdateVocabularySheetNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  return (
    <div className='
      flex items-center justify-between
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-layout-white 
      dark:bg-layout-black
    '>
      <div className="left">
        <h2
          className="
            text-[16px] font-[400] text-[#000] dark:text-layout-white
          "
        >
          <strong className="
            text-primary-main-600 font-[700]
          ">{userProfile.username}</strong>의 단어장
        </h2>
      </div>
      <div className="center">

      </div>
      <div className="right">
        <div className="btns flex items-center gap-[10px]">
          <motion.button
            className="
            rounded-[20px]
              text-primary-main-600 text-[20px]
            "
            variants={buttonVariants}
            whileTap="tap"
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 15
            }}
            onClick={() => {
              vibrate({ duration: 5 });
              handleEditClick();
            }}
            aria-label="단어장 편집"
          >
            <PencilSimple />
          </motion.button>
          <motion.button
            className="
            rounded-[20px]
              text-primary-main-600 text-[20px]
            "
            variants={buttonVariants}
            whileTap="tap"
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 15
            }}
            onClick={() => {
              vibrate({ duration: 5 });
              handleAddClick();
            }}
            aria-label="새 단어 추가"
          >
            <Plus />
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default Header; 