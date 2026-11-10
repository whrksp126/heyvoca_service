// src/components/streak/StreakWeekRow.jsx
//
// 홈 '오늘 할 일' 카드 아래의 1주 줄 — 기록이 시작된 날부터 7칸(오래된→새), 오늘 이후는
// 'upcoming'(다가올 날). 칸 배열은 farm/WeekStreakStrip 의 buildHomeWeekCells 가 만든다(이슈 #25).
// (status: all · part · shield · none · today_empty · upcoming — 정의는 그 파일 주석이 정본).
//
// 이슈 #25 14차 — 그림은 streak/StreakChip.jsx 의 기존 자산(큰 불꽃 · 작은 불씨 · 보호권 · 빛바랜 불씨 · 옅은 점).
//   띠        이어진 날(all · part · shield)은 그림 뒤 한 줄 띠로 묶는다(예전 연속 띠 색)
//   오늘 칸   카드의 오늘 불꽃 단계와 같이 움직인다 — 할 일을 다 끝내면 큰 불꽃(TodayTasksCard 가 넘긴다)
//   오늘      테두리 고리 대신 요일 라벨 강조 + 칩 아래 작은 점, 켜졌으면 은은한 빛
//   점화      `igniteDate` 칸은 처음 켜질 때 작게 → 크게 확 타오르며 불티가 튄다(홈 달성 연출)
//   탭        칸이 통 튀고(켜진 날은 불티) 아래에 그날 설명이 잠깐 펼쳐진다
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { haptic, SPRING } from '../../lib/feel';
import { burst, ring, jelly } from '../takeTest/rewards/fx';
import { StreakChip, TodayDot, RUN_CAPSULE_CLASS, STREAK_LIT, CHIP_SPARKS, litRuns } from './StreakChip';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CAPTION_MS = 2600;
const STEP = 0.06; // 칸이 켜지는 간격(s)
const GAP = 6; // 칸 사이(px)
const CHIP = 34; // 칩 지름(px)
const ROW_H = 40; // 칩 줄 높이(px) — 캡슐 높이와 같다

const CAPTION = {
  all: '오늘 할 일을 모두 끝낸 날이에요',
  part: '일부만 했지만 불꽃은 이어졌어요',
  shield: '보호권으로 불꽃을 지킨 날이에요',
  none: '쉬어 간 날이에요',
  today_empty: '오늘 불꽃은 아직 켜지 않았어요',
  upcoming: '다가올 날이에요',
};

const dateLabel = (cell) => {
  if (cell.isToday) return '오늘';
  const [y, m, d] = cell.date.split('-').map(Number);
  return `${m}월 ${d}일 (${DOW[new Date(y, m - 1, d).getDay()]})`;
};

/** 7칸 그리드에서 s~e 칸을 덮는 캡슐 위치 — 칸 너비 = (100% − 6칸 사이) / 7 */
const capsuleStyle = (s, e) => {
  const col = `((100% - ${GAP * 6}px) / 7)`;
  const half = ROW_H / 2;
  return {
    left: `calc(${col} * ${s + 0.5} + ${GAP * s}px - ${half}px)`,
    width: `calc(${col} * ${e - s} + ${GAP * (e - s)}px + ${ROW_H}px)`,
    height: ROW_H,
  };
};

