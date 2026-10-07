// src/components/streak/StreakMonthCalendar.jsx
//
// 농장 방문 화면의 월 달력.
//
//   연속 띠   이어진 날(불꽃 · 보호권)끼리 띠로 잇는다. 주가 바뀌면 줄 끝까지 뻗어 다음 줄로 넘어간다
//   칸        all 진한 칸 · part 옅은 칸 · shield 민트 점선 칸(보호권 그림) · 쉰 날은 숫자만
//   오늘      테두리가 아니라 날짜 숫자를 검은 알약에 담아 표시한다 — 선택 테두리와 겹쳐
//             이중 테두리가 되던 문제를 없앤다. 선택은 분홍 테두리 하나이고 칸 사이를 미끄러져 옮겨 간다
//   줄 높이   42px 고정 — 정사각 칸이라 빈 주가 크게 비어 보이던 여백을 줄였다
//   달 넘김   넘기는 방향으로 밀려 들어온다. 실제 주 수만큼만 그린다(빈 줄을 만들지 않는다)
//   탭        칸이 통 튀고, 켜진 날은 불티가 흩어진다. 미래 날짜는 누를 수 없다
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { haptic, SPRING } from '../../lib/feel';
import { CROP_ASSETS } from '../farm/CropImage';
import { burst, jelly } from '../takeTest/rewards/fx';
import StreakFlame, { FLAME_SPARKS } from './StreakFlame';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const LIT = new Set(['all', 'part', 'shield']);

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const shiftDay = (y, m, d, offset) => {
  const t = new Date(y, m - 1, d + offset);
  return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
};

/**
 * 셀 상태 — 홈 1주 불꽃 줄과 같은 규칙.
 *   all 오늘 할 일 모두(진함) · part 일부(연함, 연속 인정만) · shield 보호권으로 지킴 · miss 쉰 날
 * 보호권은 학습하지 않은 날에만 서게 되므로(기획 11.3) 자격을 먼저 본다.
 * `daily_mission_complete` 가 없는 구버전 응답은 qualified 인 날을 "일부"로 낮춰 보여준다.
 */
export const cellState = (info) => {
  if (!info) return 'miss';
  if (info.qualified) return (info.daily_mission_complete ?? false) ? 'all' : 'part';
  if (info.protected) return 'shield';
  return 'miss';
};

const DISC_CLASS = {
  all: 'bg-streak-all shadow-[inset_0_-2px_0_rgba(0,0,0,.07),inset_0_1.5px_0_rgba(255,255,255,.45)] dark:shadow-[inset_0_-2px_0_rgba(0,0,0,.25)]',
  part: 'bg-streak-part',
  shield: 'bg-secondary-mint-100 dark:bg-secondary-mint-dark border-[1.5px] border-dashed border-secondary-mint-500',
  miss: '',
};

const DayCell = ({ cell, isSelected, intro, index, reducedMotion, onSelect }) => {
  const rootRef = useRef(null);
  const discRef = useRef(null);
  const { state, isToday, isFuture } = cell;
  const lit = LIT.has(state);

  const handleClick = () => {
    haptic('selection');
    if (!reducedMotion) {
      jelly(discRef.current, 0.8);
      const root = rootRef.current;
      if ((state === 'all' || state === 'part') && root) {
        burst(root, root.clientWidth / 2, root.clientHeight / 2, { n: 8, dist: 28, size: 5, colors: FLAME_SPARKS, up: 8, dur: 600 });
      }
    }
    onSelect(cell.date);
  };

  let numClass;
  if (isToday) numClass = 'flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-layout-black px-[4px] text-[10px] font-[800] text-layout-white dark:bg-layout-white dark:text-layout-black';
  else if (lit) numClass = 'text-[10.5px] font-[800] text-layout-black dark:text-layout-white';
  else if (isFuture) numClass = 'text-[12.5px] font-[600] text-layout-gray-200 dark:text-layout-gray-500';
  else numClass = 'text-[12.5px] font-[600] text-layout-gray-400 dark:text-layout-gray-300';

  return (
    <motion.button
      ref={rootRef}
      type="button"
      disabled={isFuture}
      onClick={handleClick}
      aria-label={`${cell.day}일`}
      aria-pressed={isSelected}
      className="relative flex h-[42px] items-center justify-center"
      initial={intro && !reducedMotion ? { opacity: 0, scale: 0.6 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={intro && !reducedMotion ? { ...SPRING.soft, delay: 0.1 + index * 0.012 } : { duration: 0 }}
    >
      {/* 연속 띠 — 앞날 · 뒷날과 이어지는 반쪽씩 */}
      {cell.bandLeft && <span aria-hidden className="absolute left-0 right-1/2 top-[2px] h-[38px] bg-secondary-yellow-200 dark:bg-streak-part" />}
      {cell.bandRight && <span aria-hidden className="absolute left-1/2 right-0 top-[2px] h-[38px] bg-secondary-yellow-200 dark:bg-streak-part" />}

      <span
        ref={discRef}
        className={`
          relative flex h-[38px] w-[38px] flex-col items-center justify-center gap-[2px] rounded-[13px] leading-none
          ${DISC_CLASS[state]}
        `}
      >
        <span className={`tabular-nums ${numClass}`}>{cell.day}</span>
        {state === 'all' && <StreakFlame days={7} lit size={17} alive={isToday} />}
        {state === 'part' && <StreakFlame days={1} lit size={17} alive={isToday} />}
        {state === 'shield' && (
          <img src={CROP_ASSETS.shield} alt="" draggable={false} className="h-[15px] w-[15px] select-none object-contain" />
        )}
      </span>

      {isSelected && (
        <motion.span
          layoutId="streak-month-selected"
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -ml-[21px] -mt-[21px] h-[42px] w-[42px] rounded-[15px] border-[2px] border-primary-main-600"
          transition={reducedMotion ? { duration: 0 } : SPRING.snappy}
        />
      )}
    </motion.button>
  );
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
    const litOn = (date) => date <= today && LIT.has(cellState(byDate[date]));

    const out = [];
    for (let i = 0; i < rows * 7; i += 1) {
      const day = i - firstDow + 1;
      if (day < 1 || day > daysInMonth) { out.push(null); continue; }
      const date = ymd(year, month, day);
      const isFuture = date > today;
      const state = isFuture ? 'miss' : cellState(byDate[date]);
      const lit = LIT.has(state);
      out.push({
        day,
        date,
        state,
        isFuture,
        isToday: date === today,
        // 띠는 이 달 안에서만 잇는다 — 1일 · 말일에서 바깥으로 반쪽만 삐져나오지 않게
        bandLeft: lit && day > 1 && litOn(shiftDay(year, month, day, -1)),
        bandRight: lit && day < daysInMonth && litOn(shiftDay(year, month, day, 1)),
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
            className="grid grid-cols-7 gap-y-[3px]"
          >
            {cells.map((cell, i) => (
              cell ? (
                <DayCell
                  key={cell.date}
                  cell={cell}
                  index={i}
                  intro={intro}
                  isSelected={cell.date === selectedDate}
                  reducedMotion={reducedMotion}
                  onSelect={onSelect}
                />
              ) : <span key={`e${i}`} className="h-[42px]" />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default StreakMonthCalendar;
