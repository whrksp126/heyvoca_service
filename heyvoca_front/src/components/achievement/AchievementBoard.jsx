// src/components/achievement/AchievementBoard.jsx
//
// 마이페이지 '나의 업적' — 전체 진행 막대 한 줄 + 업적 6칸.
// 한 칸은 메달(테두리 게이지 = 달성 레벨 / 최고 레벨)과 이름, 그리고 다음에 할 일 한 줄이다.
//   달성 중     "다음  학습 200회"
//   아직 0레벨  "첫 목표  친구 초대 1명" (메달은 회색 + 자물쇠)
//   최고 레벨   "모두 달성"
// 칸을 누르면 메달이 통 튀고 파편이 흩어진 뒤 업적 달성 기준 시트가 그 업적으로 열린다.
import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Crown } from '@phosphor-icons/react';
import { Pressable, SPRING } from '../../lib/feel';
import AchievementMedal from './AchievementMedal';
import { getAchievementState, shortGoal } from './achievementMeta';

const OPEN_DELAY_MS = 170; // 메달이 튀는 걸 한 박자 보여주고 시트를 연다

const AchievementCell = ({ goal, levels, index, reducedMotion, onOpen }) => {
  const medalRef = useRef(null);
  const timerRef = useRef(null);
  const state = getAchievementState(goal.level, levels);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleClick = () => {
    medalRef.current?.play();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onOpen(goal.type), reducedMotion ? 0 : OPEN_DELAY_MS);
  };

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reducedMotion ? { duration: 0.15 } : { ...SPRING.bouncy, delay: 0.05 * index }}
    >
      <Pressable
        as="div"
        role="button"
        cue="tap"
        whileTap={{ scale: 0.94 }}
        onClick={handleClick}
        aria-label={`${goal.type} ${state.isLocked ? '아직 달성 전' : `${state.level}레벨`}`}
        className="flex h-full cursor-pointer flex-col items-center rounded-[14px] bg-layout-gray-50 px-[6px] pb-[11px] pt-[14px] dark:bg-layout-gray-dark"
      >
        <AchievementMedal
          ref={medalRef}
          type={goal.type}
          level={state.level}
          ratio={state.ratio}
          isMax={state.isMax}
          size={66}
          delay={0.05 * index}
        />
        <span
          className={`mt-[14px] text-[12.5px] font-[800] tracking-[-0.03em] ${
            state.isLocked ? 'text-layout-gray-300' : 'text-layout-black dark:text-layout-white'
          }`}
        >
          {goal.type}
        </span>
        <span className="mt-[3px] flex min-h-[29px] items-start justify-center text-center text-[10px] font-[600] leading-[1.45] tracking-[-0.03em] text-layout-gray-300 [word-break:keep-all]">
          {state.isMax ? (
            <span className="flex items-center gap-[2px] text-secondary-purple-500 dark:text-[#DDB0FF]">
              <Crown size={11} weight="fill" />
              모두 달성
            </span>
          ) : state.next ? (
            <span className="line-clamp-2">
              <span className="mr-[3px] font-[800] text-primary-main-600 dark:text-[#FFAAE6]">
                {state.isLocked ? '첫 목표' : '다음'}
              </span>
              {shortGoal(state.next.goal)}
            </span>
          ) : null}
        </span>
      </Pressable>
    </motion.div>
  );
};

const AchievementBoard = ({ goals = [], criteria = {}, achieved = 0, total = 0, onOpen }) => {
  const reducedMotion = useReducedMotion();
  const ratio = total > 0 ? Math.min(1, achieved / total) : 0;

  return (
    <div className="flex flex-col gap-[10px]">
      {/* 전체 진행 — 달성한 레벨 합 / 전체 레벨 수 */}
      {total > 0 && (
        <div className="flex items-center gap-[8px]">
          <div className="relative h-[8px] flex-1 overflow-hidden rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark">
            <motion.div
              className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-[linear-gradient(90deg,#FFAAE6,var(--primary-main-600)_55%,#CD8DFF)]"
              initial={{ scaleX: reducedMotion ? ratio : 0 }}
              animate={{ scaleX: ratio }}
              transition={{ duration: 0.9, delay: 0.1, ease: [0.3, 0.7, 0.3, 1] }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-[800] tabular-nums tracking-[-0.02em] text-primary-main-600 dark:text-[#FFAAE6]">
            {Math.round(ratio * 100)}%
          </span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-[8px]">
        {goals.map((goal, index) => (
          <AchievementCell
            key={goal.type}
            goal={goal}
            levels={criteria?.[goal.type]}
            index={index}
            reducedMotion={reducedMotion}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
};

export default AchievementBoard;
