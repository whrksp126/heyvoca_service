// src/components/streak/StreakFlame.jsx
//
// 연속 학습 불꽃 — 홈 연속 학습 카드와 농장 방문 화면이 같이 쓴다.
//
//   크기      연속 일수가 길수록 불꽃이 커진다(flameTier). 0일은 꺼진 회색 불씨다
//   일렁임    몸통과 속불이 서로 다른 박자로 늘었다 줄고, 긴 연속은 불티가 위로 날린다
//   탭 반응   ref.play() — 통 튀고(젤리) 불티가 흩어진다. 누르는 영역은 호출부가 정한다
//
// 그림은 기존 불꽃 아이콘(icon-streak.png)과 같은 주황 램프(secondary-yellow)로 직접 그린 SVG 다 —
// 원본 PNG 는 132px 이라 크게 키우면 흐려지고, 몸통과 속불을 따로 움직일 수도 없다.
import React, { forwardRef, useId, useImperativeHandle, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { burst, ring, jelly } from '../takeTest/rewards/fx';

/** 불티·파편 색 — 새 색을 만들지 않고 secondary-yellow 램프만 쓴다 */
export const FLAME_SPARKS = [
  'var(--secondary-yellow-600)',
  'var(--secondary-yellow-400)',
  'var(--secondary-yellow-300)',
  'var(--secondary-yellow-500)',
];

const TIERS = [
  { min: 30, scale: 1, embers: 4, glow: 0.75, speed: 1.15 },
  { min: 14, scale: 0.96, embers: 3, glow: 0.62, speed: 1.3 },
  { min: 7, scale: 0.91, embers: 2, glow: 0.5, speed: 1.45 },
  { min: 3, scale: 0.85, embers: 1, glow: 0.4, speed: 1.6 },
  { min: 1, scale: 0.77, embers: 0, glow: 0.3, speed: 1.8 },
];

/** 연속 일수 → 불꽃 단계(크기 · 불티 수 · 빛 세기 · 일렁이는 박자) */
export const flameTier = (days) => TIERS.find((t) => days >= t.min) ?? null;

const BODY = 'M25 2C27 11 37 15 41 26C45 37 40 52 24 54C9 52 3 40 7 29C9 23 13 20 15 15C17 20 19 22 22 22C22 14 22 8 25 2Z';
const CORE = 'M24 51C16 50 13 43 16 37C18 33 21 31 23 26C26 31 33 35 32 43C31 48 28 51 24 51Z';

const FlameArt = ({ layer }) => {
  const id = useId();
  return (
    <svg viewBox="0 0 48 56" aria-hidden className="block h-full w-full overflow-visible">
      <defs>
        <linearGradient id={`${id}b`} x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0%" className="[stop-color:var(--secondary-yellow-400)]" />
          <stop offset="42%" className="[stop-color:var(--secondary-yellow-500)]" />
          <stop offset="100%" className="[stop-color:var(--secondary-yellow-600)]" />
        </linearGradient>
        <linearGradient id={`${id}c`} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" className="[stop-color:var(--secondary-yellow-300)]" />
          <stop offset="100%" className="[stop-color:var(--secondary-yellow-200)]" />
        </linearGradient>
      </defs>
      {layer === 'body' ? (
        <>
          <path d={BODY} fill={`url(#${id}b)`} />
          {/* 아래쪽 그늘 · 왼쪽 위 광택 — 둥글고 도톰한 덩어리로 보이게 */}
          <path d="M24 54C9 52 3 40 7 29C8 41 14 49 24 50C34 49 40 42 41 30C44 41 38 52 24 54Z" className="fill-secondary-yellow-600 opacity-45" />
          <path d="M12 31C12 26 15 23 17 21C16 26 16 31 18 35C15 36 12 34 12 31Z" className="fill-layout-white opacity-40" />
        </>
      ) : (
        <path d={CORE} fill={`url(#${id}c)`} />
      )}
    </svg>
  );
};

const StreakFlame = forwardRef(function StreakFlame(
  {
    days = 0,
    size = 44,
    lit, // 생략하면 days > 0. 달력 칸처럼 일수와 무관하게 켜진 불꽃을 그릴 때 true 를 준다
    alive = true, // false 면 일렁임 · 불티를 끈다(여러 개가 한꺼번에 서는 달력 칸)
    delay = 0,
  },
  ref
) {
  const reducedMotion = useReducedMotion();
  const rootRef = useRef(null);
  const bodyRef = useRef(null);

  const isLit = lit ?? days > 0;
  const tier = flameTier(days) ?? TIERS[TIERS.length - 1];
  const moving = alive && isLit && !reducedMotion;

  const h = size * (isLit ? tier.scale : 0.74);
  const w = (h * 48) / 56;
  const glow = size * 1.3;

  useImperativeHandle(ref, () => ({
    play: () => {
      if (reducedMotion) return;
      jelly(bodyRef.current, 0.9);
      if (!isLit) return;
      ring(rootRef.current, size / 2, size * 0.55, { size: size * 1.7, color: 'var(--secondary-yellow-400)', dur: 620 });
      burst(rootRef.current, size / 2, size * 0.5, {
        n: size >= 56 ? 14 : 9,
        dist: size * 0.85,
        size: Math.max(4, size * 0.09),
        colors: FLAME_SPARKS,
        up: size * 0.2,
      });
    },
  }), [reducedMotion, isLit, size]);

  return (
    <div ref={rootRef} className="relative shrink-0" style={{ width: size, height: size }}>
      {/* 바닥에 깔리는 빛 — 불꽃이 클수록 진하다 */}
      {isLit && alive && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-[radial-gradient(circle,var(--secondary-yellow-400)_0%,transparent_66%)]"
          style={{ width: glow, height: glow, left: (size - glow) / 2, top: (size - glow) / 2 + size * 0.08 }}
          initial={{ opacity: tier.glow * 0.7 }}
          animate={moving ? { opacity: [tier.glow * 0.55, tier.glow, tier.glow * 0.55] } : { opacity: tier.glow * 0.7 }}
          transition={moving ? { duration: tier.speed * 1.4, delay, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        />
      )}

      <div ref={bodyRef} className="absolute inset-0 flex items-end justify-center">
        <motion.div
          className={`relative origin-bottom ${isLit ? '' : 'opacity-55 grayscale'}`}
          style={{ width: w, height: h }}
          animate={moving
            ? { scaleY: [1, 1.06, 0.97, 1.04, 1], scaleX: [1, 0.96, 1.03, 0.98, 1], rotate: [0, -2.2, 1.6, -1, 0] }
            : { scaleY: 1, scaleX: 1, rotate: 0 }}
          transition={moving ? { duration: tier.speed, delay, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        >
          <FlameArt layer="body" />
          <motion.div
            className="absolute inset-0 origin-bottom"
            animate={moving ? { scaleY: [1, 1.13, 0.93, 1.08, 1], scaleX: [1, 0.94, 1.05, 0.97, 1] } : { scaleY: 1, scaleX: 1 }}
            transition={moving ? { duration: tier.speed * 0.68, delay, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          >
            <FlameArt layer="core" />
          </motion.div>
        </motion.div>
      </div>

      {/* 불티 — 3일부터 하나씩 늘어난다 */}
      {moving && Array.from({ length: tier.embers }).map((_, i) => {
        const s = Math.max(2.5, size * (i % 2 ? 0.05 : 0.07));
        const drift = (i % 2 ? 1 : -1) * size * (0.1 + i * 0.04);
        return (
          <motion.span
            key={i}
            aria-hidden
            className={`pointer-events-none absolute rounded-full ${i % 2 ? 'bg-secondary-yellow-400' : 'bg-secondary-yellow-500'}`}
            style={{ width: s, height: s, left: size * (0.34 + i * 0.11), top: size * 0.3 }}
            initial={{ opacity: 0 }}
            animate={{ y: [0, -size * 0.6], x: [0, drift], opacity: [0, 0.95, 0], scale: [1, 0.4] }}
            transition={{ duration: 1.5 + i * 0.25, delay: delay + 0.3 + i * 0.55, repeat: Infinity, repeatDelay: 0.5 + i * 0.2, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
});

export default StreakFlame;
