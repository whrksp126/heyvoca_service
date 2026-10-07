// src/components/streak/StreakWeekRow.jsx
//
// 홈 연속 학습 카드의 1주 불꽃 줄 — 최근 6일 + 오늘, 오래된→오늘 7칸.
// 칸 데이터는 farm/WeekStreakStrip 의 buildWeekCells 가 만든 배열을 그대로 받는다
// (status: all · part · shield · none · today_empty — 정의는 그 파일 주석이 정본).
//
//   띠        이어진 날(all · part · shield)은 같은 색 · 같은 높이의 띠 한 줄로 잇는다. 끊긴 날에서만 끊긴다.
//             상태는 띠의 색이 아니라 띠 위의 표식으로 구분한다(streak/StreakMark.jsx 가 정본)
//   등장      카드가 화면에 들어오면 띠가 왼쪽부터 그어지고 표식이 하나씩 켜진다
//   오늘      켜진 날은 주황 고리 + 일렁이는 표식, 아직이면 분홍 고리가 숨 쉬듯 깜빡인다
//   탭        칸이 통 튀고(켜진 날은 불티) 아래 범례 자리가 그날 설명으로 잠깐 바뀐다
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { haptic, SPRING } from '../../lib/feel';
import { burst, jelly } from '../takeTest/rewards/fx';
import StreakFlame, { FLAME_SPARKS } from './StreakFlame';
import StreakMark, { StreakLegend, STREAK_BAND_CLASS, STREAK_LIT } from './StreakMark';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const CAPTION_MS = 2600;
const STEP = 0.07; // 칸이 켜지는 간격(s)

const CAPTION = {
  all: '오늘 할 일을 모두 끝낸 날이에요',
  part: '일부만 했지만 불꽃은 이어졌어요',
  shield: '보호권으로 불꽃을 지킨 날이에요',
  none: '쉬어 간 날이에요',
  today_empty: '오늘 불꽃은 아직 켜지 않았어요',
};

const dateLabel = (cell) => {
  if (cell.isToday) return '오늘';
  const [y, m, d] = cell.date.split('-').map(Number);
  return `${m}월 ${d}일 (${DOW[new Date(y, m - 1, d).getDay()]})`;
};

// 띠가 없는 칸의 모양 — 이어진 날은 뒤에 깔린 띠가 바탕이라 따로 칠하지 않는다
const BOX_CLASS = {
  none: 'bg-layout-gray-50 dark:bg-layout-black',
  today_empty: 'bg-layout-white dark:bg-layout-black border-[1.5px] border-dashed border-primary-main-400',
};

