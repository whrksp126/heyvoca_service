import React from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { ConfirmNewBottomSheet } from '../newBottomSheet/ConfirmNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

// 문제 유형별 안내 문구 — 상단 헤더에 현재 문제가 무엇을 요구하는지 표시.
const QUESTION_INSTRUCTIONS = {
  multipleChoice: '알맞은 뜻을 선택하세요',
  multipleChoiceListening: '듣고 알맞은 뜻을 선택하세요',
  fillInTheBlank: '빈칸에 알맞은 단어를 입력하세요',
  cardMatch: '같은 뜻끼리 짝지어 보세요',
  cardMatchListening: '듣고 같은 카드를 짝지어 보세요',
  // 부패 진단 (당근 농장 V2 학습 시안 §6) — 헤더가 "알맞은 뜻을 선택하세요"가 아니라
  // "다시 심기 진단"으로 바뀌는 것이 이 화면이 일반 학습과 다른 첫 신호다.
  multipleChoiceDiagnosis: '다시 심기 진단',
};

const Header = ({ testType, onBackClick, questionType }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { recentStudy } = useVocabulary();
  const navigate = useNavigate();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  const instruction = QUESTION_INSTRUCTIONS[questionType] || '테스트';

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