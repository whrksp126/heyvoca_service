import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { Circle, X, SpeakerHigh, BookOpenText, WarningCircle, HandsClapping } from "@phosphor-icons/react";
import { getTextSound } from '../../utils/common';
import { useProblemDataBottomSheet } from './ProblemDataBottomSheet';
import { updateSM2, analyzeLearningPattern } from '../../utils/common';
import MemorizationStatus from "../common/MemorizationStatus";


const iconComponentMap = {
  WarningCircle: <WarningCircle size={32} weight="fill" color="#F26A6A" />,
  HandsClapping: <HandsClapping size={32} weight="fill" color="#39E859" />,
}

const Main = ({ testQuestions, setTestQuestions, progressIndex, setProgressIndex, setPendingUpdateSheetIds, testType }) => {

  const [isCorrect, setIsCorrect] = useState(null);
  const [userSelected, setUserSelected] = useState(null);
  const [progressBarIndex, setProgressBarIndex] = useState(progressIndex || 0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isStay, setIsStay] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const startTimeRef = useRef(null);
  const endTimeRef = useRef(null);
  const { showProblemDataBottomSheet } = useProblemDataBottomSheet();
  const { updateWord, updateRecentStudy, recentStudy, setRecentStudy, updateWordState, updateRecentStudyState } = useVocabulary();
  const [isSuspicious, setIsSuspicious] = useState(null);

  const [tempSm2, setTempSm2] = useState(null);

  const navigate = useNavigate();
  // 문제가 변경될 때마다 텍스트 읽기
  useEffect(() => {
    if (testQuestions[progressIndex]) {
      const question = testQuestions[progressIndex];
      const textToRead = question.origin;
      const lang =  "en";
      getTextSound(textToRead, lang);
    }
    startTimeRef.current = Date.now();
    endTimeRef.current = null; // 항상 초기화!
  }, [progressIndex]);

  // 문제 시작 시
  useEffect(() => {

  }, [progressIndex]);

  // 문제 선택지 선택 시
  const handleOptionClick = (index, option) => {
    if (isAnswered) return;
    if(userSelected === index) {
      setUserSelected(null);
    }else{
      setUserSelected(index);
    }
    if(testType === "exam") {
      handleClickExamOption(index, option);
    }
  }

  // 아래 버튼튼 클릭 시
  const handleClickNext = async () => {
    if(userSelected === null) return;
    if(isFetching) return;
    const timeTakenSec = Math.round((endTimeRef.current - startTimeRef.current) / 1000);
    if(isStay){
      if(isSuspicious) return;
      setUpdateRecentStudyStateAndStatus();
      return;
    };
    if (isAnswered) return;
    endTimeRef.current = Date.now();
    const resultIndex = testQuestions[progressIndex].resultIndex;
    // 정답/오답 설정과 동시에 프로그레스바 증가
    let q = 0;
    if(resultIndex === userSelected){
      setIsCorrect(true);
      testQuestions[progressIndex].isCorrect = true;
      testQuestions[progressIndex].userResultIndex = userSelected;
      q = timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : timeTakenSec <= 15 ? 3 : 0
    }else{
      setIsCorrect(false);
      testQuestions[progressIndex].isCorrect = false;
      testQuestions[progressIndex].userResultIndex = userSelected;
      q = 0;
    }
    const learningPattern = analyzeLearningPattern(testQuestions[progressIndex], q);

    if(learningPattern.isSuspicious && learningPattern.confidence === "high"){
      setIsSuspicious({
        ...learningPattern,
        ef: testQuestions[progressIndex].ef,
        interval: testQuestions[progressIndex].interval,
        nextReview: testQuestions[progressIndex].nextReview,
        repetition: testQuestions[progressIndex].repetition
      });
    }

    const newState = updateSM2({
      ef: testQuestions[progressIndex].ef,
      repetition: testQuestions[progressIndex].repetition,
      interval: testQuestions[progressIndex].interval
    }, q);

    Object.assign(testQuestions[progressIndex], newState);
    setProgressBarIndex(progressBarIndex + 1);
    setIsStay(true);
    setIsAnswered(true);
    
  }

  // 시험 모드에서 문제 선택지 선택 시
  const handleClickExamOption = (index, option) => {

    const timeTakenSec = Math.round((endTimeRef.current - startTimeRef.current) / 1000);
    endTimeRef.current = Date.now();
    const resultIndex = testQuestions[progressIndex].resultIndex;
    // 정답/오답 설정과 동시에 프로그레스바 증가
    let q = 0;
    if(resultIndex === index){
      setIsCorrect(true);
      testQuestions[progressIndex].isCorrect = true;
      testQuestions[progressIndex].userResultIndex = index;
      q = timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : timeTakenSec <= 15 ? 3 : 0
    }else{
      setIsCorrect(false);
      testQuestions[progressIndex].isCorrect = false;
      testQuestions[progressIndex].userResultIndex = index;
      q = 0;
    }

    const newState = updateSM2({
      ef: testQuestions[progressIndex].ef,
      repetition: testQuestions[progressIndex].repetition,
      interval: testQuestions[progressIndex].interval
    }, q);

    Object.assign(testQuestions[progressIndex], newState);
    setProgressBarIndex(progressBarIndex + 1);
    setIsAnswered(true);

    setTimeout(() => {
      setUpdateRecentStudyStateAndStatus();
    }, 1000);
  }


  // 이전 기록 유지
  const handleClickMistake = () => {
    Object.assign(testQuestions[progressIndex], {
      ef: isSuspicious.ef,
      interval: isSuspicious.interval,
      nextReview: isSuspicious.nextReview,
      repetition: isSuspicious.repetition
    });
    setIsSuspicious(null);
    setUpdateRecentStudyStateAndStatus();
  }
  // 새로운 기록 적용
  const handleClickNormal = () => {
    setIsSuspicious(null);
    setUpdateRecentStudyStateAndStatus();
  }

  // 문제 읽기
  const handleClickTTS = () => {
    const question = testQuestions[progressIndex];
    const textToRead = question.origin;
    const lang =  "en";
    getTextSound(textToRead, lang);
  }

  // 문제 힌트 데이터 표시
  const handleClickProblemHintData = () => {
    const question = testQuestions[progressIndex];
    showProblemDataBottomSheet({
      options: question.options
    });
  }

  // 문제 완료 시 처리
  const setUpdateRecentStudyStateAndStatus = () => {
    const sheetId = testQuestions[progressIndex].vocabularySheetId;
    const wordId = testQuestions[progressIndex].id;
    setIsFetching(true);

    const updateData = {
      ef: testQuestions[progressIndex].ef,
      repetition: testQuestions[progressIndex].repetition,
      interval: testQuestions[progressIndex].interval,
      nextReview: testQuestions[progressIndex].nextReview,
    }

    updateWordState(sheetId, wordId, updateData);
    setIsFetching(false);
    setPendingUpdateSheetIds(prev => prev.add(sheetId));
    if(progressIndex === testQuestions.length-1){ // 마지막 문제
      updateRecentStudyState({
        ...recentStudy,
        progress_index : null,
        status: "end",
        study_data: testQuestions,
        updated_at : new Date().toISOString(),
      });
    }else{
      updateRecentStudyState({
        ...recentStudy,
        progress_index : progressIndex + 1,
        status: "learning",
        study_data: testQuestions,
        updated_at : new Date().toISOString(),
      });

      
      setProgressIndex(progressIndex + 1);
      setIsCorrect(null);
      setUserSelected(null);
      setIsAnswered(false);
      setIsStay(false);
    }  
  }

  const slideVariants = {
    enter: (direction) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0
    }),
    center: {
      x: 0,
      opacity: 1
    },
    exit: (direction) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0
    })
  };

  return (
    <motion.div 
      className="
        flex flex-col 
        h-[calc(100vh-theme(height.header))]
        px-[16px] pt-[5px] pb-[20px]
      "
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div className="
        relative
        w-full h-[16px]
        mb-[15px]
        rounded-[50px]
        bg-[#FF8DD44d]
      ">
        <motion.div 
          className="
            h-[100%]
            rounded-[50px]
            bg-[#FF8DD4]
          "
          initial={{ width: "0%" }}
          animate={{ 
            width: `${Math.floor((progressBarIndex) / testQuestions.length * 100)}%` 
          }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        />
        {/* <span className="
          absolute top-[50%] right-[10px] translate-y-[-50%]
          text-[#7B7B7B] text-[10px] font-[600]
        ">
          {progressBarIndex}/{testQuestions.length}
        </span> */}
      </motion.div>

      <div className="relative middle flex h-full overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={progressIndex}
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              duration: 0.3,
              ease: "easeInOut"
            }}
            className="flex flex-col gap-[15px] w-full h-full absolute"
          >
            {testQuestions[progressIndex].questionType === "multipleChoice" && (
              <>
                <motion.div 
                  className={`
                    relative
                    flex items-center justify-center flex-1
                    w-full
                    rounded-[12px]
                    bg-[#F5F5F5]
                  `}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  
                  <h2 className="
                    relative z-[1]
                    max-w-[90%]
                    text-[28px] font-[700] text-[#111] text-center
                  ">
                    
                    {/* <div className="
                      absolute bottom-[100%] left-[50%] z-[-1] translate-x-[-50%]
                      text-[12px] font-[400] text-[#7B7B7B]
                    ">
                      <MemorizationStatus repetition={testQuestions[progressIndex].repetition} interval={testQuestions[progressIndex].interval} ef={testQuestions[progressIndex].ef} />
                    </div> */}
                    <div className="
                      absolute top-[50%] left-[50%] z-[-1]
                      translate-x-[-50%] translate-y-[-50%]
                    ">
                      <AnimatePresence>
                        {isCorrect === true && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 500,
                              damping: 20,
                              duration: 0.4
                            }}
                          >
                            <Circle size={150} weight="bold" className="text-[#39E859]" />
                          </motion.div>
                        )}
                        {isCorrect === false && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 500,
                              damping: 20,
                              duration: 0.4
                            }}
                          >
                            <X size={150} weight="bold" className="text-[#F26A6A]" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                    {testQuestions[progressIndex].origin}
                  </h2>
                  <motion.button 
                    onClick={handleClickTTS}
                    whileHover={{ 
                      backgroundColor: 'rgba(204, 204, 204, 0.1)',
                      scale: 1.05
                    }}
                    whileTap={{ 
                      scale: 0.95,
                      backgroundColor: 'rgba(204, 204, 204, 0.2)'
                    }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 400, 
                      damping: 17
                    }}
                    className="
                      absolute bottom-[15px] left-[15px]
                      rounded-[8px] p-[5px]
                      text-[#ccc]
                    "
                  >
                    <SpeakerHigh size={22} weight="fill" />
                  </motion.button>
                  <div className="
                    absolute bottom-[15px] left-[50%] translate-x-[-50%]
                    flex items-center justify-center
                    h-[32px]
                    text-[12px] font-[400] text-[#7B7B7B]
                  ">
                    <MemorizationStatus 
                      key={progressIndex}
                      repetition={testQuestions[progressIndex].repetition} 
                      interval={testQuestions[progressIndex].interval}
                      ef={testQuestions[progressIndex].ef} 
                      isCorrect={isCorrect}
                    />
                  </div>
                  { testType === "test" && isAnswered && (
                  <motion.button 
                    onClick={handleClickProblemHintData}
                    whileHover={{ 
                      backgroundColor: 'rgba(255, 141, 212, 0.1)',
                      scale: 1.05
                    }}
                    whileTap={{ 
                      scale: 0.95,
                      backgroundColor: 'rgba(255, 141, 212, 0.2)'
                    }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 400, 
                      damping: 17
                    }}
                    className="
                      absolute bottom-[15px] right-[15px]
                      rounded-[8px] p-[5px]
                      text-[#FF8DD4]
                    "
                  >
                    <BookOpenText size={22} weight="duotone" />
                  </motion.button>
                  )}

                </motion.div>
                <div className="
                  flex flex-col gap-[10px]
                ">
                  {testQuestions[progressIndex].options.map((option, index) => {
                    let btnStyle = "";
                    if(isCorrect !== null && testQuestions[progressIndex].resultIndex == index){
                      btnStyle = 'border-[#17E937] text-[#17E937] bg-[#E4FFE8]';
                    }else if(isCorrect === false && userSelected === index){
                      btnStyle = 'border-[#FF585B] text-[#FF585B] bg-[#FFEBEC]';
                    }else if(isCorrect === null && userSelected == index){
                      btnStyle = 'border-[#FF8DD4] text-[#FF8DD4]';
                    }else{
                      btnStyle = 'border-[#CCCCCC] text-[#111]';
                    }
                    return (  
                      <motion.button 
                        key={index}
                        whileTap={{ 
                          scale: 0.92,
                          transition: { 
                            type: "spring",
                            stiffness: 400,
                            damping: 17
                          }
                        }}
                        onClick={() => handleOptionClick(index, option)}
                        disabled={isAnswered}
                        className={`
                          flex items-center justify-center
                          w-full h-[50px]
                          px-[20px]
                          border-[1px] rounded-[10px]
                          text-[14px] font-[700]
                          ${btnStyle}
                        `}
                      >
                        {option.meanings.join(", ")}
                      </motion.button>
                    )
                  })}
                  
                </div>
                {testType === "test" && (
                <motion.button 
                  onClick={handleClickNext}
                  whileTap={{ 
                    scale: userSelected !== null ? 0.93 : 1,
                    transition: { 
                      type: "spring",
                      stiffness: 400,
                      damping: 17
                    }
                  }}
                  className={`
                    w-full h-[45px]
                    rounded-[8px]
                    text-[16px] text-[#FFF] font-[700] 
                    ${userSelected !== null ? "bg-[#FF8DD4]" : "bg-[#CCC]"}
                  `}
                >
                  확인
                </motion.button>    
                )}
              </>
            )}
          </motion.div>
          
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {isSuspicious && (
        <motion.div 
          className="
            absolute bottom-0 left-0 right-0
            flex flex-col gap-[30px] items-center justify-end
            h-[210px]
            px-[16px] py-[20px]
            bg-[linear-gradient(180deg,rgba(255,233,233,0)_0%,rgba(255,233,233,.5)_10%,rgba(255,233,233,1)_30%,rgba(255,233,233,1)_100%)]
          "
          initial={{ y: 210 }}
          animate={{ y: 0 }}
          exit={{ y: 210 }}
          transition={{ 
            type: "spring", 
            stiffness: 300, 
            damping: 25,
            duration: 0.5
          }}
        >
          <div className="
            flex flex-col items-center gap-[10px]
            text-[#FFF] text-[14px] font-[700]
          ">
            {iconComponentMap[isSuspicious.icon]}
            <span className="
              text-[#111] text-[16px] font-[600]
            ">
              {isSuspicious.message}
            </span>
            <span className="
              text-[#111] text-[14px] font-[400]
            ">
              암기 상태를 수정하시겠습니까?
            </span>
          </div>
          <div
            className="
              flex items-center justify-between gap-[10px] w-full
            "
          >
            {
              isSuspicious.btn.map((btn, index) => (
                <motion.button 
                  key={index}
                  className={`
                    flex-1
                    h-[45px]
                    rounded-[8px]
                    text-[#fff] text-[16px] font-[700]
                    ${btn.color}
                  `}
                  whileTap={{ scale: 0.95 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 500, 
                    damping: 15
                  }}
                  onClick={btn.type === "mistake" ? handleClickMistake : handleClickNormal}
                >
                  {btn.text}
                </motion.button>
              ))
            }
          </div>
        </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Main; 