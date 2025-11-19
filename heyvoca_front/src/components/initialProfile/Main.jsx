import React, { useRef, useState, useEffect } from 'react';
import { useUser } from '../../context/UserContext';
import { motion, AnimatePresence } from 'framer-motion';
import Step1 from './step1';
import Step2 from './step2';
import Step3 from './step3';
import Step4 from './step4';
import Step5 from './step5';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNavigate } from 'react-router-dom';




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
  const [step, setStep] = useState(1);
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

  const variants = {
    enter: {
      opacity: 0,
      scale: 0.95
    },
    center: {
      opacity: 1,
      scale: 1
    },
    exit: {
      opacity: 0,
      scale: 0.95
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
      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div
            key="step1"
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              top: 0,
              left: 0
            }}
          >
            <Step1 setStep={setStep} setUserProfile={setUserProfile} />
          </motion.div>
        ) : (
          <motion.div
            key={step}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: 0.3,
              ease: "easeInOut"
            }}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              top: 0,
              left: 0
            }}
          >
            {step === 2 && <Step2 setStep={setStep} userInitialProfile={userInitialProfile} setUserInitialProfile={setUserInitialProfile} />}
            {step === 3 && <Step3 setStep={setStep} userInitialProfile={userInitialProfile} setUserInitialProfile={setUserInitialProfile} />}
            {step === 4 && <Step4 setStep={setStep} userInitialProfile={userInitialProfile} setUserInitialProfile={setUserInitialProfile} />}
            {step === 5 && <Step5 endInitialProfile={endInitialProfile} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Main;
