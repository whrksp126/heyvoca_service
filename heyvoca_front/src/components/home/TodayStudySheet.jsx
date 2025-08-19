import React, { useEffect } from 'react';
import { useFullSheet } from '../../context/FullSheetContext';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, WarningCircle } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVocabulary } from '../../context/VocabularyContext';
import heyQuestionImg from '../../assets/images/헤이_물음표 1.png';
import speechBubbleTailImg from '../../assets/images/말풍선 꼬리.png';
import { useLearningInfoBottomSheet } from '../class/LearningInfoBottomSheet';
import { useBottomSheet } from '../../context/BottomSheetContext';

const TodayStudy = () => {
  const navigate = useNavigate();
  const { handleBack: handleFullSheetBack, handleReset: handleFullSheetReset, pushFullSheet } = useFullSheet();
  const { handleReset: handleBottomSheetReset, handleBack: handleBottomSheetBack } = useBottomSheet();

  const [wordCount, setWordCount] = React.useState(10);
  const [showWarning, setShowWarning] = React.useState(false);
  const {  recentStudy, updateRecentStudy } = useVocabulary();
  const { showLearningInfoBottomSheet, handleFunction } = useLearningInfoBottomSheet();
  

  useEffect(() => {
    if(recentStudy && recentStudy['today'] && recentStudy['today'].status === "learning") {
      setTimeout(() => {
        showLearningInfoBottomSheet({testType: 'today'});
        handleFunction('onStartTest', (props) => {
          handleFullSheetReset();
          handleBottomSheetBack();
          navigate('/take-test', {
            state: {
              testType: props.testType
            }
          });
        });
  
        handleFunction('onCancel', (props) => {
          handleBottomSheetBack();
        });
      }, 300);
      return;
    }
  }, [recentStudy]);

  const handleStart = async () => {

    await updateRecentStudy('today', {
      ...recentStudy['today'],
      progress_index : null,
      type: 'today',
      status: null,
      study_data: null,
      updated_at : null,
      created_at : null,
    });
    handleFullSheetReset();
    navigate('/take-test', { 
      state: { 
        data: { 
          count : wordCount,
          vocabularySheetId: "all",
          memoryState: "unlearned",
          questionType: "multipleChoice",
        }, 
        testType: 'today'
      } 
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="
        relative
        flex items-center justify-center
        h-[55px] 
        pt-[20px] px-[10px] pb-[14px]
      ">
        
        <motion.button
          onClick={handleFullSheetBack}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
            p-[4px]
            rounded-[8px]
          "
          whileHover={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            scale: 1.05
          }}
          whileTap={{ 
            scale: 0.95,
            backgroundColor: 'rgba(0, 0, 0, 0.1)'
          }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 17
          }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="
          text-[18px] font-[700]
          text-[#111] dark:text-[#fff]
        ">오늘의 학습</h1>
        <div
          className="
            absolute top-[18px] right-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
          "
        >
        </div>
      </div>

      <div className="flex flex-col items-center justify-center h-full gap-[20px] p-[20px]">
        <div className="flex items-center justify-center w-full h-[300px] rounded-[20px]"
        style={{
          background: 'linear-gradient(135deg, rgba(255, 185, 233, 1) 0%, rgba(255, 185, 233, 1) 40%, rgba(255, 221, 242, 1) 100%)',
        }}
        >
          <img src={heyQuestionImg} alt="heyQuestionImg" className="h-[160px]" />
          <div className="flex flex-col gap-[25px]">
            <div className="
               relative 
               px-[15px] py-[12px] mb-[11px] 
               rounded-[10px] 
               bg-[#fff] 
               text-[14px] font-[600] text-[#111]
               shadow-[0px_0px_4px_0px_rgba(0,0,0,0.15)]
             ">
              <span>오늘은 몇 개 단어를<br/>공부해볼까요?</span> 
              <img src={speechBubbleTailImg} alt="speechBubbleTailImg" className="absolute top-[100%] h-[11px]" />
            </div>
            <div className="relative flex justify-end">
              <motion.input 
                type="text" 
                inputMode="numeric"
                value={wordCount} 
                onChange={(e) => {
                  const inputValue = e.target.value.replace(/[^0-9]/g, '');
                  if (inputValue === '') {
                    setWordCount(0);
                    setShowWarning(false);
                  } else {
                    const value = parseInt(inputValue);
                    setWordCount(value);
                    setShowWarning(value < 4 || value > 50);
                  }
                }}
                className= {`
                  w-[120px] h-[45px]
                  pr-[36px]
                  border-[1px] border-[#ccc]
                  rounded-[8px]
                  text-end 
                  text-[24px] font-[700] text-[#FF8DD4]
                  outline-none
                  ${showWarning ? 'border-red-500' : 'border-[#ccc]'}
                `}
                whileFocus={{ 
                  scale: 1.02,
                  boxShadow: "0px 0px 8px rgba(255, 141, 212, 0.3)"
                }}
                animate={{
                  scale: showWarning ? [1, 1.02, 1] : 1,
                  borderColor: showWarning ? "#ef4444" : "#ccc"
                }}
                transition={{
                  scale: { duration: 0.2 },
                  borderColor: { duration: 0.3 }
                }}
              />
              <AnimatePresence>
                {showWarning && (
                  <motion.div 
                    className="absolute top-[100%] right-0 text-start flex justify-start items-start gap-[4px] w-[120px]"
                    initial={{ opacity: 0, y: -10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.9 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <WarningCircle size={14} weight="fill" className="text-red-500" />
                    <span className="text-red-500 text-[12px] font-medium">
                      {wordCount < 4 ? '최소 4개 이상 입력해주세요' : '최대 50개까지만 입력 가능합니다'}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.span 
                className="absolute top-[50%] right-[15px] translate-y-[-50%] text-[16px] font-[700] text-[#111]"
                animate={{
                  color: showWarning ? "#ef4444" : "#111"
                }}
                transition={{ duration: 0.3 }}
              >
                개
              </motion.span>
            </div>
          </div>
        </div>
        <motion.button 
          disabled={showWarning}
          className={`
            w-full h-[50px] rounded-[8px] text-[16px] font-[700]
            ${showWarning ? 'border-[1px] border-[#ccc] text-[#ccc] bg-[transparent] cursor-not-allowed' : 'text-[#fff] bg-[#FF8DD4]'}
          `}
          whileHover={showWarning ? {} : { scale: 1.02 }}
          whileTap={showWarning ? {} : { scale: 0.98 }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 17
          }}
          onClick={handleStart}
        >
          시작하기
        </motion.button>
      </div>
    

    </div>
  );
};

export default TodayStudy; 