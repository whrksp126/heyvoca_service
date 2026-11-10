// src/components/streak/StreakChip.jsx
//
// 연속 학습 시각 언어(이슈 #25 13차) — 홈 '오늘 할 일' 카드의 1주 줄 · 농장 방문 화면(요약 · 월 달력 ·
// 선택한 날 · 범례)이 **같은 칩 하나**로 그린다. 예전엔 큰 불꽃 그림 · 작은 불씨 그림 · 보호권 그림 ·
// 날짜를 잇는 띠 · 오늘 고리가 서로 다른 결이라 한 화면에서 어긋나 보였다.
//
//   칩       모든 날은 같은 크기의 원. 상태는 칩의 채움 + Phosphor 아이콘 하나로만 말한다.
//              all          불꽃 칩(secondary-yellow-500 채움 · 흰 Fire)
//              part         옅은 불꽃 칩(secondary-yellow-300 채움 · 주황 Fire) — '일부'
//              shield       방패 칩(secondary-mint 채움 · ShieldCheck)
//              today_empty  아직 켜지 않은 오늘 — 회색 바탕에 윤곽 Fire 가 숨 쉰다
//              none         쉰 날 — 옅은 점
//              upcoming     다가올 날 — 더 옅은 점
//   묶음     연속이 이어진 날들은 칩 뒤에 **하나의 둥근 캡슐**(StreakRunCapsule)로 묶는다(얇은 선 대신)
//   오늘     테두리 고리 대신 칩 아래 작은 점(TodayDot)으로만 강조한다
//   크기     아이콘은 칩 지름의 0.54 — 모든 자리가 같은 비율이라 크기가 달라도 한 벌로 읽힌다
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Fire, ShieldCheck } from '@phosphor-icons/react';

/** 연속이 이어진 날 — 이 상태끼리만 캡슐로 묶는다 */
export const STREAK_LIT = new Set(['all', 'part', 'shield']);

/** 불티 색 — secondary-yellow 램프만 쓴다 */
export const CHIP_SPARKS = [
  'var(--secondary-yellow-600)',
  'var(--secondary-yellow-500)',
  'var(--secondary-yellow-400)',
  'var(--secondary-yellow-300)',
];

const ICON_RATIO = 0.54;

const CHIP_CLASS = {
  all: 'bg-secondary-yellow-500 text-layout-white shadow-[inset_0_-2px_0_rgba(0,0,0,.08)]',
  part: 'bg-secondary-yellow-300 text-secondary-yellow-600 dark:bg-streak-all dark:text-secondary-yellow-400',
  shield: 'bg-secondary-mint-100 text-secondary-mint-600 dark:bg-secondary-mint-dark dark:text-secondary-mint-400',
  today_empty: 'bg-layout-gray-50 text-layout-gray-300 dark:bg-white/[0.08] dark:text-layout-gray-400',
  off: 'bg-layout-gray-50 text-layout-gray-300 dark:bg-white/[0.08] dark:text-layout-gray-400',
};

/**
 * 칩 하나. `size` 는 지름(px).
 *   glow  — 켜진 불꽃 칩 둘레에 은은한 빛(오늘 칸 · 요약 칩)
 *   breathe — today_empty 의 윤곽 불꽃이 숨 쉬듯 깜빡인다
 */
export const StreakChip = ({ status, size = 32, glow = false, breathe = false, className = '' }) => {
  const reducedMotion = useReducedMotion();
  const iconSize = Math.round(size * ICON_RATIO);

  if (status === 'none' || status === 'upcoming') {
    const dot = Math.max(4, Math.round(size * 0.16));
    return (
      <span className={`flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
        <i
          className={`block rounded-full ${status === 'upcoming'
            ? 'bg-layout-gray-100 dark:bg-white/[0.1]'
            : 'bg-layout-gray-200 dark:bg-layout-gray-500'}`}
          style={{ width: dot, height: dot }}
        />
      </span>
    );
  }

  const cls = CHIP_CLASS[status] ?? CHIP_CLASS.off;
  const lit = status === 'all' || status === 'part';

  return (
    <span className={`relative flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {/* 빛은 칩 **뒤**에 깔린다 — 칩 바탕 위에 얹으면 채움색이 탁해진다 */}
      {glow && lit && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-[35%] rounded-full bg-[radial-gradient(circle,var(--secondary-yellow-400)_0%,transparent_68%)]"
          initial={{ opacity: 0.45 }}
          animate={reducedMotion ? { opacity: 0.45 } : { opacity: [0.3, 0.62, 0.3] }}
          transition={reducedMotion ? { duration: 0.2 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <span className={`relative flex h-full w-full items-center justify-center rounded-full ${cls}`}>
      {status === 'shield' ? (
        <ShieldCheck size={iconSize} weight="fill" className="relative" />
      ) : status === 'today_empty' || status === 'off' ? (
        <motion.span
          className="relative flex"
          animate={breathe && !reducedMotion ? { opacity: [0.45, 1, 0.45] } : { opacity: 0.8 }}
          transition={breathe && !reducedMotion ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        >
          <Fire size={iconSize} weight="bold" />
        </motion.span>
      ) : (
        <Fire size={iconSize} weight="fill" className="relative" />
      )}
      </span>
    </span>
  );
};

/** 오늘 표시 — 칩 아래 작은 점 */
export const TodayDot = ({ className = '' }) => (
  <i aria-hidden className={`block h-[4px] w-[4px] rounded-full bg-primary-main-600 ${className}`} />
);

/** 이어진 날들을 묶는 캡슐 색 — 칩보다 한 단계 옅다 */
export const RUN_CAPSULE_CLASS = 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark';

/**
 * 칸 배열에서 연속 구간(시작 · 끝 인덱스)을 뽑는다. isLit(cell) 이 참인 칸이 붙어 있으면 한 구간.
 * 한 칸짜리 구간도 그대로 돌려준다(칩 뒤에 동그란 캡슐 하나 — 이어짐이 없어도 같은 결).
 */
export const litRuns = (cells, isLit) => {
  const runs = [];
  let start = -1;
  cells.forEach((c, i) => {
    const lit = c && isLit(c);
    if (lit && start === -1) start = i;
    if (!lit && start !== -1) { runs.push([start, i - 1]); start = -1; }
  });
  if (start !== -1) runs.push([start, cells.length - 1]);
  return runs;
};

/** 범례 — 같은 칩을 작게 */
export const StreakChipLegend = ({ showShield = true, className = '' }) => (
  <span className={`flex flex-wrap items-center gap-x-[12px] gap-y-[6px] ${className}`}>
    <span className="flex items-center gap-[5px]"><StreakChip status="all" size={16} />오늘 할 일 모두</span>
    <span className="flex items-center gap-[5px]"><StreakChip status="part" size={16} />일부</span>
    {showShield && (
      <span className="flex items-center gap-[5px]"><StreakChip status="shield" size={16} />보호권</span>
    )}
  </span>
);

export default StreakChip;