const WeekCell = ({ cell, index, play, linkPrev, linkNext, reducedMotion, onPick }) => {
  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const { status, isToday } = cell;
  const lit = STREAK_LIT.has(status);
  const hasFlame = status === 'all' || status === 'part';

  const handleClick = () => {
    haptic('light');
    if (!reducedMotion) {
      jelly(boxRef.current, 0.8);
      const root = rootRef.current;
      if (hasFlame && root) {
        burst(root, root.clientWidth / 2, root.clientHeight / 2, { n: 8, dist: 30, size: 5, colors: FLAME_SPARKS, up: 8, dur: 600 });
      }
    }
    onPick(cell);
  };

  return (
    <div className="flex flex-col gap-[6px]">
      <span className={`text-center text-[11px] ${isToday ? 'font-[800] text-layout-black dark:text-layout-white' : 'font-[600] text-layout-gray-300'}`}>
        {cell.label}
      </span>
      <div className="relative h-[48px]">
        {/* 연속 띠 한 토막 — 이어진 쪽은 칸 사이 틈까지 덮어 옆 토막과 맞붙고, 끝나는 쪽만 둥글다.
            칸마다 STEP 간격으로 왼쪽부터 펴져서 띠 한 줄이 쭉 그어지는 것처럼 보인다 */}
        {lit && (
          <motion.span
            aria-hidden
            className={`
              pointer-events-none absolute bottom-[6px] left-0 top-[6px] origin-left
              ${STREAK_BAND_CLASS}
              ${linkPrev ? '' : 'rounded-l-full'}
              ${linkNext ? '-right-[7px]' : 'right-0 rounded-r-full'}
            `}
            initial={reducedMotion ? { opacity: 0 } : { scaleX: 0 }}
            animate={play ? { opacity: 1, scaleX: 1 } : undefined}
            transition={reducedMotion ? { duration: 0.15 } : { duration: STEP, delay: STEP * index, ease: 'linear' }}
          />
        )}

        <motion.button
          ref={rootRef}
          type="button"
          onClick={handleClick}
          aria-label={`${dateLabel(cell)} ${CAPTION[status] ?? ''}`}
          className="relative block h-full w-full"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.6 }}
          animate={play ? { opacity: 1, y: 0, scale: 1 } : undefined}
          transition={reducedMotion ? { duration: 0.15 } : { ...SPRING.bouncy, delay: STEP * index }}
        >
          <div ref={boxRef} className={`absolute inset-x-0 bottom-[6px] top-[6px] flex items-center justify-center rounded-full ${BOX_CLASS[status] ?? ''}`}>
            {lit && <StreakMark status={status} size={28} alive={isToday} />}
            {status === 'none' && <i className="block h-[5px] w-[5px] rounded-full bg-layout-gray-200 dark:bg-layout-gray-500" />}
            {status === 'today_empty' && (
              <motion.span
                animate={reducedMotion ? { opacity: 0.6 } : { opacity: [0.45, 0.9, 0.45] }}
                transition={reducedMotion ? { duration: 0.15 } : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <StreakFlame lit={false} size={24} />
              </motion.span>
            )}
          </div>

          {/* 오늘 — 켜졌으면 띠 위에 주황 고리, 아직이면 분홍 고리가 숨 쉰다 */}
          {isToday && (
            status === 'today_empty' ? (
              !reducedMotion && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute -inset-x-[3px] bottom-[3px] top-[3px] rounded-full border-[2px] border-primary-main-400"
                  animate={{ opacity: [0.85, 0, 0.85], scale: [1, 1.08, 1] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              )
            ) : (
              <span aria-hidden className="pointer-events-none absolute -inset-x-[3px] bottom-[3px] top-[3px] rounded-full border-[2px] border-secondary-yellow-500" />
            )
          )}
        </motion.button>
      </div>
    </div>
  );
};

const StreakWeekRow = ({ cells, play = true, className = '' }) => {
  const reducedMotion = useReducedMotion();
  const [picked, setPicked] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handlePick = (cell) => {
    clearTimeout(timerRef.current);
    setPicked(cell);
    timerRef.current = setTimeout(() => setPicked(null), CAPTION_MS);
  };

  const hasShield = cells.some((c) => c.status === 'shield');

  return (
    <div className={className}>
      <div className="grid grid-cols-7 gap-[6px]">
        {cells.map((cell, i) => (
          <WeekCell
            key={cell.date}
            cell={cell}
            index={i}
            play={play}
            linkPrev={STREAK_LIT.has(cell.status) && STREAK_LIT.has(cells[i - 1]?.status)}
            linkNext={STREAK_LIT.has(cell.status) && STREAK_LIT.has(cells[i + 1]?.status)}
            reducedMotion={reducedMotion}
            onPick={handlePick}
          />
        ))}
      </div>

      {/* 범례 자리 — 칸을 누르면 그날 설명으로 잠깐 바뀐다 */}
      <div className="relative mt-[12px] h-[16px] text-[11px] font-[600] leading-[16px] text-layout-gray-300" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={picked ? picked.date : 'legend'}
            className="absolute inset-0 flex items-center truncate"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -5 }}
            transition={{ duration: 0.14 }}
          >
            {picked ? (
              <>
                <b className="mr-[6px] font-[800] text-layout-black dark:text-layout-white">{dateLabel(picked)}</b>
                {CAPTION[picked.status] ?? CAPTION.none}
              </>
            ) : (
              <StreakLegend showShield={hasShield} />
            )}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default StreakWeekRow;
