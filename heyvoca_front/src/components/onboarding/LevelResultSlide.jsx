// 온보딩 수준 맞춤 학습 결과 — '내 수준' 한 장(이슈 #25).
// StudyResult 게스트 결과의 첫 슬라이드. 등급 사다리(A1~C1)에서 측정된 칸이 차오른다.
// level 은 GET /onboarding/recommend-books 응답 data.level({cefr,label,theta}), 실패하면 θ 로 계산한 값.
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// heyvoca_back/app/services/skill_level.py _BAND_LOWER / onboarding_placement.py 라벨과 같다.
const BAND_LOWER = [0, 20, 35, 55, 75, 90];
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LABEL = {
  A1: '초등 수준', A2: '중학 수준', B1: '고등 수준', B2: '대학 수준', C1: '고급 수준', C2: '원어민 수준',
};

export const levelFromTheta = (theta) => {
  const t = Number(theta) || 0;
  let i = 0;
  BAND_LOWER.forEach((lo, k) => { if (t >= lo) i = k; });
  return { cefr: CEFR[i], label: LABEL[CEFR[i]], theta: t };
};

const LADDER = ['A1', 'A2', 'B1', 'B2', 'C1'];

const LevelResultSlide = ({ level, asked, correct }) => {
  const reducedMotion = useReducedMotion();
  const cefr = level?.cefr || 'A1';
  const label = level?.label || LABEL[cefr] || '';
  const at = Math.max(0, LADDER.indexOf(cefr === 'C2' ? 'C1' : cefr));

  return (
    <div className='flex flex-col items-center gap-[22px] px-[20px]'>
      <p className='text-[15px] font-[600] text-layout-gray-400 dark:text-layout-gray-200'>내 수준</p>

      <div className='flex flex-col items-center gap-[4px]'>
        <motion.p
          className='text-[56px] font-[800] leading-[1] tracking-[-0.03em] text-primary-main-600 dark:text-primary-main-300'
          initial={reducedMotion ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        >
          {cefr}
        </motion.p>
        <p className='text-[20px] font-[700] text-layout-black dark:text-layout-white'>{label}</p>
      </div>

      {/* 등급 사다리 — 왼쪽(A1)부터 측정 칸까지 차오른다 */}
      <div className='flex w-full max-w-[300px] items-end gap-[6px]' aria-hidden>
        {LADDER.map((name, i) => (
          <div key={name} className='flex flex-1 flex-col items-center gap-[6px]'>
            <div className='flex w-full items-end' style={{ height: 64 }}>
              <motion.div
                className={`w-full rounded-[8px] ${i <= at
                  ? 'bg-primary-main-600 dark:bg-primary-main-400'
                  : 'bg-primary-main-100 dark:bg-layout-gray-dark'}`}
                style={{ height: `${28 + i * 9}px`, transformOrigin: 'bottom' }}
                initial={reducedMotion ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: 0.25 + i * 0.12, duration: 0.35, ease: 'easeOut' }}
              />
            </div>
            <span className={`text-[12px] font-[700] ${i === at
              ? 'text-primary-main-600 dark:text-primary-main-300'
              : 'text-layout-gray-300'}`}
            >
              {name}
            </span>
          </div>
        ))}
      </div>

      {Number.isFinite(asked) && asked > 0 ? (
        <p className='text-[14px] font-[500] text-layout-gray-400 dark:text-layout-gray-200'>
          {asked}문제 중 <strong className='font-[700] text-layout-black dark:text-layout-white'>{correct}문제</strong>를 맞혔어요
        </p>
      ) : null}
    </div>
  );
};

export default LevelResultSlide;
