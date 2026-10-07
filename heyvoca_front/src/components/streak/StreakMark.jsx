// src/components/streak/StreakMark.jsx
//
// 연속 학습 띠와 그 위의 표식 — 홈 1주 줄(StreakWeekRow) · 월 달력(StreakMonthCalendar) ·
// 학습 결과 1주 줄(farm/WeekStreakStrip)이 같은 규칙으로 그리도록 여기 한 곳에만 정의한다.
//
//   띠      연속이 이어진 날(all · part · shield)은 전부 같은 색 · 같은 높이의 띠 한 줄로 잇는다.
//           띠가 끊기는 곳은 연속이 끊긴 날뿐이다 — 상태를 배경색으로 나누면 "모두 → 일부 → 모두"
//           처럼 이어진 연속도 가운데가 끊겨 보인다(2026-10-08 QA #11).
//   표식    상태는 띠 위에 올린 표식으로만 구분한다.
//             all     색이 찬 불꽃
//             part    작은 불씨(icon-streak-ember.png — 기존 불꽃과 같은 점토 결로 새로 그린 그림)
//             shield  기존 보호권 그림(item-streak-shield.png)
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import StreakFlame from './StreakFlame';
import emberImg from '../../assets/images/farm/icon-streak-ember.png';
import shieldImg from '../../assets/images/farm/item-streak-shield.png';

/** 연속이 이어진 날 — 이 상태끼리만 띠로 잇는다 */
export const STREAK_LIT = new Set(['all', 'part', 'shield']);

/** 띠 한 토막의 색 · 입체감. 좌우로 그림자가 없어 토막을 이어 붙여도 이음매가 보이지 않는다 */
export const STREAK_BAND_CLASS = 'bg-streak-all shadow-[inset_0_-2px_0_rgba(0,0,0,.07),inset_0_1.5px_0_rgba(255,255,255,.45)] dark:shadow-[inset_0_-2px_0_rgba(0,0,0,.25)]';

/**
 * 띠 위의 표식 하나. `size` 는 표식이 차지하는 정사각 한 변(px).
 * `alive` 는 오늘 칸처럼 살아 움직여야 하는 자리에서만 켠다.
 */
const StreakMark = ({ status, size = 28, alive = false }) => {
  const reducedMotion = useReducedMotion();

  if (status === 'all') return <StreakFlame days={7} lit size={size} alive={alive} />;

  if (status === 'part') {
    // 찬 불꽃보다 한 단계 작게, 바닥에 붙여 세운다 — 같은 줄에 서면 크기만으로도 구분된다
    return (
      <span className="flex shrink-0 items-end justify-center" style={{ width: size, height: size }}>
        <motion.img
          src={emberImg}
          alt=""
          draggable={false}
          className="block origin-bottom select-none object-contain"
          style={{ width: size * 0.68, height: size * 0.68 }}
          animate={alive && !reducedMotion ? { scaleY: [1, 1.07, 0.97, 1], scaleX: [1, 0.96, 1.02, 1] } : { scaleY: 1, scaleX: 1 }}
          transition={alive && !reducedMotion ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        />
      </span>
    );
  }

  if (status === 'shield') {
    return (
      <img
        src={shieldImg}
        alt=""
        draggable={false}
        className="block shrink-0 select-none object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return null;
};

/** 범례 — 표식 그림 + 이름. 보호권은 실제로 쓰인 적이 있을 때만 보여 줄 수 있게 고를 수 있다 */
export const StreakLegend = ({ showShield = true, size = 14, className = '' }) => (
  <span className={`flex flex-wrap items-center gap-x-[12px] gap-y-[6px] ${className}`}>
    <span className="flex items-center gap-[4px]">
      <span className="flex items-center justify-center rounded-full bg-streak-all" style={{ width: size + 2, height: size + 2 }}>
        <StreakMark status="all" size={size - 1} />
      </span>
      오늘 할 일 모두
    </span>
    <span className="flex items-center gap-[4px]">
      <span className="flex items-center justify-center rounded-full bg-streak-all" style={{ width: size + 2, height: size + 2 }}>
        <StreakMark status="part" size={size - 1} />
      </span>
      일부
    </span>
    {showShield && (
      <span className="flex items-center gap-[4px]">
        <span className="flex items-center justify-center rounded-full bg-streak-all" style={{ width: size + 2, height: size + 2 }}>
          <StreakMark status="shield" size={size - 1} />
        </span>
        보호권
      </span>
    )}
  </span>
);

export default StreakMark;
