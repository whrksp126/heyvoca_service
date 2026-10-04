import React, { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PROGRESS_FILL_TRANSITION } from '../../utils/studySlideMotion';
import { feel, ShineSweep } from '../../lib/feel';

/**
 * 학습 진행바 — Main.jsx 의 두 렌더 경로(플러그인/사지선다)가 공유한다.
 * 표시 전용: 채움 값(displayPassedCount/totalWordCount)은 utils/studyProgress.js 계산 결과를 그대로 받는다.
 *
 * 【손맛】 칸이 찰 때(채움 애니메이션이 끝난 순간) 채움에 빛줄기가 지나가고 바가 살짝 두꺼워졌다 돌아온다.
 *  이때 feel('progress')(아주 작게). 정답 큐가 350ms 안에 울렸다면 feel() 이 소리·진동을 스스로 생략한다
 *  (시각만 남는다 — 채움이 정답 직후 0.3s 에 끝나므로 보통 시각만 보인다).
 *  마운트 직후(복원·재진입)의 초기 채움은 반짝이지 않는다 — 실제로 값이 늘어난 경우만.
 */
const StudyProgressBar = ({ displayPassedCount, totalWordCount, fillClass }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const reducedMotion = useReducedMotion();
  const pct = Math.floor(displayPassedCount / totalWordCount * 100);
  // 마지막으로 "채움 애니메이션이 끝난" 퍼센트 — 마운트 시점 값으로 시작(초기 채움은 반짝임 제외)
  const settledPctRef = useRef(pct);
  const [sparkKey, setSparkKey] = useState(0);

  const handleFillComplete = () => {
    if (pct > settledPctRef.current) {
      setSparkKey((k) => k + 1);
      feel('progress');
    }
    settledPctRef.current = pct;
  };

  return (
    <motion.div
      key="study-progress-track"
      className="
        relative
        w-full h-[16px]
        mb-[15px]
        rounded-[50px]
        bg-primary-main-100 dark:bg-layout-gray-dark
        overflow-hidden
      "
      animate={sparkKey > 0 && !reducedMotion ? { scaleY: [1, 1.25, 1] } : undefined}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <motion.div
        className={`relative overflow-hidden h-[100%] rounded-[50px] transition-colors duration-300 ${fillClass}`}
        initial={{ width: '0%' }}
        animate={{ width: `${pct}%` }}
        transition={PROGRESS_FILL_TRANSITION}
        onAnimationComplete={handleFillComplete}
        style={{ willChange: 'width' }}
      >
        {sparkKey > 0 && <ShineSweep key={sparkKey} play delay={0} duration={0.5} />}
      </motion.div>
      <span className="
        absolute right-[10px] top-[50%] translate-y-[-50%]
        text-[#7b7b7b] text-[10px] font-semibold tracking-[-0.2px]
      ">
        {displayPassedCount}/{totalWordCount}
      </span>
    </motion.div>
  );
};

export default StudyProgressBar;
