import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, BoxArrowDown } from '@phosphor-icons/react';
import { useLevelBookListBottomSheet } from './BookStoreBottomSheet';
import { backendUrl, fetchDataAsync } from '../../utils/common';
const Step4 = ({setStep, userProfile, setUserProfile}) => {
  const [levelBookList, setLevelBookList] = useState([]);
  const [isLevelBookListLoading, setIsLevelBookListLoading] = useState(true);
  const { showVocabularySheetPreviewBottomSheet } = useLevelBookListBottomSheet();

  useEffect(() => {
    getLevelBookList();
  }, []);

  const getLevelBookList = async () => {
    const url = `${backendUrl}/login/level_book_list`;
    const method = 'GET';
    const fetchData = {level: userProfile.level};
    const result = await fetchDataAsync( url, method, fetchData );
    if(result.code == 200){
      setLevelBookList(result.data);
      setIsLevelBookListLoading(false);
    }
  }

  const addVocabularySheet = (vocabularySheet) => {
    setUserProfile({
      ...userProfile,
      vocabook: vocabularySheet,
    });
    setStep(5);
  }

  const handleBookStoreClick = (index) => {
    console.log(levelBookList[index]);
    showVocabularySheetPreviewBottomSheet(levelBookList[index], addVocabularySheet);
  };

  const handleBackBtn = () => {
    setStep(3);
  }

  if (isLevelBookListLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="
      flex flex-col items-center justify-between 
      w-full h-screen 
      p-[20px]
      bg-[#fff]
    ">
      <div></div>
      <div className="
        flex flex-col items-center
        gap-[10px]
      ">
        <div 
          className="
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
        <ul className="grid grid-cols-2 gap-[15px]">
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
      <div className="
        flex flex-col items-center gap-[15px]
        w-full
      ">
        <button
          className="
            w-full h-[50px]
            rounded-[8px]
            bg-[#CCC]
            text-[#FFF] font-[16px] font-[700]
          "
          onClick={handleBackBtn}
        >레벨 다시 선택하기</button>

      </div>
    </div>
  );
};

export default Step4;
