import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import HeyCharacter from '../../assets/images/HeyCharacter.png';
// Phase 1.3: finishStudySession 정식 (studySessionRef.current 있으면 항상 호출)
import { finishStudySession } from '../../api/study';

const SaveStudyData = ({ endInitialProfile, studySessionRef }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Phase 1.3: 학습 세션 종료 (정식. studySessionRef.current가 있으면 항상 호출)
  useEffect(() => {
    if (studySessionRef?.current) {
      finishStudySession(studySessionRef.current)
        .catch(e => console.warn('[FSRS] finishStudySession 실패:', e));
    }
  }, []);
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
    <div className="
      flex flex-col items-center justify-center
      w-full h-screen 
      p-[20px]
      bg-primary-main-100 dark:bg-layout-gray-dark
    ">

      <div className="
        flex flex-col items-center
        gap-[10px]
      ">
        <div
          className="
            px-[15px] py-[12px]
            bg-layout-white
            rounded-[10px]
            font-[16px] font-[600]
          "
          style={{ boxShadow: '0px 0px 4px 0px rgba(0,0,0,0.15)' }}
        >
          학습 결과를 저장하고 있습니다! <br />
          잠시만 기다려 주세요!
        </div>
        <img src={HeyCharacter} alt="logo"
          className="
            w-[160px]
          "
        />
      </div>
    </div>
  )
};

export default SaveStudyData;
