// src/components/takeTest/rewards/RewardShell.jsx
//
// 보상 슬라이드 공용 껍데기 — 고정 헤더 + 진행 점 + 옆으로 넘어가는 본문 + 「확인」 버튼.
//
//   · 진행 점: 보상이 몇 장 남았는지 보여 준다(최종 결과 화면은 세지 않는다).
//   · 「확인」은 연출이 끝나야(ready) 켜진다. 그 전에 화면 아무 곳이나 탭하면 onSkip 으로 연출을 건너뛴다.
//     (최종 결과 화면의 통계 카드와 같은 규칙.)
//   · 헤더 오른쪽 자리(headerSlot)는 슬라이드가 포털로 채운다 — 보석 슬라이드의 잔액 칩이 여기 들어간다.
//     잔액이 오를 때마다 결과 화면 전체를 다시 그리지 않도록 상태는 슬라이드 안에 둔다.
import React, { createContext, useContext, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ResultCta, ResultCtaBar } from './ResultCta';

const RewardShellContext = createContext({ headerSlot: null });
export const useRewardShell = () => useContext(RewardShellContext);

const StoryDots = ({ index, total, ready }) => (
  <div
    aria-hidden
    className='absolute left-0 z-20 flex w-full gap-[4px] px-[24px]'
    style={{ top: 'calc(var(--status-bar-height) + 55px)' }}
  >
    {Array.from({ length: total }).map((_, i) => (
      <span key={i} className='relative h-[3px] flex-1 overflow-hidden rounded-full bg-layout-gray-100 dark:bg-layout-gray-500'>
        {i < index ? <span className='absolute inset-0 bg-primary-main-600' /> : null}
        {i === index ? (
          <motion.span
            key={`cur-${index}`}
            className='absolute inset-0 origin-left bg-primary-main-600'
            initial={{ scaleX: 0 }}
            animate={{ scaleX: ready ? 1 : 0.85 }}
            transition={ready ? { duration: 0.2, ease: 'easeOut' } : { duration: 3, ease: 'easeOut' }}
          />
        ) : null}
      </span>
    ))}
  </div>
);

const RewardShell = ({ slideKey, index = 0, total = 0, ready = true, onSkip, onConfirm, children }) => {
  const [headerSlot, setHeaderSlot] = useState(null);
  return (
    <div
      className='relative flex flex-col h-[100dvh]'
      onClick={ready ? undefined : () => onSkip?.()}
    >
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* 고정 헤더 */}
      <div
        className='
          absolute left-0
          flex items-end justify-center
          w-full h-[55px]
          px-[16px] py-[14px]
          z-20
        '
        style={{ top: 'var(--status-bar-height)' }}
      >
        <div className="center">
          <h2 className='text-[18px] font-[700] leading-[21px]'>
            학습 결과
          </h2>
        </div>
        <div ref={setHeaderSlot} className='absolute right-[18px] top-1/2 -translate-y-1/2' />
      </div>
      {total > 1 ? <StoryDots index={index} total={total} ready={ready} /> : null}
      {/* 슬라이드되는 영역 (컨텐츠 + 확인 버튼) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={slideKey}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            duration: 0.5
          }}
          className='relative flex flex-col flex-1 pt-[58px] overflow-hidden'
        >
          <RewardShellContext.Provider value={{ headerSlot }}>
            {children}
          </RewardShellContext.Provider>
          {/* 확인 버튼 — 연출이 끝나면 켜지며 한 번 통 튄다 */}
          <ResultCtaBar className="relative z-10">
            <motion.div
              className={`w-full ${ready ? '' : 'pointer-events-none'}`}
              initial={false}
              animate={ready ? { opacity: 1, scale: [0.94, 1] } : { opacity: 0.35, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              aria-disabled={!ready}
            >
              <ResultCta className="w-full" label="확인" onClick={onConfirm} />
            </motion.div>
          </ResultCtaBar>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default RewardShell;
