import React, { useState, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** (year, month)에 offset을 더해 새로운 (year, month) 반환 */
const shiftYM = (y, m, offset) => {
  let nm = m + offset;
  let ny = y;
  while (nm < 1) { nm += 12; ny -= 1; }
  while (nm > 12) { nm -= 12; ny += 1; }
  return { year: ny, month: nm };
};

/** "YYYY-MM-DD" 문자열 반환 */
const toDateStr = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** 해당 (year, month)의 grid cell 배열 생성. 빈 칸은 null. 말일 이후 빈 주는 제외(동적 행 수). */
const buildCells = (y, m, daysArr) => {
  const firstDayOfWeek = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  // 말일이 속한 주의 끝(토요일)까지만 렌더하기 위해 필요한 셀 수 계산
  const totalCells = firstDayOfWeek + daysInMonth;
  // 7의 배수로 올림 (주 단위)
  const totalRounded = Math.ceil(totalCells / 7) * 7;

  const cells = [];
  for (let i = 0; i < totalRounded; i++) {
    const dayNumber = i - firstDayOfWeek + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push(null);
    } else {
      const dateStr = toDateStr(y, m, dayNumber);
      const dayData = daysArr?.find(d => d.date === dateStr) ?? null;
      cells.push({ dayNumber, dateStr, count: dayData?.count ?? 0, words: dayData?.words ?? [] });
    }
  }
  return cells;
};

/**
 * 한 달치 날짜 그리드.
 * - today: "YYYY-MM-DD" 오늘 날짜
 * - activeDate: 현재 선택된 날짜
 * - onSelectDate: (dateStr, words) => void
 */
