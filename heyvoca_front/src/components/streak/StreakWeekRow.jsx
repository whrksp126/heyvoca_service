// src/components/streak/StreakWeekRow.jsx
//
// 홈 연속 학습 카드의 1주 불꽃 줄 — 최근 6일 + 오늘, 오래된→오늘 7칸.
// 칸 데이터는 farm/WeekStreakStrip 의 buildWeekCells 가 만든 배열을 그대로 받는다
// (status: all · part · shield · none · today_empty — 정의는 그 파일 주석이 정본).
//
//   등장      카드가 화면에 들어오면 칸이 왼쪽부터 하나씩 켜지고, 이어진 날 사이에 띠가 놓인다
//   오늘      켜진 날은 불꽃이 일렁이고, 아직이면 분홍 테두리가 숨 쉬듯 깜빡인다
//   탭        칸이 통 튀고(켜진 날은 불티) 아래 범례 자리가 그날 설명으로 잠깐 바뀐다
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { haptic, SPRING } from '../../lib/feel';
import { CROP_ASSETS } from '../farm/CropImage';
import { burst, jelly } from '../takeTest/rewards/fx';
import StreakFlame, { FLAME_SPARKS } from './StreakFlame';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const LIT = new Set(['all', 'part', 'shield']);
const CAPTION_MS = 2600;
const STEP = 0.07; // 칸이 켜지는 간격(s)

const CAPTION = {
  all: '오늘 할 일을 모두 끝낸 날이에요',
  part: '불꽃을 이어 간 날이에요',
  shield: '보호권이 지켜 준 날이에요',
  none: '쉬어 간 날이에요',
  today_empty: '오늘 불꽃은 아직 켜지 않았어요',
};

const dateLabel = (cell) => {
  if (cell.isToday) return '오늘';
  const [y, m, d] = cell.date.split('-').map(Number);
  return `${m}월 ${d}일 (${DOW[new Date(y, m - 1, d).getDay()]})`;
};

const BOX_CLASS = {
  all: 'bg-streak-all shadow-[inset_0_-3px_0_rgba(0,0,0,.07),inset_0_2px_0_rgba(255,255,255,.45)] dark:shadow-[inset_0_-3px_0_rgba(0,0,0,.25)]',
  part: 'bg-streak-part',
  shield: 'bg-secondary-mint-100 dark:bg-secondary-mint-dark border-[1.5px] border-dashed border-secondary-mint-500',
  none: 'bg-layout-gray-50 dark:bg-layout-black',
  today_empty: 'bg-layout-white dark:bg-layout-black border-[1.5px] border-dashed border-primary-main-400',
};

const WeekCell = ({ cell, index, play, linkNext, reducedMotion, onPick }) => {
  const rootRef = useRef(null);
  const boxRef = useRef(null);
  const { status, isToday } = cell;
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
      <motion.button
        ref={rootRef}
        type="button"
        onClick={handleClick}
        aria-label={`${dateLabel(cell)} ${CAPTION[status] ?? ''}`}
        className="relative h-[48px]"
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.6 }}
        animate={play ? { opacity: 1, y: 0, scale: 1 } : undefined}
        transition={reducedMotion ? { duration: 0.15 } : { ...SPRING.bouncy, delay: STEP * index }}
      >
        {/* 다음 날로 이어지는 띠 — 이 칸 가운데에서 다음 칸 가운데까지. 다음 칸이 위를 덮는다 */}
        {linkNext && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -mt-[6px] h-[12px] w-[calc(100%+6px)] origin-left bg-streak-all"
            initial={{ scaleX: reducedMotion ? 1 : 0 }}
            animate={play ? { scaleX: 1 } : undefined}
            transition={{ duration: 0.22, delay: reducedMotion ? 0 : STEP * index + 0.12, ease: 'easeOut' }}
          />
        )}

        <div ref={boxRef} className={`relative flex h-full items-center justify-center rounded-[14px] ${BOX_CLASS[status] ?? BOX_CLASS.none}`}>
          {status === 'all' && <StreakFlame days={7} lit size={28} alive={isToday} />}
          {status === 'part' && <StreakFlame days={1} lit size={28} alive={isToday} />}
          {status === 'shield' && (
            <img src={CROP_ASSETS.shield} alt="" draggable={false} className="h-[24px] w-[24px] select-none object-contain" />
          )}
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

        {/* 오늘 — 켜졌으면 주황 테두리, 아직이면 분홍 테두리가 숨 쉰다 */}
        {isToday && (
          status === 'today_empty' ? (
            !reducedMotion && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute -inset-[3px] rounded-[17px] border-[2px] border-primary-main-400"
                animate={{ opacity: [0.85, 0, 0.85], scale: [1, 1.08, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              />
            )
          ) : (
            <span aria-hidden className="pointer-events-none absolute -inset-[3px] rounded-[17px] border-[2px] border-secondary-yellow-500" />
          )
        )}
      </motion.button>
    </div>
  );
};

const Legend = ({ hasShield }) => (
  <span className="flex items-center gap-[12px]">
    <span className="flex items-center gap-[4px]">
      <i className="block h-[12px] w-[12px] rounded-[4px] bg-streak-all" />
      오늘 할 일 모두
    </span>
    <span className="flex items-center gap-[4px]">
      <i className="block h-[12px] w-[12px] rounded-[4px] bg-streak-part ring-1 ring-inset ring-secondary-yellow-300 dark:ring-0" />
      일부
    </span>
    {hasShield && (
      <span className="flex items-center gap-[4px]">
        <i className="block h-[12px] w-[12px] rounded-[4px] border border-dashed border-secondary-mint-500 bg-secondary-mint-100 dark:bg-secondary-mint-dark" />
        보호권
      </span>
    )}
  </span>
);

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
            linkNext={LIT.has(cell.status) && LIT.has(cells[i + 1]?.status)}
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
              <Legend hasShield={hasShield} />
            )}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default StreakWeekRow;
