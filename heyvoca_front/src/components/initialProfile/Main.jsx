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
const Main = () => {
  const navigate = useNavigate();
  const { addBookStoreVocabularySheet } = useVocabulary();
  const { setUserProfile, updateUserProfile } = useUser();
  const [step, setStep] = useState(1);
  const [userInitialProfile, setUserInitialProfile] = useState({
    name: null,
    level: null,
    vocabook: null,
  });

  const endInitialProfile = async () => {
    const updates = {
      level_id: userInitialProfile.level,
      username: userInitialProfile.name,
    };
    console.log(userInitialProfile);
    await updateUserProfile(updates);
    console.log("사용자 정보 업데이트 완료")
    await addBookStoreVocabularySheet(userInitialProfile.vocabook);
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
