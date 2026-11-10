// src/components/streak/StreakMonthCalendar.jsx
//
// 농장 방문 화면의 월 달력.
//
// 이슈 #25 13차 — 홈 1주 줄과 같은 시각 언어(streak/StreakChip.jsx)로 바꿨다.
//   칸        날짜 숫자 + 그 아래 같은 크기의 원형 칩(불꽃 채움 · 옅은 불꽃 · 방패 · 옅은 점)
//   캡슐      이어진 날(all · part · shield)은 칩 뒤 하나의 둥근 캡슐로 묶는다. 주가 바뀌면 줄 끝에서
//             반듯하게 잘리고 다음 줄 첫 칸에서 반듯하게 이어진다(달이 바뀌는 1일 · 말일도 같다)
//   오늘      테두리 대신 분홍 숫자 + 칩 아래 작은 점. 선택은 칩 둘레 분홍 고리 하나(칸 사이를 미끄러진다)
//   달 넘김   넘기는 방향으로 밀려 들어온다. 실제 주 수만큼만 그린다(빈 줄을 만들지 않는다)
//   탭        칸이 통 튀고, 켜진 날은 불티가 흩어진다. 미래 날짜는 누를 수 없다
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { haptic, SPRING } from '../../lib/feel';
import { burst, jelly } from '../takeTest/rewards/fx';
import { StreakChip, TodayDot, RUN_CAPSULE_CLASS, STREAK_LIT, CHIP_SPARKS, litRuns } from './StreakChip';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const shiftDay = (y, m, d, offset) => {
  const t = new Date(y, m - 1, d + offset);
  return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
};

/**
 * 셀 상태 — 홈 1주 불꽃 줄과 같은 규칙.
 *   all 오늘 할 일 모두 · part 일부(연속 인정만) · shield 보호권으로 지킴 · miss 쉰 날
 * 보호권은 학습하지 않은 날에만 서게 되므로(기획 11.3) 자격을 먼저 본다.
 * `daily_mission_complete` 가 없는 구버전 응답은 qualified 인 날을 "일부"로 낮춰 보여준다.
 */
export const cellState = (info) => {
  if (!info) return 'miss';
  if (info.qualified) return (info.daily_mission_complete ?? false) ? 'all' : 'part';
  if (info.protected) return 'shield';
  return 'miss';
};

const CHIP = 24; // 달력 칩 지름(px)
const CAP_H = 30; // 캡슐 높이(px)
const CELL_H = 52;
const CHIP_TOP = 19; // 칸 안에서 칩 위쪽 위치(px) — 숫자 13 + 간격
const CAP_TOP = CHIP_TOP - (CAP_H - CHIP) / 2;

