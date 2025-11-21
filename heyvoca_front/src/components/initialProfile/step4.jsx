import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, BoxArrowDown } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { InitialProfilePreviewBookStoreNewBottomSheet } from '../newBottomSheet/InitialProfileBookStoreNewBottomSheet';
import { backendUrl, fetchDataAsync } from '../../utils/common';
import { useVocabulary } from '../../context/VocabularyContext';

const Step4 = ({setStep, userInitialProfile, setUserInitialProfile}) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [levelBookList, setLevelBookList] = useState([]);
  const [isLevelBookListLoading, setIsLevelBookListLoading] = useState(true);
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewBottomSheet, popNewBottomSheet } = useNewBottomSheetActions();
  const { getBookStoreVocabularySheet } = useVocabulary();
  useEffect(() => {
    getLevelBookList();
  }, []);

  // React Compiler가 자동으로 useCallback 처리
  const getLevelBookList = async () => {
    const url = `${backendUrl}/auth/level_book_list`;
    const method = 'GET';
    const fetchData = {level: userInitialProfile.level};
    const result = await fetchDataAsync( url, method, fetchData, false, null );
    if(result.code == 200){
      const levelBookList = result.data.map((item)=>{
        const bookId = item.id
        const vocabularySheet = getBookStoreVocabularySheet(bookId)
        return {
          ...item,
          ...vocabularySheet
        }
      })
      setLevelBookList(levelBookList);
      setIsLevelBookListLoading(false);
    }
  }

  // React Compiler가 자동으로 useCallback 처리
  const addVocabularySheet = (vocabularySheet) => {
    setUserInitialProfile({
      ...userInitialProfile,
      vocabook: vocabularySheet,
    });
    popNewBottomSheet();
    setStep(5);
  }

  // React Compiler가 자동으로 useCallback 처리
  const handleBookStoreClick = (index) => {
    pushNewBottomSheet(
      InitialProfilePreviewBookStoreNewBottomSheet,
      {
        vocabularySheet: levelBookList[index],
        onSet: addVocabularySheet
      },
      {
        isBackdropClickClosable: true,
        isDragToCloseEnabled: false
      }
    );
  };

  const buttonVariants = {
    hover: {
      scale: 1.02,
      backgroundColor: "#FF7AC4",
      boxShadow: "0 4px 8px rgba(0,0,0,0.1)"
    },
    tap: {
      scale: 0.98,
      backgroundColor: "#FF6AB4"
    }
  };

  if (isLevelBookListLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <>
    <div className="bg-[#fff]" style={{ paddingTop: 'var(--status-bar-height)' }}></div>
    <div className="
      flex flex-col items-center justify-between gap-[20px]
      w-full h-[calc(100vh-var(--status-bar-height))]
      p-[20px]
      bg-[#fff]
    ">
      <div className="
        w-full h-full
        flex flex-col items-center
        gap-[20px]
      ">
        <div 
          className="
            w-full
            px-[15px] py-[12px]
            bg-[#fff]
            rounded-[10px]
            font-[16px] font-[600]
          "
          style={{ boxShadow: '0px 0px 4px 0px rgba(0,0,0,0.15)' }}
        >
          선택하신 레벨에 맞는 단어장을 선물해 드릴게요!<br />
          원하시는 단어장 하나를 선택해주세요.
        </div>
        <ul className="grid grid-cols-2 gap-[15px] w-full">
          {levelBookList.map((item, index) => {return (
          <motion.li
            key={item.id}
            style={{ backgroundColor: item.color.background }}
            className={`
              flex flex-col gap-[15px] justify-between
              p-[20px]
              rounded-[12px]
              cursor-pointer
              shadow-sm
              aspect-square
              w-full
            `}
            whileTap={{ scale: 0.96}}
            whileHover={{ scale: 1.04}}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            onClick={() => {
              handleBookStoreClick(index)
            }}
          >
            <div className="flex flex-col gap-[5px]">
              {item.category && (
                <div 
                  style={{ backgroundColor: item.color.main }}
                  className={`
                    flex items-center justify-center
                    w-[max-content]
                    px-[6px] py-[3px]
                    rounded-[20px]
                    text-[8px] font-[700] text-[#fff]
                  `}
                >{item.category}</div>
              )}
              <h2 className="font-[700] text-[16px] text-[#111]">{item.name}</h2>
            </div>
            <div className="flex items-end justify-between">
              <span className="flex items-center gap-[2px] text-[10px] text-[#999]">
                <BoxArrowDown size={12} /> {item.downloads}
              </span>
              <div 
                style={{ 
                  color: item.color.main,
                  backgroundColor: item.color.sub
                }} 
                className={`
                  flex items-center justify-center 
                  w-[30px] h-[30px] 
                  rounded-[50px] 
                  text-[16px]
                `}
              >
                <Plus />
              </div>
            </div>
          </motion.li>
          )})}
        </ul>
      </div>
      <motion.button
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 17
        }}
        className="
          w-full h-[45px]
          bg-[#CCCCCC]
          rounded-[8px]
          text-[#FFFFFF] font-[16px] font-[700]
        "
        onClick={() => setStep(3)}
      >
        레벨 다시 선택하기
      </motion.button>
    </div>
    </>
  );
};

export default Step4;
