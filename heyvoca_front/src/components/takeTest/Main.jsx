import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { Circle, X, SpeakerHigh, BookOpenText } from "@phosphor-icons/react";
import { getTextSound } from '../../utils/common';
import { useProblemDataBottomSheet } from './ProblemDataBottomSheet';
import { updateSM2 } from '../../utils/common';

const Main = ({ testQuestions, progressIndex, setProgressIndex }) => {
  const [isCorrect, setIsCorrect] = useState(null);
  const [userSelected, setUserSelected] = useState(null);
  const [progressBarIndex, setProgressBarIndex] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isStay, setIsStay] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const startTimeRef = useRef(null);
  const endTimeRef = useRef(null);
  const { showProblemDataBottomSheet } = useProblemDataBottomSheet();
  const { updateWord } = useVocabulary();
  // 문제가 변경될 때마다 텍스트 읽기
  useEffect(() => {
    if (testQuestions[progressIndex]) {
      const question = testQuestions[progressIndex];
      console.log("question", question);
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

  const handleOptionClick = (index, option) => {
    if (isAnswered) return;
    if(userSelected === index) {
      setUserSelected(null);
    }else{
      setUserSelected(index);
    }
  }

  // 아래 버튼튼 클릭 시
  const handleClickNext = async () => {
    if(userSelected === null) return;
    if(isFetching) return;
    if(isStay){
      const timeTakenSec = Math.round((endTimeRef.current - startTimeRef.current) / 1000);
      const testQuestion = testQuestions[progressIndex];
      
      const q = isCorrect ? 
        (timeTakenSec <= 5 ? 5 : timeTakenSec <= 10 ? 4 : timeTakenSec <= 15 ? 3 : 0) : 0;
      
      const newState = updateSM2({
        ef: testQuestion.ef,
        repetition: testQuestion.repetition,
        interval: testQuestion.interval
      }, q);
      
      Object.assign(testQuestions[progressIndex], newState);
      const sheetId = testQuestions[progressIndex].vocabularySheetId;
      const wordId = testQuestions[progressIndex].id;
      setIsFetching(true);
      updateWord(sheetId, wordId, newState).then(()=>{
        setIsFetching(false);
      });
      

      if(progressIndex === testQuestions.length-1){ // 마지막 문제
        
      }else{
        
        setProgressIndex(progressIndex + 1);
        setIsCorrect(null);
        setUserSelected(null);
        setIsAnswered(false);
        setIsStay(false);
      }
      return;
    };
    if (isAnswered) return;
    
    endTimeRef.current = Date.now();

    const resultIndex = testQuestions[progressIndex].resultIndex;
    
    // 정답/오답 설정과 동시에 프로그레스바 증가
    if(resultIndex === userSelected){
      setIsCorrect(true);
    }else{
      setIsCorrect(false);
    }
    setProgressBarIndex(progressBarIndex + 1);
    setIsStay(true);
    setIsAnswered(true);
  }

  const handleClickTTS = () => {
    const question = testQuestions[progressIndex];
    const textToRead = question.origin;
    const lang =  "en";
    getTextSound(textToRead, lang);
  }

  const handleClickProblemData = () => {
    const question = testQuestions[progressIndex];
    console.log(question);
    showProblemDataBottomSheet({
      options: question.options
    });
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
                  <div className="
                    absolute top-[50%] left-[50%] z-[0]
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
                  <h2 className="
                    z-[1]
                    max-w-[90%]
                    text-[28px] font-[700] text-[#111] text-center
                  ">
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
                  {isAnswered && (
                  <motion.button 
                    onClick={handleClickProblemData}
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
              </>
            )}
          </motion.div>
          
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default Main; 