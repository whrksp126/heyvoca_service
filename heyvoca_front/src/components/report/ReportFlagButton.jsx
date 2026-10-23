import React from 'react';
import { motion } from 'framer-motion';
import { Flag } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { ContentReportNewBottomSheet } from '../newBottomSheet/ContentReportNewBottomSheet';
import { holdStudyAdvance } from '../../hooks/useStudyAdvanceGate';
import { isNoGradeQuestionType } from '../../plugins/questionTypes';
import { showToast, vibrate } from '../../utils/osFunction';

/**
 * 학습 화면 헤더 오른쪽의 작은 신고 버튼 — 모든 문제 유형 공통(TakeTest Header 가 그린다).
 *
 * 채점 뒤 자동 전환(utils/studyTiming.js)이 있어 피드백 영역에 버튼을 두면 누르기 전에 넘어간다.
 * 그래서 늘 같은 자리에 두고, 시트가 떠 있는 동안 holdStudyAdvance 로 전환을 멈춘다.
 * 지금 문제를 아직 안 풀었으면 직전에 채점된 문제도 고를 수 있게 넘긴다.
 */
const findPreviousGraded = (questions, index) => {
  for (let i = index - 1; i >= 0; i -= 1) {
    const q = questions[i];
    if (!q || isNoGradeQuestionType(q.questionType)) continue;
    if (q.isCorrect !== null && q.isCorrect !== undefined) return q;
  }
  return null;
};

const ReportFlagButton = ({ testQuestions, progressIndex, testType }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const question = testQuestions?.[progressIndex];
  if (!question) return null;

  const handleClick = async () => {
    vibrate({ duration: 5 });
    const answered = question.isCorrect !== null && question.isCorrect !== undefined;
    const previousQuestion = answered ? null : findPreviousGraded(testQuestions, progressIndex);
    const release = holdStudyAdvance();
    try {
      const res = await pushAwaitNewBottomSheet(
        ContentReportNewBottomSheet,
        { question, previousQuestion, testType },
        { isBackdropClickClosable: true, isDragToCloseEnabled: true }
      );
      if (res?.sent) showToast(res.duplicate ? '이미 받은 신고예요. 고마워요!' : '신고가 전달됐어요. 고마워요!');
    } finally {
      release();
    }
  };

  return (
    <motion.button
      type="button"
      aria-label="오류 신고"
      onClick={handleClick}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className="
        flex items-center justify-center
        w-[32px] h-[32px] rounded-[8px]
        text-layout-gray-200 dark:text-layout-gray-300
      "
    >
      <Flag size={20} />
    </motion.button>
  );
};

export default ReportFlagButton;
