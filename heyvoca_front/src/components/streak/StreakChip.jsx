// src/components/streak/StreakChip.jsx
//
// 연속 학습 칸 한 벌 — 홈 1주 줄(StreakWeekRow) · 농장 방문 월 달력(StreakMonthCalendar) · 요약 · 범례가
// 같은 그림을 쓰도록 여기 한 곳에만 정의한다.
//
// 이슈 #25 14차 — 13차의 Phosphor 아이콘 칩(Fire · ShieldCheck)을 버리고 **기존 그림 자산**으로 돌아왔다.
//   all          큰 불꽃(icon-streak.png)          — 오늘 할 일을 모두 끝낸 날
//   part         작은 불씨(icon-streak-ember.png)   — 일부만 했지만 이어진 날(바닥에 붙여 한 단계 작게)
//   shield       보호권(item-streak-shield.png)     — 보호권으로 지킨 날
//   today_empty  오늘 아직 — 회색 원 안에 빛바랜 불씨(숨 쉬듯 깜빡일 수 있다)
//   off          꺼진 불씨(요약 · 멈춤)
//   none         쉰 날 — 옅은 점 / upcoming 다가올 날 — 더 옅은 점
//   묶음         이어진 날(all · part · shield)은 칩 뒤 **한 줄 띠**(RUN_CAPSULE_CLASS — 예전 연속 띠와 같은 색 ·
//                입체감)로 묶는다. 켜진 그림은 원형 바탕 없이 띠 위에 바로 선다(그림 자체 색이 살아 있게)
//   오늘         테두리 고리 없이 칸 아래 작은 점(TodayDot)으로만 강조한다
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import flameImg from '../../assets/images/farm/icon-streak.png';
import emberImg from '../../assets/images/farm/icon-streak-ember.png';
import shieldImg from '../../assets/images/farm/item-streak-shield.png';

export const STREAK_IMG = { flame: flameImg, ember: emberImg, shield: shieldImg };

/** 연속이 이어진 날 — 이 상태끼리만 띠로 묶는다 */
export const STREAK_LIT = new Set(['all', 'part', 'shield']);

/** 불티 색 — secondary-yellow 램프만 쓴다 */
export const CHIP_SPARKS = [
  'var(--secondary-yellow-600)',
  'var(--secondary-yellow-500)',
  'var(--secondary-yellow-400)',
  'var(--secondary-yellow-300)',
];

/** 상태별 그림 크기(칩 지름 대비) · 바닥 정렬 */
const ART = {
  all: { src: flameImg, k: 0.86, bottom: false },
  part: { src: emberImg, k: 0.62, bottom: true },
  shield: { src: shieldImg, k: 0.8, bottom: false },
};

/**
 * 칩 하나. `size` 는 지름(px).
 *   glow    — 켜진 불꽃 뒤에 은은한 빛(오늘 칸 · 요약)
 *   breathe — today_empty 의 빛바랜 불씨가 숨 쉬듯 깜빡인다
 */
export const StreakChip = ({ status, size = 32, glow = false, breathe = false, className = '' }) => {
  const reducedMotion = useReducedMotion();

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

  if (status === 'today_empty' || status === 'off') {
    const k = size * 0.56;
    return (
      <span
        className={`relative flex shrink-0 items-center justify-center rounded-full bg-layout-gray-50 dark:bg-white/[0.08] ${className}`}
        style={{ width: size, height: size }}
      >
        <motion.img
          src={emberImg}
          alt=""
          draggable={false}
          className="block select-none object-contain grayscale"
          style={{ width: k, height: k }}
          animate={breathe && !reducedMotion ? { opacity: [0.3, 0.6, 0.3] } : { opacity: 0.4 }}
          transition={breathe && !reducedMotion ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        />
      </span>
    );
  }

  const art = ART[status] ?? ART.all;
  const lit = status === 'all' || status === 'part';
  const k = size * art.k;

  return (
    <span
      className={`relative flex shrink-0 justify-center ${art.bottom ? 'items-end' : 'items-center'} ${className}`}
      style={{ width: size, height: size, paddingBottom: art.bottom ? size * 0.12 : 0 }}
    >
      {/* 빛은 그림 **뒤**에 깔린다 */}
      {glow && lit && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-[30%] rounded-full bg-[radial-gradient(circle,var(--secondary-yellow-400)_0%,transparent_66%)]"
          initial={{ opacity: 0.45 }}
          animate={reducedMotion ? { opacity: 0.45 } : { opacity: [0.3, 0.62, 0.3] }}
          transition={reducedMotion ? { duration: 0.2 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <img
        src={art.src}
        alt=""
        draggable={false}
        className="relative block select-none object-contain"
        style={{ width: k, height: k }}
      />
    </span>
  );
};

/** 오늘 표시 — 칩 아래 작은 점 */
export const TodayDot = ({ className = '' }) => (
  <i aria-hidden className={`block h-[4px] w-[4px] rounded-full bg-primary-main-600 ${className}`} />
);

/** 이어진 날들을 묶는 띠 — 예전 연속 띠(STREAK_BAND)와 같은 색 · 입체감. 그림 자산 색과 같은 램프다 */
export const RUN_CAPSULE_CLASS = 'bg-streak-all shadow-[inset_0_-2px_0_rgba(0,0,0,.07),inset_0_1.5px_0_rgba(255,255,255,.45)] dark:shadow-[inset_0_-2px_0_rgba(0,0,0,.25)]';

/**
 * 칸 배열에서 연속 구간(시작 · 끝 인덱스)을 뽑는다. isLit(cell) 이 참인 칸이 붙어 있으면 한 구간.
 * 한 칸짜리 구간도 그대로 돌려준다(그림 뒤에 동그란 띠 하나 — 이어짐이 없어도 같은 결).
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

/** 범례 — 띠 위에 선 같은 그림을 작게 */
const LegendMark = ({ status }) => (
  <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full ${RUN_CAPSULE_CLASS}`}>
    <StreakChip status={status} size={16} />
  </span>
);

export const StreakChipLegend = ({ showShield = true, className = '' }) => (
  <span className={`flex flex-wrap items-center gap-x-[12px] gap-y-[6px] ${className}`}>
    <span className="flex items-center gap-[5px]"><LegendMark status="all" />오늘 할 일 모두</span>
    <span className="flex items-center gap-[5px]"><LegendMark status="part" />일부</span>
    {showShield && (
      <span className="flex items-center gap-[5px]"><LegendMark status="shield" />보호권</span>
    )}
  </span>
);

export default StreakChip;