const WeekCell = ({ cell, index, play, ignite, reducedMotion, onPick }) => {
  const rootRef = useRef(null);
  const chipRef = useRef(null);
  const [flare, setFlare] = useState(0);
  const { status, isToday } = cell;
  const lit = status === 'all' || status === 'part';

  // 점화 — 작게 시작해 크게 확 타오르고(오버슈트) 제자리로, 둘레로 빛 고리 · 불티가 퍼진다
  useEffect(() => {
    if (!ignite || reducedMotion) return;
    const root = rootRef.current;
    setFlare((n) => n + 1);
    if (root) {
      const cx = root.clientWidth / 2;
      const cy = root.clientHeight / 2;
      ring(root, cx, cy, { size: CHIP * 2.4, color: 'var(--secondary-yellow-400)', dur: 700 });
      burst(root, cx, cy, { n: 14, dist: 42, size: 5, colors: CHIP_SPARKS, up: 16, dur: 820 });
    }
  }, [ignite, reducedMotion]);

  const handleClick = () => {
    haptic('light');
    if (!reducedMotion) {
      jelly(chipRef.current, 0.8);
      const root = rootRef.current;
      if (lit && root) {
        burst(root, root.clientWidth / 2, root.clientHeight / 2, { n: 8, dist: 30, size: 5, colors: CHIP_SPARKS, up: 8, dur: 600 });
      }
    }
    onPick(cell);
  };

  return (
    <motion.button
      ref={rootRef}
      type="button"
      onClick={handleClick}
      aria-label={`${dateLabel(cell)} ${CAPTION[status] ?? ''}`}
      className="relative flex items-center justify-center"
      style={{ height: ROW_H }}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.6 }}
      animate={play ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={reducedMotion ? { duration: 0.15 } : { ...SPRING.bouncy, delay: STEP * index }}
    >
      {/* 점화 섬광 — 칩 뒤에서 한 번 크게 번졌다 사라진다 */}
      {flare > 0 && (
        <motion.span
          key={flare}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -ml-[30px] -mt-[30px] h-[60px] w-[60px] rounded-full bg-[radial-gradient(circle,var(--secondary-yellow-400)_0%,transparent_70%)]"
          initial={{ opacity: 0.95, scale: 0.4 }}
          animate={{ opacity: 0, scale: 2.1 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      )}
      <motion.span
        ref={chipRef}
        className="relative flex"
        initial={false}
        animate={ignite && !reducedMotion ? { scale: [0.35, 1.38, 0.92, 1] } : { scale: 1 }}
        transition={ignite && !reducedMotion
          ? { duration: 0.62, times: [0, 0.55, 0.8, 1], ease: 'easeOut' }
          : { duration: 0 }}
      >
        <StreakChip status={status} size={CHIP} glow={isToday && lit} breathe={status === 'today_empty'} />
      </motion.span>
    </motion.button>
  );
};

/**
 * cells — buildHomeWeekCells 결과. igniteDate — 이 날짜 칸이 지금 막 켜졌다(점화 연출을 한 번 튼다).
 */
const StreakWeekRow = ({ cells, play = true, igniteDate = null, className = '' }) => {
  const reducedMotion = useReducedMotion();
  const [picked, setPicked] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handlePick = (cell) => {
    clearTimeout(timerRef.current);
    setPicked(cell);
    timerRef.current = setTimeout(() => setPicked(null), CAPTION_MS);
  };

  const runs = litRuns(cells, (c) => STREAK_LIT.has(c.status));

  return (
    <div className={className}>
      {/* 요일 — 오늘은 라벨을 '오늘'로 굵게 */}
      <div className="grid grid-cols-7" style={{ columnGap: GAP }}>
        {cells.map((cell) => (
          <span
            key={cell.date}
            className={`text-center text-[11px] ${cell.isToday
              ? 'font-[800] text-primary-main-600 dark:text-primary-main-400'
              : cell.status === 'upcoming'
                ? 'font-[600] text-layout-gray-200 dark:text-layout-gray-500'
                : 'font-[600] text-layout-gray-300'}`}
          >
            {cell.label}
          </span>
        ))}
      </div>

      <div className="relative mt-[6px]">
        {/* 이어진 구간 캡슐 — 칩 뒤 한 장. 왼쪽부터 펴진다 */}
        {runs.map(([s, e]) => (
          <motion.span
            key={`${s}-${e}`}
            aria-hidden
            className={`pointer-events-none absolute top-0 origin-left rounded-full ${RUN_CAPSULE_CLASS}`}
            style={capsuleStyle(s, e)}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scaleX: 0.2 }}
            animate={play ? { opacity: 1, scaleX: 1 } : undefined}
            transition={reducedMotion ? { duration: 0.15 } : { duration: 0.32 + (e - s) * STEP, delay: STEP * s, ease: [0.3, 0.7, 0.3, 1] }}
          />
        ))}
        <div className="relative grid grid-cols-7" style={{ columnGap: GAP }}>
          {cells.map((cell, i) => (
            <WeekCell
              key={cell.date}
              cell={cell}
              index={i}
              play={play}
              ignite={igniteDate != null && cell.date === igniteDate}
              reducedMotion={reducedMotion}
              onPick={handlePick}
            />
          ))}
        </div>
      </div>

      {/* 오늘 점 */}
      <div className="mt-[4px] grid grid-cols-7" style={{ columnGap: GAP }}>
        {cells.map((cell) => (
          <span key={cell.date} className="flex h-[4px] justify-center">
            {cell.isToday && <TodayDot />}
          </span>
        ))}
      </div>

      {/* 칸을 누르면 그날 설명이 잠깐 펼쳐진다(평소엔 자리를 차지하지 않는다) */}
      <AnimatePresence initial={false}>
        {picked && (
          <motion.div
            key="caption"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0.1 : 0.18 }}
            aria-live="polite"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={picked.date}
                className="truncate pt-[8px] text-[11.5px] font-[600] leading-[16px] text-layout-gray-400 dark:text-layout-gray-300"
                initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
                transition={{ duration: 0.14 }}
              >
                <b className="mr-[6px] font-[800] text-layout-black dark:text-layout-white">{dateLabel(picked)}</b>
                {CAPTION[picked.status] ?? CAPTION.none}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StreakWeekRow;
