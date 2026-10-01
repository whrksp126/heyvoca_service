import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/*
  구간 안내 슬라이드(phaseNotice) — 채점 없음(2026-10-02 QA).

  학습 순서가 "일반 문제 → 실전 문장(문장 만들기) → 틀린 문제 복습"으로 나뉘는 자리에
  끼워 넣는 한 장짜리 안내다. 제목 문구만 보여 주고, 버튼 없이 약 1.8초 뒤 자동으로 다음으로
  넘어간다(아이콘·설명 문구 없음). 타이머는 언마운트(이탈·뒤로가기·다음 슬라이드)시 정리하고,
  애니메이션 유무와 무관하게 setTimeout 으로 동작하므로 reduced-motion 이어도 넘어간다.
  Main.jsx는 NO_GRADE_QUESTION_TYPES에 이 유형이 있으므로 onComplete를 정오답·로깅을 타지 않는
  handleNoGradeNext로 바꿔 넘긴다.

  question.kind — 'sentence'(실전 문장 안내) | 'retry'(오답 복습 안내)
*/

const AUTO_ADVANCE_MS = 1800;

const NOTICE_TITLE = {
  sentence: '실전 문장으로 학습해봐요',
  retry: '틀린 문제를 복습해봐요',
};

const PhaseNoticeQuestion = ({ question, onComplete }) => {
  "use memo";

  const title = NOTICE_TITLE[question?.kind] ?? NOTICE_TITLE.sentence;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      onCompleteRef.current?.();
    }, AUTO_ADVANCE_MS);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, [question?.kind]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 flex items-center justify-center px-[24px] bg-layout-gray-50 dark:bg-layout-gray-dark rounded-[12px]">
        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="text-[20px] font-[700] tracking-[-0.03em] text-center text-layout-black dark:text-layout-white"
        >
          {title}
        </motion.p>
      </div>
    </div>
  );
};

export default PhaseNoticeQuestion;
