import React from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { ConfirmNewBottomSheet } from '../newBottomSheet/ConfirmNewBottomSheet';
import { vibrate } from '../../utils/osFunction';
import { getQuestionType } from '../../plugins/questionTypes';

// 문제 유형별 안내 문구 — 상단 헤더에 현재 문제가 무엇을 요구하는지 표시. 대부분의 유형은
// 플러그인 레지스트리(plugins/questionTypes/index.js)의 guideTitle을 그대로 쓴다(2026-09-29) —
// 유형을 추가할 때 이 파일을 별도로 고치지 않아도 되게 하기 위함. multipleChoiceDiagnosis는
// 실제 questionType이 아니라 TakeTest.jsx가 isDiagnosis일 때 덮어씌우는 표시용 값이라
// 레지스트리에 없다 — 여기서만 예외로 다룬다.
const DIAGNOSIS_INSTRUCTION = '다시 심기 진단'; // 부패 진단(당근 농장 V2 학습 시안 §6)

const Header = ({ testType, onBackClick, questionType }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { recentStudy } = useVocabulary();
  const navigate = useNavigate();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  const instruction = questionType === 'multipleChoiceDiagnosis'
    ? DIAGNOSIS_INSTRUCTION
    : (getQuestionType(questionType)?.guideTitle || '테스트');

  // 상위에서 전달받은 onBackClick이 있으면 사용, 없으면 기본 동작
  const handleBackClick = async () => {
    if (onBackClick) {
      await onBackClick();
      return;
    }

    navigate(-1);
  };

  return (
    <div
      data-page-header
      className='
      relative
      flex items-end justify-center
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-layout-white
      dark:bg-layout-black
    '>

      <div className="
        absolute left-[10px] bottom-[13px]
        flex items-center justify-center
      ">
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            handleBackClick();
          }}
          className="
            text-layout-gray-200 dark:text-layout-white
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
      </div>
      <div className="center px-[44px]">
        <h2 className='text-[18px] font-[700] leading-[21px] text-center'>
          {instruction}
        </h2>
      </div>
      <div className="right">

      </div>
    </div>
  );
};

export default Header; 