const DayCell = ({ cell, isSelected, intro, index, reducedMotion, onSelect }) => {
  const rootRef = useRef(null);
  const chipRef = useRef(null);
  const { state, isToday, isFuture } = cell;
  const chipStatus = isFuture ? 'upcoming' : (state === 'miss' ? (isToday ? 'today_empty' : 'none') : state);
  const lit = state === 'all' || state === 'part';

  const handleClick = () => {
    haptic('selection');
    if (!reducedMotion) {
      jelly(chipRef.current, 0.8);
      const root = rootRef.current;
      if (lit && root) {
        burst(root, root.clientWidth / 2, CHIP_TOP + CHIP / 2, { n: 8, dist: 28, size: 5, colors: CHIP_SPARKS, up: 8, dur: 600 });
      }
    }
    onSelect(cell.date);
  };

  let numClass;
  if (isToday) numClass = 'font-[800] text-primary-main-600 dark:text-primary-main-400';
  else if (isFuture) numClass = 'font-[600] text-layout-gray-200 dark:text-layout-gray-500';
  else if (STREAK_LIT.has(state)) numClass = 'font-[700] text-layout-black dark:text-layout-white';
  else numClass = 'font-[600] text-layout-gray-400 dark:text-layout-gray-300';

  return (
    <motion.button
      ref={rootRef}
      type="button"
      disabled={isFuture}
      onClick={handleClick}
      aria-label={`${cell.day}일`}
      aria-pressed={isSelected}
      className="relative flex flex-col items-center"
      style={{ height: CELL_H }}
      initial={intro && !reducedMotion ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={intro && !reducedMotion ? { duration: 0.2, delay: 0.1 + index * 0.012 } : { duration: 0 }}
    >
      <span className={`mt-[2px] h-[13px] text-[11px] leading-[13px] tabular-nums ${numClass}`}>{cell.day}</span>
      <motion.span
        ref={chipRef}
        className="relative mt-[4px] flex"
        initial={intro && !reducedMotion ? { scale: 0.6 } : false}
        animate={{ scale: 1 }}
        transition={intro && !reducedMotion ? { ...SPRING.soft, delay: 0.1 + index * 0.012 } : { duration: 0 }}
      >
        <StreakChip status={chipStatus} size={CHIP} glow={isToday && lit} breathe={isToday && chipStatus === 'today_empty'} />
        {/* 선택 — 칩 둘레 분홍 고리 하나. 칸 사이를 미끄러져 옮겨 간다(오늘은 고리가 아니라 아래 점) */}
        {isSelected && (
          <motion.span
            layoutId="streak-month-selected"
            aria-hidden
            className="pointer-events-none absolute -inset-[4px] rounded-full border-[2px] border-primary-main-600 dark:border-primary-main-400"
            transition={reducedMotion ? { duration: 0 } : SPRING.snappy}
          />
        )}
      </motion.span>
      <span className="mt-[3px] flex h-[4px] justify-center">{isToday && <TodayDot />}</span>
    </motion.button>
  );
};

/**
 * 한 주(7칸)의 연속 캡슐 — 칩 뒤 한 장. 앞 주에서 이어 온 구간은 줄 왼쪽 끝에서, 다음 주로 이어지는
 * 구간은 오른쪽 끝에서 반듯하게 잘린다(둥근 끝은 "여기서 시작 · 끝"만 뜻한다).
 */
const WeekCapsules = ({ week }) => {
  const runs = litRuns(week, (c) => STREAK_LIT.has(c.state) && !c.isFuture);
  return runs.map(([s, e]) => {
    const openLeft = s === 0 && week[s].bandLeft;
    const openRight = e === 6 && week[e].bandRight;
    const col = '(100% / 7)';
    const left = openLeft ? '0px' : `calc(${col} * ${s + 0.5} - ${CAP_H / 2}px)`;
    const right = openRight ? '0px' : `calc(${col} * ${6 - e + 0.5} - ${CAP_H / 2}px)`;
    return (
      <span
        key={`${s}-${e}`}
        aria-hidden
        className={`pointer-events-none absolute ${RUN_CAPSULE_CLASS} ${openLeft ? '' : 'rounded-l-full'} ${openRight ? '' : 'rounded-r-full'}`}
        style={{ top: CAP_TOP, height: CAP_H, left, right }}
      />
    );
  });
};

const NavButton = ({ enabled, onClick, label, children }) => (
  <motion.button
    type="button"
    onClick={onClick}
    disabled={!enabled}
    whileTap={enabled ? { scale: 0.88 } : undefined}
    transition={SPRING.snappy}
    aria-label={label}
    className={`flex h-[30px] w-[30px] items-center justify-center rounded-full ${
      enabled
        ? 'bg-layout-gray-50 text-layout-gray-400 dark:bg-layout-gray-dark dark:text-layout-gray-200'
        : 'text-layout-gray-100 dark:text-layout-gray-500'
    }`}
  >
    {children}
  </motion.button>
);

const SLIDE = {
  enter: (dir) => ({ opacity: 0, x: dir * 28 }),
  center: { opacity: 1, x: 0 },
  exit: (dir) => ({ opacity: 0, x: dir * -28 }),
};
const FADE = { enter: { opacity: 0 }, center: { opacity: 1 }, exit: { opacity: 0 } };

const StreakMonthCalendar = ({ view, byDate, today, selectedDate, canPrev, canNext, onGo, onSelect }) => {
  const reducedMotion = useReducedMotion();
  const [dir, setDir] = useState(0);
  // 칸이 하나씩 돋는 등장은 처음 한 번만 — 달을 넘길 때는 통째로 밀려 들어오기만 한다
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 900);
    return () => clearTimeout(t);
  }, []);

  const cells = useMemo(() => {
    const { year, month } = view;
    const firstDow = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const rows = Math.ceil((firstDow + daysInMonth) / 7);
    const litOn = (date) => date <= today && STREAK_LIT.has(cellState(byDate[date]));

    const out = [];
    for (let i = 0; i < rows * 7; i += 1) {
      const day = i - firstDow + 1;
      if (day < 1 || day > daysInMonth) { out.push(null); continue; }
      const date = ymd(year, month, day);
      const isFuture = date > today;
      const state = isFuture ? 'miss' : cellState(byDate[date]);
      const lit = STREAK_LIT.has(state);
      out.push({
        day,
        date,
        state,
        isFuture,
        isToday: date === today,
        // 달이 바뀌는 1일 · 말일도 앞뒤 날을 그대로 본다 — 지난달에서 이어 온 연속이
        // 1일에서 새로 시작한 것처럼 둥글게 닫히지 않게(조회 창 밖의 날은 모르므로 닫는다)
        bandLeft: lit && litOn(shiftDay(year, month, day, -1)),
        bandRight: lit && litOn(shiftDay(year, month, day, 1)),
      });
    }
    return out;
  }, [view, byDate, today]);

  const go = (offset) => {
    setDir(offset);
    onGo(offset);
  };

  return (
    <div className="rounded-[14px] border border-farm-line bg-layout-white px-[10px] pb-[12px] pt-[12px] dark:border-transparent dark:bg-transparent dark:px-0">
      <div className="flex items-center justify-between px-[4px] pb-[10px]">
        <NavButton enabled={canPrev} onClick={() => go(-1)} label="이전 달">
          <CaretLeft size={14} weight="bold" />
        </NavButton>
        <div className="relative h-[22px] flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.span
              key={`${view.year}-${view.month}`}
              custom={dir}
              variants={reducedMotion ? FADE : SLIDE}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="absolute inset-0 flex items-baseline justify-center gap-[5px] text-layout-black dark:text-layout-white"
            >
              <span className="text-[16px] font-[800] tracking-[-0.03em]">{view.month}월</span>
              <span className="text-[11.5px] font-[600] text-layout-gray-300">{view.year}</span>
            </motion.span>
          </AnimatePresence>
        </div>
        <NavButton enabled={canNext} onClick={() => go(1)} label="다음 달">
          <CaretRight size={14} weight="bold" />
        </NavButton>
      </div>

      <div className="mb-[2px] grid grid-cols-7">
        {DOW.map((d) => (
          <span key={d} className="text-center text-[10.5px] font-[700] text-layout-gray-300">{d}</span>
        ))}
      </div>

      <div className="overflow-x-clip">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={`${view.year}-${view.month}`}
            custom={dir}
            variants={reducedMotion ? FADE : SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="flex flex-col gap-y-[2px]"
          >
            {Array.from({ length: cells.length / 7 }).map((_, w) => {
              const week = cells.slice(w * 7, w * 7 + 7);
              return (
                <div key={w} className="relative">
                  <WeekCapsules week={week} />
                  <div className="relative grid grid-cols-7">
                    {week.map((cell, j) => (
                      cell ? (
                        <DayCell
                          key={cell.date}
                          cell={cell}
                          index={w * 7 + j}
                          intro={intro}
                          isSelected={cell.date === selectedDate}
                          reducedMotion={reducedMotion}
                          onSelect={onSelect}
                        />
                      ) : <span key={`e${w}-${j}`} style={{ height: CELL_H }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default StreakMonthCalendar;