const MonthGrid = ({ year, month, cells, today, activeDate, onSelectDate }) => (
  <div className="w-full">
    {/* 요일 헤더 */}
    <div className="grid grid-cols-7 mb-[6px]">
      {DAY_LABELS.map(day => (
        <div key={day} className="flex items-center justify-center">
          <span className="text-[12px] font-[600] text-layout-black dark:text-layout-white">{day}</span>
        </div>
      ))}
    </div>

    {/* 날짜 셀 */}
    <div className="grid grid-cols-7 gap-y-[4px]">
      {cells.map((cell, i) => {
        if (cell === null) {
          return <div key={i} className="flex items-center justify-center h-[36px]" />;
        }

        const { dayNumber, dateStr, count, words } = cell;
        const isToday = dateStr === today;
        const isActive = dateStr === activeDate;
        const hasReview = count > 0;

        return (
          <div key={i} className="flex items-center justify-center h-[40px]">
            <button
              type="button"
              onClick={() => {
                vibrate({ duration: 5 });
                onSelectDate(dateStr, words);
              }}
              className={`
                relative flex flex-col items-center justify-center w-[32px] h-[38px] rounded-[8px]
                transition-all duration-150
                ${isActive
                  ? 'bg-primary-main-600'
                  : isToday
                    ? 'bg-primary-main-100 dark:bg-primary-main-900/30'
                    : 'bg-transparent hover:bg-layout-gray-50 dark:hover:bg-layout-gray-dark'
                }
              `}
            >
              <span className={`
                text-[13px] leading-none
                ${isToday || isActive ? 'font-[700]' : 'font-[500]'}
                ${isActive
                  ? 'text-layout-white'
                  : isToday
                    ? 'text-primary-main-600 dark:text-primary-main-400'
                    : 'text-layout-black dark:text-layout-white'
                }
              `}>
                {dayNumber}
              </span>
              {/* 복습 예정 개수 숫자 표시 (도트 대신) */}
              <span className={`
                text-[9px] leading-none mt-[2px] tabular-nums
                ${hasReview ? 'opacity-100' : 'opacity-0'}
                ${isActive
                  ? 'text-layout-white/80'
                  : isToday
                    ? 'text-primary-main-600 dark:text-primary-main-400'
                    : 'text-layout-gray-300 dark:text-layout-gray-400'
                }
              `}>
                {hasReview ? count : '0'}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  </div>
);

/**
 * 복습 예정 캘린더 컴포넌트.
 * props:
 *   - days: API days 배열 [{ date, count, words }]
 *   - today: "YYYY-MM-DD" (API today 필드)
 *   - activeDate: 현재 선택된 날짜
 *   - onSelectDate: (dateStr, words) => void
 */
const ReviewScheduleCalendar = ({ days = [], today, activeDate, onSelectDate }) => {
  "use memo";

  const todayObj = today ? new Date(today + 'T00:00:00') : new Date();
  const [year, setYear] = useState(todayObj.getFullYear());
  const [month, setMonth] = useState(todayObj.getMonth() + 1);

  const nowObj = new Date();
  const isCurrentMonth = year === nowObj.getFullYear() && month === nowObj.getMonth() + 1;

  const prevYM = shiftYM(year, month, -1);
  const nextYM = shiftYM(year, month, 1);

  const cellsCurr = buildCells(year, month, days);
  const cellsPrev = buildCells(prevYM.year, prevYM.month, days);
  const cellsNext = buildCells(nextYM.year, nextYM.month, days);

  const controls = useAnimationControls();
  const isAnimatingRef = useRef(false);

  const slideTo = async (dir) => {
    if (isAnimatingRef.current) return;
    // 미래 달로 이동 제한 없음 (복습 예정은 미래 날짜도 표시), 현재 달에서 next는 허용
    isAnimatingRef.current = true;
    vibrate({ duration: 5 });
    await controls.start({
      x: dir > 0 ? '-100%' : '100%',
      transition: { duration: 0.22, ease: 'easeOut' },
    });
    if (dir > 0) {
      if (month === 12) { setYear(y => y + 1); setMonth(1); }
      else { setMonth(m => m + 1); }
    } else {
      if (month === 1) { setYear(y => y - 1); setMonth(12); }
      else { setMonth(m => m - 1); }
    }
    controls.set({ x: 0 });
    isAnimatingRef.current = false;
  };

  return (
    <div className="flex flex-col gap-[12px]">
      {/* 월 네비게이션 헤더 */}
      <div className="flex items-center gap-[10px]">
        <motion.button
          type="button"
          className="flex items-center justify-center text-layout-black dark:text-layout-white"
          onClick={() => slideTo(-1)}
          whileTap={{ scale: 0.9 }}
        >
          <CaretLeft size={16} weight="bold" />
        </motion.button>

        <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white">
          {year}년 {month}월
        </span>

        <motion.button
          type="button"
          className="flex items-center justify-center text-layout-black dark:text-layout-white"
          onClick={() => slideTo(1)}
          whileTap={{ scale: 0.9 }}
        >
          <CaretRight size={16} weight="bold" />
        </motion.button>
      </div>

      {/* 슬라이드 캐러셀 */}
      <div className="relative overflow-hidden">
        <motion.div
          className="relative w-full"
          animate={controls}
          drag="x"
          dragConstraints={{ left: -1000, right: 1000 }}
          dragElastic={0.4}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            const threshold = 60;
            if (info.offset.x < -threshold) {
              slideTo(1);
            } else if (info.offset.x > threshold) {
              slideTo(-1);
            } else {
              controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
            }
          }}
        >
          {/* 이전 달 — 왼쪽 밖 */}
          <div className="absolute top-0 right-full w-full pr-[10px]">
            <MonthGrid
              year={prevYM.year}
              month={prevYM.month}
              cells={cellsPrev}
              today={today}
              activeDate={activeDate}
              onSelectDate={onSelectDate}
            />
          </div>

          {/* 현재 달 */}
          <div className="w-full">
            <MonthGrid
              year={year}
              month={month}
              cells={cellsCurr}
              today={today}
              activeDate={activeDate}
              onSelectDate={onSelectDate}
            />
          </div>

          {/* 다음 달 — 오른쪽 밖 */}
          <div className="absolute top-0 left-full w-full pl-[10px]">
            <MonthGrid
              year={nextYM.year}
              month={nextYM.month}
              cells={cellsNext}
              today={today}
              activeDate={activeDate}
              onSelectDate={onSelectDate}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default ReviewScheduleCalendar;
