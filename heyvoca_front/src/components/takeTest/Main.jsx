import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { Circle, X, SpeakerHigh, BookOpenText } from "@phosphor-icons/react";
import { getTextSound } from '../../utils/common';
import { useProblemDataBottomSheet } from './ProblemDataBottomSheet';

const Main = ({ testQuestions, progressIndex, setProgressIndex }) => {
  const [isCorrect, setIsCorrect] = useState(null);
  const [userSelected, setUserSelected] = useState(null);
  const [isTestComplete, setIsTestComplete] = useState(false);
  const [progressBarIndex, setProgressBarIndex] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isStay, setIsStay] = useState(false);

  const { showProblemDataBottomSheet } = useProblemDataBottomSheet();

  // 문제가 변경될 때마다 텍스트 읽기
  useEffect(() => {
    console.log("testQuestions", testQuestions);
    // count: 12
    // memoryState: "unlearned"
    // questionType: "multipleChoice"
    // vocabularySheetId: "0fb89232-3e62-48ca-a3a2-04ccb254acd5"
    if (testQuestions[progressIndex]) {
      const question = testQuestions[progressIndex];
      const textToRead = question.origin;
      const lang =  "en";
      // const textToRead = question.initialViewType === "origin" 
      //   ? question.origin 
      //   : question.meanings.join(", ");
      // const lang = question.initialViewType === "origin" ? "en" : "ko";
      getTextSound(textToRead, lang);
    }
  }, [progressIndex, testQuestions]);

  const handleOptionClick = (index, option) => {

    if (isTestComplete || isAnswered) return;
    // setIsAnswered(true);
    if(userSelected === index) {
      setUserSelected(null);
    }else{
      setUserSelected(index);
    }
    
    // const resultIndex = testQuestions[progressIndex].resultIndex;
    
    // // 정답/오답 설정과 동시에 프로그레스바 증가
    // if(resultIndex === index){
    //   setIsCorrect(true);
    // }else{
    //   setIsCorrect(false);
    // }
    // setProgressBarIndex(progressBarIndex + 1);

    // if(progressIndex === testQuestions.length-1){
    //   // 마지막 문제일 경우
    //   setIsTestComplete(true);
    //   // 결과 표시 시간 후 테스트 종료
    //   setTimeout(() => {
    //     alert("테스트 완료");
    //   }, 1000);
    // } else {
    //   // 마지막 문제가 아닐 경우
    //   setTimeout(() => {
    //     setProgressIndex(progressIndex + 1);
    //     setIsCorrect(null);
    //     setUserSelected(null);
    //     setIsAnswered(false);
    //   }, 1000);
    // }
  }

  // 아래 버튼튼 클릭 시
  const handleClickNext = () => {
    if(userSelected === null) return;
    if(isStay){
      if(progressIndex === testQuestions.length-1){ // 마지막 문제

      }else{
        setProgressIndex(progressIndex + 1);
        setIsCorrect(null);
        setUserSelected(null);
        setIsAnswered(false);
        setIsStay(false);
      }
      return;
    }
    if (isTestComplete || isAnswered) return;
    
    setIsAnswered(true);
    
    const resultIndex = testQuestions[progressIndex].resultIndex;
    
    // 정답/오답 설정과 동시에 프로그레스바 증가
    if(resultIndex === userSelected){
      setIsCorrect(true);
    }else{
      setIsCorrect(false);
    }
    setProgressBarIndex(progressBarIndex + 1);
    setIsStay(true);

    // if(progressIndex === testQuestions.length-1){
    //   // 마지막 문제일 경우
    //   setIsTestComplete(true);
    //   // 결과 표시 시간 후 테스트 종료
    //   setTimeout(() => {
    //     alert("테스트 완료");
    //   }, 1000);
    // } else {
    //   // 마지막 문제가 아닐 경우
    //   setTimeout(() => {
    //     setProgressIndex(progressIndex + 1);
    //     setIsCorrect(null);
    //     setUserSelected(null);
    //     setIsAnswered(false);
    //   }, 1000);
    // }
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
                    {/* {testQuestions[progressIndex].initialViewType === "origin" 
                      ? testQuestions[progressIndex].origin 
                      : testQuestions[progressIndex].initialViewType === "meanings" 
                        ? testQuestions[progressIndex].meanings.join(", ") 
                        : ""} */}
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
                  {testQuestions[progressIndex].options.map((option, index) => (
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
                        ${!isAnswered ? 'border-[#CCCCCC] text-[#111]' : ''}
                        ${!isAnswered && userSelected === index ? 'border-[#FF8DD4] text-[#FF8DD4]' : ""}
                        ${isAnswered && userSelected === index && isCorrect === true ? "border-[#17E937] text-[#17E937] bg-[#E4FFE8]" : ""}
                        ${isAnswered && userSelected === index && isCorrect === false ? "border-[#FF585B] text-[#FF585B] bg-[#FFEBEC]" : ""}
                        
                        ${isAnswered && userSelected !== index && index === testQuestions[progressIndex].resultIndex && isCorrect === false 
                          ? "border-[#17E937] text-[#17E937] bg-[#E4FFE8]" 
                          : ""}
                      `}
                    >
                      {option.meanings.join(", ")}
                      {/* {testQuestions[progressIndex].initialViewType === "origin" 
                        ? option.meanings.join(", ")
                        : option.origin} */}
                    </motion.button>
                  ))}
                  
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