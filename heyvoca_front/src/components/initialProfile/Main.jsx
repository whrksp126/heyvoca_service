import React, { useState } from 'react';
import { useUser } from '../../context/UserContext';
import { motion } from 'framer-motion';
import HeyCharacter from '../../assets/images/HeyCharacter.png';
import InitialProfileStep2NewFullSheet from '../newFullSheet/InitialProfileStep2NewFullSheet';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNavigate } from 'react-router-dom';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';




const getColorSet = (mainColor) => {
  switch(mainColor) {
    case '#FF8DD4': return {
        main : "#FF8DD4",
        sub : "#FF8DD44d",
        background : "#FFEFFA"
      };
      case '#CD8DFF': return {
        main : "#CD8DFF",
        sub : "#CD8DFF4d",
        background : "#F8E6FF"
      };
      case '#74D5FF': return {
        main : "#74D5FF",
        sub : "#74D5FF4d",
        background : "#EAF6FF"
      };
      case '#42F98B': return {
        main : "#42F98B",
        sub : "#42F98B4d",
        background : "#E6FFE9"
      };
      case '#FFBD3C': return {
        main : "#FFBD3C",
        sub : "#FFBD3C4d",
        background : "#FFF8E6"
      };
      default: return {
        main : "#FF8DD4",
        sub : "#FF8DD44d",
        background : "#FFEFFA"
      };
  }
};


const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();
  const { addVocabularySheet, updateVocabularySheet } = useVocabulary();
  const { setUserProfile, updateUserProfile } = useUser();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const [userInitialProfile, setUserInitialProfile] = useState({
    name: null,
    level: null,
    vocabook: null,
  });

  // React Compiler가 자동으로 useCallback 처리
  const endInitialProfile = async () => {
    console.log('endInitialProfile', userInitialProfile);
    const updates = {
      level_id: userInitialProfile.level,
      username: userInitialProfile.name,
    };
    await updateUserProfile(updates);
    // 단순 단어장 추가
    const vocabularySheet = await addVocabularySheet({
      title: userInitialProfile.vocabook.name,
      color: getColorSet('#FF8DD4'),
    })

    // 단어장 내 단어 추가
    await updateVocabularySheet(
      vocabularySheet.id,
      {
        words: userInitialProfile.vocabook.words.map((word, index)=>{
          return {
            id : `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${index}`,
            dictionaryId : word.id,
            origin : word.origin,
            meanings : word.meanings,
            examples : word.examples,
            pronunciation : word.pronunciation,
            ef : 2.5,
            repetition : 0,
            interval : 0,
            nextReview : null,
            createdAt : new Date().toISOString(),
            updatedAt : new Date().toISOString(),
          }
        }),
        total: userInitialProfile.vocabook.words.length,
      }
    )


    // await addBookStoreVocabularySheet(userInitialProfile.vocabook);
    console.log("단어장 추가 완료")
    navigate('/');
  }


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

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100vh',
      overflow: 'hidden',
      backgroundColor: '#FFEFFA'
    }}>
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div className="
        flex flex-col items-center justify-between
        w-full h-[calc(100vh-var(--status-bar-height))]
        p-[20px]
        bg-[#FFEFFA]
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
            안녕하세요!<br />
            오늘부터 함께할 헤이라고 해요.
          </div>
          <img src={HeyCharacter} alt="logo" 
            className="
              w-[160px]
            "
          />
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
            bg-[#FF8DD4]
            rounded-[8px]
            text-[#FFFFFF] font-[16px] font-[700]
          "
          onClick={() => {
            // step2를 FullSheet로 직접 열기
            pushNewFullSheet(
              InitialProfileStep2NewFullSheet,
              { userInitialProfile, setUserInitialProfile, endInitialProfile },
              {
                smFull: true,
                closeOnBackdropClick: false,
                isDragToCloseEnabled: false
              }
            );
          }}
        >
          시작하기
        </motion.button>
      </div>
    </div>
  );
};

export default Main;
