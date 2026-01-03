import React from 'react';
import { motion, AnimatePresence } from "framer-motion";
// import { useFullSheet } from '../../context/FullSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useVocabulary } from '../../context/VocabularyContext';
// import VocabularySheet from './VocabularySheet';
import VocabularySheetNewFullSheet from '../newFullSheet/VocabularySheetNewFullSheet';
// import TestSetup from './TestSetup';
import { LearningInfoNewBottomSheet } from '../newBottomSheet/LearningInfoNewBottomSheet';
import { MAX_TEST_VOCABULARY_COUNT, MIN_TEST_VOCABULARY_COUNT, updateSM2 } from '../../utils/common';
import { Brain, Lightbulb } from "@phosphor-icons/react";
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNavigate } from 'react-router-dom';
import { vibrate } from '../../utils/osFunction';

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const navigate = useNavigate();
  // const word = {
  //   id: '1', // 사용자 단어장 데이터 기준 단어 ID,
  //   dictionaryId : 1, // 헤이보카 사전의 단어 ID, 없으면 null
  //   origin: 'apple', // 학습할 단어
  //   meanings: ['사과', '빨간 사과', '빨간 비닐봉지 안에 있는 사과'], // 학습할 단어의 뜻
  //   examples: [{ // 학습할 단어의 예시 리스트
  //     origin: 'I eat an apple every day.', // 학습할 단어의 예시
  //     meaning: '나는 매일 사과를 먹는다.' // 학습할 단어의 예시의 뜻
  //   }],
  //   ef: 2.5,
  //   repetition: 0,
  //   interval: 0,
  //   nextReview: null,
  //   createdAt: new Date('2024-01-01').toISOString(), // 단어 등록 일자
  //   updatedAt: new Date('2024-01-01').toISOString(), // 단어 수정 일자
  // };
  // const q = 5; // 사용자 선택: easy
  // const today = new Date("2025-05-01");
  // const updated = updateSM2(word, q, today);

  // const { pushFullSheet } = useFullSheet();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { vocabularySheets, isVocabularySheetsLoading, recentStudy } = useVocabulary();
  const { pushNewBottomSheet, clearStack: clearNewBottomSheetStack, popNewBottomSheet } = useNewBottomSheetActions();

  // React Compiler가 자동으로 useCallback 처리
  const handleStartClick = (testType) => {
    console.log("???testType", testType);
    const isLearning = recentStudy[testType]?.status === "learning";
    if(isLearning){
      // 이어학습 유무 확인
      pushNewBottomSheet(
        LearningInfoNewBottomSheet,
        {
          testType,
          onCancel: (props) => {
            console.log("onCancel", props);
            popNewBottomSheet();
            setTimeout(() => {
              pushNewFullSheet(VocabularySheetNewFullSheet, { testType }, {
                smFull: true,
                closeOnBackdropClick: true
              });
            }, 300);
          },
          onSet: (props) => {
            console.log("onStartTest", props);
            clearNewBottomSheetStack();
            navigate('/take-test', {
              state: {
                testType: props.testType
              }
            });
          }
        },
        {
          isBackdropClickClosable: false,
          isDragToCloseEnabled: true
        }
      );
      return;
    }else{

      pushNewFullSheet(VocabularySheetNewFullSheet, { testType }, {
        smFull: true,
        closeOnBackdropClick: true
      });
  
    }

    return;




    // if(type === 'all') {
    //   const maxVocabularyCount = vocabularySheets.slice(0, MAX_TEST_VOCABULARY_COUNT).reduce((sum, sheet) => sum + sheet.words.length, 0);
    //   if(maxVocabularyCount < MIN_TEST_VOCABULARY_COUNT) return alert(`전체 단어 개수가 부족해요. 최소 ${MIN_TEST_VOCABULARY_COUNT}개 이상 필요합니다.`);
    //   pushFullSheet({
    //     component: <TestSetup maxVocabularyCount={maxVocabularyCount} />
    //   });
    // } else {
    //   pushFullSheet({
    //     component: <VocabularySheet />
    //   });
    // }
  }

  return (
    <motion.div 
      className="p-[16px]"
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      <ul className="flex flex-col gap-[20px]">
        <li className="
          flex flex-col items-center justify-center gap-[30px]
          p-[30px] pt-[40px]
          border-[1px] border-[#FF8DD4] rounded-[12px]
          bg-[#FFEFFA]
        ">
          <div className="
            flex flex-col items-center justify-center gap-[10px]
          ">
            <h2 className="
              flex items-center gap-[8px]
              text-[22px] font-[700] text-[#111]
            ">
              <div className="
                flex items-center justify-center
                w-[22px] h-[22px]
                rounded-[5px]
                text-[#fff]
                bg-[#FF8DD4]
              ">
                <Brain size={12} weight="fill" />
              </div>
              학습
            </h2>
            <p 
              className="
                text-[13px] font-[400] text-[#111] text-center
              "
            >자주 틀리거나<br />잊어버린 단어 위주로 복습해요!</p>
          </div>
          <motion.button 
            className="
              flex items-center justify-center
              w-full h-[45px]
              rounded-[8px]
              bg-[#FF8DD4]
              text-[#fff] text-[17px] font-[700]
            "
            whileTap={{ scale: 0.96, boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)' }}
            onClick={() => {
              vibrate({ duration: 5 });
              handleStartClick('test');
            }}
          >
            시작하기
          </motion.button>
        </li>
        <li className="
          flex flex-col items-center justify-center gap-[30px]
          p-[30px] pt-[40px]
          border-[1px] border-[#CD8DFF] rounded-[12px]
          bg-[#F6EFFF]
        ">
          <div className="
            flex flex-col items-center justify-center gap-[10px]
          ">
            <h2 className="
              flex items-center gap-[8px]
              text-[22px] font-[700] text-[#111]
            ">
              <div className="
                flex items-center justify-center
                w-[22px] h-[22px]
                rounded-[5px]
                text-[#fff]
                bg-[#CD8DFF]
              ">
                <Lightbulb size={12} weight="fill" />
              </div>
              테스트
            </h2>
            <p 
              className="
                text-[13px] font-[400] text-[#111] text-center
              "
            >나의 단어 실력을<br />테스트로 점검해보세요!</p>
          </div>
          <motion.button 
            className="
              flex items-center justify-center
              w-full h-[45px]
              rounded-[8px]
              bg-[#CD8DFF]
              text-[#fff] text-[17px] font-[700]
            "
            whileTap={{ scale: 0.96, boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)' }}
            onClick={() => {
              vibrate({ duration: 5 });
              handleStartClick('exam');
            }}
          >
            시작하기
          </motion.button>
        </li>

        {/* 
        <li className="
          flex flex-col items-center justify-center gap-[30px]
          p-[30px] pt-[40px]
          border-[1px] rounded-[12px]
        "
          style={{
            background: 'linear-gradient(160deg,rgba(255, 239, 250, 1) 10%, rgba(246, 239, 255, 1) 50%, rgba(246, 239, 255, 1) 90%)',
            border: '1px solid transparent',
            backgroundImage: 'linear-gradient(160deg,rgba(255, 239, 250, 1) 10%, rgba(246, 239, 255, 1) 50%, rgba(246, 239, 255, 1) 90%), linear-gradient(160deg,rgba(255, 141, 212, 1) 5%, rgba(205, 141, 255, 1) 50%, rgba(116, 213, 255, 1) 95%)',
            backgroundOrigin: 'border-box',
            backgroundClip: 'padding-box, border-box'
          }}
        >
          <div className="
            flex flex-col items-center justify-center gap-[10px]
          ">
            <h2 className="
              flex items-center gap-[8px]
              text-[22px] font-[700] text-[#111]
            ">
              <div 
                className="
                  flex items-center justify-center
                  w-[22px] h-[22px]
                  rounded-[5px]
                  text-[#fff] text-[10px] font-[700]
                "
                style={{ background: 'linear-gradient(160deg,rgba(255, 141, 212, 1) 10%, rgba(205, 141, 255, 1) 50%, rgba(116, 213, 255, 1) 90%)' }}
              >
                All
              </div>
              테스트
            </h2>
            <p 
              className="
                text-[13px] font-[400] text-[#111] text-center
              "
            >
              나의 단어 실력을<br />
              테스트로 점검해보세요!
              </p>
          </div>
          <motion.button 
            className="
              flex items-center justify-center
              w-full h-[45px]
              rounded-[8px]
              text-[#fff] text-[17px] font-[700]
            "
            style={{ background: 'linear-gradient(160deg,rgba(255, 141, 212, 1) 10%, rgba(205, 141, 255, 1) 50%, rgba(116, 213, 255, 1) 90%)' }}
            whileTap={{ scale: 0.96, boxShadow: '0 0 10px rgba(0, 0, 0, 0.2)' }}
            onClick={() => handleStartClick('all')}
          >
            시작하기
          </motion.button>
        </li>
        */}
        
      </ul>
    </motion.div>
  );
};

export default Main; 