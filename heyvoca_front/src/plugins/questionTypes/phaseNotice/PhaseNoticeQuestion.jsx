import React from 'react';
import { motion } from 'framer-motion';
import { PencilSimpleLine, ArrowCounterClockwise } from '@phosphor-icons/react';
import { haptic } from '../../../lib/feel';

/*
  구간 안내 슬라이드(phaseNotice) — 채점 없음(2026-10-02 QA).

  학습 순서가 "일반 문제 → 실전 문장(문장 만들기) → 틀린 문제 복습"으로 나뉘는 자리에
  끼워 넣는 한 장짜리 안내다. 레이아웃은 WordIntroQuestion(wordIntro)과 같은 규격 —
  회색 카드(flex-1) + 하단 "다음" 버튼 — 을 그대로 쓰고 카드 안에는 아이콘 + 두 줄만 둔다.
  Main.jsx는 NO_GRADE_QUESTION_TYPES(wordIntro 등과 같은 목록)에 이 유형이 있으므로
  onComplete를 정오답·로깅을 타지 않는 handleNoGradeNext로 바꿔 넘긴다.

  question.kind — 'sentence'(실전 문장 안내) | 'retry'(오답 복습 안내)
*/

const NOTICE_COPY = {
  sentence: {
    Icon: PencilSimpleLine,
    title: '실전 문장으로 학습해봐요',
    sub: '배운 단어로 문장을 만들어 봐요',
  },
  retry: {
    Icon: ArrowCounterClockwise,
    title: '틀린 문제를 복습해봐요',
    sub: '한 번 더 풀어 확실히 익혀요',
  },
};

const PhaseNoticeQuestion = ({ question, onComplete }) => {
  "use memo";

  const copy = NOTICE_COPY[question?.kind] ?? NOTICE_COPY.sentence;
  const { Icon } = copy;

  const handleNext = () => {
    haptic('light');
    onComplete();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-[14px] px-[24px] bg-layout-gray-50 dark:bg-layout-gray-dark rounded-[12px]">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 1], opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="text-primary-main-600"
        >
          <Icon size={64} weight="duotone" />
        </motion.div>
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="text-[20px] font-[700] tracking-[-0.03em] text-center text-layout-black dark:text-layout-white"
        >
          {copy.title}
        </motion.p>
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="text-[13px] font-[500] text-center text-layout-gray-300"
        >
          {copy.sub}
        </motion.p>
      </div>
      <motion.button
        type="button"
        onClick={handleNext}
        className="mt-[14px] flex-shrink-0 h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em] bg-primary-main-600 text-layout-white"
        whileTap={{ scale: 0.97 }}
      >
        다음
      </motion.button>
    </div>
  );
};

export default PhaseNoticeQuestion;
