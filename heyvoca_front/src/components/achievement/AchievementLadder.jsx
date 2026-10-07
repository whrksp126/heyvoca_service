// src/components/achievement/AchievementLadder.jsx
//
// 레벨 사다리 — 한 업적의 1레벨부터 최고 레벨까지를 아래로 이어지는 길로 그린다.
//   달성      등급 색 마디 + 체크, 보상은 '받음'으로 흐리게
//   다음 목표 분홍 테두리 카드 + 숨 쉬는 마디, 받을 보석을 또렷하게
//   그 뒤     회색 마디 + 흐린 보석
// 마디 사이 선은 달성한 구간까지만 등급 색으로 차오른다.
// nextRowRef 는 '다음 목표' 줄(전부 달성했으면 마지막 줄)에 걸린다 — 시트가 그 줄로 스크롤한다.
import React from 'react';
import { motion } from 'framer-motion';
import { Check, Crown } from '@phosphor-icons/react';
import gem from '../../assets/images/farm/icon-gem.png';
import { achievementTier, TIER_INK } from './achievementMeta';

const NODE = 24;

const LadderRow = ({ info, status, isLast, lineDone, index, reducedMotion, rowRef }) => {
  const tier = achievementTier(info.level);
  const ink = TIER_INK[tier.key];
  const isDone = status === 'done';
  const isNext = status === 'next';

  return (
    <motion.div
      ref={rowRef}
      className="relative flex items-stretch gap-[10px]"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.24, delay: reducedMotion ? 0 : 0.035 * index, ease: 'easeOut' }}
    >
      {/* 길 — 마디 + 다음 마디로 가는 선 */}
      <div className="relative flex shrink-0 justify-center" style={{ width: NODE }}>
        {!isLast && (
          <span className="absolute bottom-[-4px] left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-layout-gray-100 dark:bg-[#34344A]" style={{ top: '50%' }}>
            {lineDone && (
              <motion.span
                className="absolute inset-0 origin-top rounded-full"
                style={{ background: tier.color }}
                initial={{ scaleY: reducedMotion ? 1 : 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.22, delay: reducedMotion ? 0 : 0.12 + 0.07 * index, ease: 'easeOut' }}
              />
            )}
          </span>
        )}
        <span className="relative z-[1] self-center" style={{ width: NODE, height: NODE }}>
          {isNext && !reducedMotion && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-primary-main-600"
              animate={{ scale: [1, 1.9], opacity: [0.45, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
            />
          )}
          {isDone ? (
            <motion.span
              className="absolute inset-0 flex items-center justify-center rounded-full text-layout-white shadow-[inset_0_-2px_0_rgba(0,0,0,.14),inset_0_2px_0_rgba(255,255,255,.4)]"
              style={{ background: tier.bg }}
              initial={{ scale: reducedMotion ? 1 : 0.3 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 16, delay: reducedMotion ? 0 : 0.08 + 0.07 * index }}
            >
              <Check size={13} weight="bold" />
            </motion.span>
          ) : (
            <span
              className={`absolute inset-0 flex items-center justify-center rounded-full border-[2px] text-[11px] font-[800] tabular-nums leading-none ${
                isNext
                  ? 'border-primary-main-600 bg-layout-white text-primary-main-600 dark:bg-[#1C1C1C]'
                  : 'border-layout-gray-100 bg-layout-white text-layout-gray-300 dark:border-[#3A3A52] dark:bg-secondary-purple-dark'
              }`}
            >
              {info.level}
            </span>
          )}
        </span>
      </div>

      {/* 내용 */}
      <div
        className={`my-[3px] flex min-w-0 flex-1 items-center gap-[8px] rounded-[10px] px-[10px] ${
          isNext
            ? 'border-[1.5px] border-primary-main-600 bg-layout-white py-[9px] shadow-[0_3px_0_rgba(255,112,212,.18)] dark:bg-[#26263A]'
            : 'py-[7px]'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-[5px]">
            <span
              className={`text-[11px] font-[800] leading-none tracking-[0.01em] ${
                isDone ? 'text-[color:var(--ink)] dark:text-[color:var(--ink-d)]' : isNext ? 'text-primary-main-600' : 'text-layout-gray-300'
              }`}
              style={{ '--ink': ink.light, '--ink-d': ink.dark }}
            >
              LV.{info.level}
            </span>
            {isNext && (
              <span className="rounded-full bg-primary-main-100 px-[6px] py-[2px] text-[9.5px] font-[800] leading-none text-primary-main-600 dark:bg-primary-main-dark dark:text-[#FFAAE6]">
                다음 목표
              </span>
            )}
            {isLast && (
              <Crown size={11} weight="fill" className={isDone ? 'text-[#CD8DFF]' : 'text-layout-gray-200 dark:text-layout-gray-400'} />
            )}
          </div>
          <div
            className={`mt-[3px] text-[13px] leading-[1.4] tracking-[-0.03em] [word-break:keep-all] ${
              isNext
                ? 'font-[800] text-layout-black dark:text-layout-white'
                : isDone
                  ? 'font-[600] text-layout-gray-500 dark:text-layout-gray-100'
                  : 'font-[500] text-layout-gray-300'
            }`}
          >
            {info.goal}
          </div>
        </div>

        {/* 보상 보석 */}
        {isDone ? (
          <span className="flex shrink-0 items-center gap-[3px] text-[10.5px] font-[700] tracking-[-0.02em] text-layout-gray-300">
            <img src={gem} alt="" draggable={false} className="h-[13px] w-[13px] object-contain opacity-60 grayscale" />
            {info.reward} 받음
          </span>
        ) : (
          <span
            className={`flex shrink-0 items-center gap-[3px] rounded-full px-[8px] py-[4px] text-[12px] font-[800] tabular-nums leading-none ${
              isNext
                ? 'bg-[#EAD2FF] text-layout-black'
                : 'bg-layout-white text-layout-gray-300 dark:bg-[#26263A]'
            }`}
          >
            <img src={gem} alt="보석" draggable={false} className={`h-[14px] w-[14px] object-contain ${isNext ? '' : 'opacity-70'}`} />
            {isNext ? `+${info.reward}` : info.reward}
          </span>
        )}
      </div>
    </motion.div>
  );
};

const AchievementLadder = ({ levels = [], currentLevel = 0, reducedMotion, nextRowRef }) => {
  const lastLevel = levels.length ? levels[levels.length - 1].level : 0;
  const focusLevel = Math.min(currentLevel + 1, lastLevel);

  return (
    <div className="flex flex-col">
      {levels.map((info, index) => {
        const status = info.level <= currentLevel ? 'done' : info.level === currentLevel + 1 ? 'next' : 'todo';
        return (
          <LadderRow
            key={info.level}
            info={info}
            status={status}
            isLast={index === levels.length - 1}
            lineDone={info.level < currentLevel}
            index={index}
            reducedMotion={reducedMotion}
            rowRef={info.level === focusLevel ? nextRowRef : undefined}
          />
        );
      })}
    </div>
  );
};

export default AchievementLadder;
