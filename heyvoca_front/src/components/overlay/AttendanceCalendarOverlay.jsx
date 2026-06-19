import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Heart, CheckCircle, CircleDashed, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useOverlayActions } from '../../context/OverlayContext';
import { useAttendanceCalendar } from '../../context/AttendanceCalendarContext';
import { vibrate } from '../../utils/osFunction';

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// (year, month)에 offset을 더해 새로운 (year, month) 반환
const shiftYM = (y, m, offset) => {
  let nm = m + offset;
  let ny = y;
  while (nm < 1) { nm += 12; ny -= 1; }
  while (nm > 12) { nm -= 12; ny += 1; }
  return { year: ny, month: nm };
};

// 해당 (year, month)의 grid cell 배열 생성. 빈 칸은 null.
const buildCells = (y, m, days) => {
  const firstDayOfWeek = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  // 모든 달의 그리드 높이를 고정하기 위해 항상 6주(최대치)로 렌더 → 모달 높이 불변
  const rows = 6;

  const cells = [];
  for (let i = 0; i < rows * 7; i++) {
    const dayNumber = i - firstDayOfWeek + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push(null);
    } else {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      cells.push({ dayNumber, data: days?.find(d => d.date === dateStr) ?? null });
    }
  }
  return cells;
};

// 한 달치 그리드 (요일 + 날짜) — carousel 슬라이드 단위
const MonthGrid = ({ cells }) => (
  <div className="w-full">
    <div className="grid grid-cols-7 mb-[6px]">
      {DAY_LABELS.map(day => (
        <div key={day} className="flex items-center justify-center">
          <span className="text-[12px] font-[600] text-layout-black dark:text-layout-white">{day}</span>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-7 gap-y-[10px]">
      {cells.map((cell, i) => {
        if (cell === null) {
          return <div key={i} className="flex items-center justify-center h-[30px]" />;
        }
        const { data } = cell;
        const attend = data?.attend ?? false;
        const dailyMission = data?.daily_mission ?? false;

        return (
          <div key={i} className="flex items-center justify-center h-[30px]">
            {attend && dailyMission && (
              <div className="w-[30px] h-[30px] flex items-center justify-center">
                <div className="flex items-center justify-center w-[24px] h-[24px]
                  bg-gradient-to-br from-[rgba(255,141,212,1)] via-[rgba(205,141,255,1)] to-[rgba(116,213,255,1)]
                  rounded-[50%]
                ">
                  <Heart size={12} weight="fill" className="text-layout-white dark:text-layout-black" />
                </div>
              </div>
            )}
            {attend && !dailyMission && (
              <div className="w-[30px] h-[30px] flex items-center justify-center">
                <CheckCircle size={30} weight="fill" color="#FF70D4" />
              </div>
            )}
            {!attend && (
              <CircleDashed size={30} color="#FF70D4" />
            )}
          </div>
        );
      })}
    </div>
  </div>
);

const AttendanceCalendarOverlay = ({ initialYear, initialMonth }) => {
  "use memo";

  const { resolveOverlay } = useOverlayActions();
  const { daysMap, firstCheckin, prefetchMonth } = useAttendanceCalendar();

  const todayRef = new Date();
  const [year, setYear] = useState(initialYear ?? todayRef.getFullYear());
  const [month, setMonth] = useState(initialMonth ?? todayRef.getMonth() + 1);

  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  const isFirstCheckinMonth = firstCheckin
    && year === firstCheckin.year
    && month === firstCheckin.month;
  const noCheckinHistory = firstCheckin === null;
  const isPrevDisabled = isFirstCheckinMonth || noCheckinHistory;

  const prevYM = shiftYM(year, month, -1);
  const nextYM = shiftYM(year, month, 1);

  // prev/current/next 3개월 prefetch (Provider가 캐시 보유 → 미스만 fetch)
  useEffect(() => {
    [prevYM, { year, month }, nextYM].forEach(({ year: y, month: m }) => {
      prefetchMonth(y, m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const cellsCurr = buildCells(year, month, daysMap[`${year}-${month}`]);
  const cellsPrev = buildCells(prevYM.year, prevYM.month, daysMap[`${prevYM.year}-${prevYM.month}`]);
  const cellsNext = buildCells(nextYM.year, nextYM.month, daysMap[`${nextYM.year}-${nextYM.month}`]);

  // carousel transform 제어
  const controls = useAnimationControls();
  const isAnimatingRef = useRef(false);

  // dir > 0 → next, dir < 0 → prev
  const slideTo = async (dir) => {
    if (isAnimatingRef.current) return;
    if (dir > 0 && isCurrentMonth) {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
      return;
    }
    if (dir < 0 && isPrevDisabled) {
      controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
      return;
    }
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
    // 새 month로 prev/current/next 재정렬되었으므로 즉시 0으로 리셋 (사용자에겐 보이지 않음)
    controls.set({ x: 0 });
    isAnimatingRef.current = false;
  };

  const handlePrev = () => slideTo(-1);
  const handleNext = () => slideTo(1);

  const handleClose = () => {
    resolveOverlay({ confirmed: false });
  };

  return (
    <>
      <div
        className="fixed inset-0"
        onClick={handleClose}
      />

      <div
        className="
          relative z-[1]
          w-[88%] max-w-[328px]
          bg-primary-main-100 dark:bg-layout-gray-dark
          rounded-[16px]
          px-[15px] pt-[12px] pb-[12px]
          flex flex-col gap-[20px]
        "
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[16px] font-[700] text-layout-black dark:text-layout-white">
          출석체크
        </h2>

        <div>
          <div className="flex items-center gap-[10px] mb-[15px]">
            <motion.button
              className={`flex items-center justify-center ${isPrevDisabled ? 'opacity-30 cursor-default' : 'text-layout-black dark:text-layout-white'}`}
              onClick={handlePrev}
              whileTap={!isPrevDisabled ? { scale: 0.9 } : {}}
              disabled={isPrevDisabled}
            >
              <CaretLeft size={16} weight="bold" />
            </motion.button>

            <span className="text-[16px] font-[700] text-layout-black dark:text-layout-white">
              {month}월
            </span>

            <motion.button
              className={`flex items-center justify-center ${isCurrentMonth ? 'opacity-30 cursor-default' : 'text-layout-black dark:text-layout-white'}`}
              onClick={handleNext}
              whileTap={!isCurrentMonth ? { scale: 0.9 } : {}}
              disabled={isCurrentMonth}
            >
              <CaretRight size={16} weight="bold" />
            </motion.button>
          </div>

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
                <MonthGrid cells={cellsPrev} />
              </div>
              {/* 현재 달 */}
              <div className="w-full">
                <MonthGrid cells={cellsCurr} />
              </div>
              {/* 다음 달 — 오른쪽 밖 */}
              <div className="absolute top-0 left-full w-full pl-[10px]">
                <MonthGrid cells={cellsNext} />
              </div>
            </motion.div>
          </div>
        </div>




      </div>
    </>
  );
};

export default AttendanceCalendarOverlay;
