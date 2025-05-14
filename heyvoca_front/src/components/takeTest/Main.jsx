import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVocabulary } from '../../context/VocabularyContext';
import { Circle, X } from "@phosphor-icons/react";
import { getTextSound } from '../../utils/common';

const Main = ({ testQuestions, progressIndex, setProgressIndex }) => {
  const [isCorrect, setIsCorrect] = useState(null);
  const [userSelected, setUserSelected] = useState(null);
  const [isTestComplete, setIsTestComplete] = useState(false);
  const [progressBarIndex, setProgressBarIndex] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);

  // 문제가 변경될 때마다 텍스트 읽기
  useEffect(() => {
    if (testQuestions[progressIndex]) {
      const question = testQuestions[progressIndex];
      const textToRead = question.initialViewType === "origin" 
        ? question.origin 
        : question.meanings.join(", ");
      const lang = question.initialViewType === "origin" ? "en" : "ko";
      getTextSound(textToRead, lang);
    }
  }, [progressIndex, testQuestions]);

  const handleOptionClick = (index, option) => {
    if (isTestComplete || isAnswered) return;
    
    setIsAnswered(true);
    setUserSelected(index);
    const resultIndex = testQuestions[progressIndex].resultIndex;
    
    // 정답/오답 설정과 동시에 프로그레스바 증가
    if(resultIndex === index){
      setIsCorrect(true);
    }else{
      setIsCorrect(false);
    }
    setProgressBarIndex(progressBarIndex + 1);

    if(progressIndex === testQuestions.length-1){
      // 마지막 문제일 경우
      setIsTestComplete(true);
      // 결과 표시 시간 후 테스트 종료
      setTimeout(() => {
        alert("테스트 완료");
      }, 1000);
    } else {
      // 마지막 문제가 아닐 경우
      setTimeout(() => {
        setProgressIndex(progressIndex + 1);
        setIsCorrect(null);
        setUserSelected(null);
        setIsAnswered(false);
      }, 1000);
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
                    flex items-center justify-center
                    w-full h-full
                    rounded-[12px]
                    bg-[#FFEFFA]
                    ${isCorrect === true ? "bg-[#E4FFE8]" : ""}
                    ${isCorrect === false ? "bg-[#FFEBEC]" : ""}
                  `}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="
                    absolute top-[50%] left-[50%] z-[0]
                    translate-x-[-50%] translate-y-[-50%]
                  ">
                    {isCorrect === true && 
                      <Circle size={150} weight="bold" className="text-[#17E93780]" />
                    }
                    {isCorrect === false && 
                      <X size={150} weight="bold" className="text-[#FF585B80]" />
                    }
                  </div>
                  <h2 className="
                    z-[1]
                    max-w-[90%]
                    text-[28px] font-[700] text-[#111] text-center
                  ">
                    {testQuestions[progressIndex].initialViewType === "origin" 
                      ? testQuestions[progressIndex].origin 
                      : testQuestions[progressIndex].initialViewType === "meanings" 
                        ? testQuestions[progressIndex].meanings.join(", ") 
                        : ""}
                  </h2>
                </motion.div>
                <div className="
                  flex flex-col gap-[10px]
                ">
                  {testQuestions[progressIndex].options.map((option, index) => (
                    <motion.button 
                      key={index}
                      whileTap={{ 
                        scale: 0.93,
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
                        p-[20px]
                        border-[1px] rounded-[10px]
                        text-[14px] font-[700]
                        ${!isAnswered ? 'border-[#FF8DD4] text-[#111]' : ''}
                        ${userSelected === index && isCorrect === true ? "bg-[#FF8DD4] text-[#fff] border-[#FF8DD4]" : ""}
                        ${userSelected === index && isCorrect === false ? "border-[#FF585B] text-[#FF585B] bg-[#FFEBEC]" : ""}
                        ${isAnswered && userSelected !== index && index === testQuestions[progressIndex].resultIndex && isCorrect === false 
                          ? "border-[#17E937] text-[#17E937] bg-[#E4FFE8]" 
                          : ""}
                        ${isAnswered && userSelected !== index && index !== testQuestions[progressIndex].resultIndex 
                          ? "border-[#FF8DD4] text-[#111]" 
                          : ""}
                      `}
                    >
                      {testQuestions[progressIndex].initialViewType === "origin" 
                        ? option.meanings.join(", ")
                        : option.origin}
                    </motion.button>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default Main; 