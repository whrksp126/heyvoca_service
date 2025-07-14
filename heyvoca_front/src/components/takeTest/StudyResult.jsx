import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Circle, X } from '@phosphor-icons/react';
import { useVocabulary } from '../../context/VocabularyContext';

const StudyResult = () => {
  const {  recentStudy, updateRecentStudy, isRecentStudyLoading } = useVocabulary();
  const navigate = useNavigate();
  const { state } = useLocation();
  const testQuestions = state.testQuestions;

  useEffect(() => {
    if(recentStudy.status ===  "learning") {
      navigate('/class');
    }
  }, [isRecentStudyLoading]);

  const onClickTestAgain = async () => {
    // 요소의 순서를 랜덤으로 섞어서 반환
    // options을 랜덤으로 섞고, 정답의 index(resultIndex)도 새로 계산
    const tempTestQuestions = recentStudy.study_data
      .map((question) => {
        // 기존 정답(원래 options에서 resultIndex로 찾음)
        const correctAnswer = question.options[question.resultIndex];
        // options을 랜덤으로 섞음
        const shuffledOptions = [...question.options].sort(() => Math.random() - 0.5);
        // 섞인 options에서 정답의 index를 다시 찾음
        const newResultIndex = shuffledOptions.findIndex(opt => opt.id === correctAnswer.id);
        return {
          ...question,
          isCorrect: null,
          userResultIndex: null,
          options: shuffledOptions,
          resultIndex: newResultIndex,
        };
      })
      .sort(() => Math.random() - 0.5);
    await updateRecentStudy({
      ...recentStudy,
      status: "learning",
      progress_index: 0,
      study_data: tempTestQuestions,
      updated_at : new Date().toISOString(),
      created_at : new Date().toISOString(),
    })
    navigate('/take-test');
  }

  const onClickEndStudy = async () => {
    navigate('/class');
  }


  return (
    <div className='relative flex flex-col h-[100dvh]'>
      <div className='
        relative
        flex items-end justify-center
        w-full h-[55px]
        px-[16px] py-[14px]
        bg-[#fff] 
        dark:bg-[#111]
      '>
        <div className="center">
          <h2 className='text-[18px] font-[700] leading-[21px]'>
            학습 결과
          </h2>
        </div>
      </div>
      <div className='
        flex flex-col flex-1 gap-[10px] 
        p-[20px] pb-[85px]
        overflow-y-auto
      '>
        {testQuestions.map((question, index) => (
        <div key={index} className={`
          flex flex-col items-center gap-[10px] 
          px-[20px] py-[15px]
          rounded-[12px]
          ${question.isCorrect ? 'bg-[#E4FFE8]' : 'bg-[#FFEBEC]'}  
        `}>
          <div className='flex flex-1 items-center gap-[10px] w-full'>
            {question.isCorrect ? (
              <Circle size={24} weight="bold" className='text-[#17E937]' />
            ) : (
              <X size={24} weight="bold" className='text-[#FF585B]' />
            )}
            <div className='flex flex-col flex-1 gap-[5px]'>
              <h3 className="text-[16px] font-[700]">{question.origin}</h3>
              <p className="text-[12px] font-[400] whitespace-pre-wrap">{question.meanings.map((meaning, index) => (
                meaning + (index !== question.meanings.length - 1 ? ', ' : '')
              )).join(' ')}</p>
            </div>
          </div>
          {/* 서점 단어인 경우 표현 */}
        </div>
        ))}
      </div>
      <div
        className="
          absolute bottom-0 left-0 right-0
          flex items-center justify-between gap-[15px] 
          p-[16px] py-[20px]
        "
        style={{
          background: 'linear-gradient(0deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 1) 25%, rgba(255, 255, 255, .5) 100%)'
        }}
      >
          <motion.button 
            className="
              flex-1
              h-[45px]
              rounded-[8px]
              bg-[#ccc]
              text-[#fff] text-[16px] font-[700]
            "
            onClick={onClickTestAgain}
            whileTap={{ scale: 0.95 }}
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 15
            }}
          >테스트 다시 하기</motion.button>
          <motion.button 
            className="
              flex-1
              h-[45px]
              rounded-[8px]
              bg-[#FF8DD4]
              text-[#fff] text-[16px] font-[700]
            "
            onClick={onClickEndStudy}
            whileTap={{ scale: 0.95 }}
            transition={{ 
              type: "spring", 
              stiffness: 500, 
              damping: 15
            }}
          >학습 종료</motion.button>
      </div>
    </div>
  );
};

export default StudyResult;