// src/components/streak/HomeFlameChip.jsx
//
// 홈 상단 바의 연속 학습 칩 — 보석 칩(Main.jsx #home-gem-chip)과 같은 형태(그림 22px + 숫자, 같은 크기·글꼴·패딩).
// 그림은 기존 streak 자산 그대로, 상태는 예전 '오늘의 불꽃'(TodayFlameHero)·1주 줄 오늘 칸과 같은 규칙.
//   level 2        오늘 할 일 모두 — 큰 불꽃 + 빛 (icon-streak.png)
//   level 1        일부 — 불꽃 (icon-streak.png)
//   shield         보호권으로 유지 중 — 보호권 그림 (item-streak-shield.png)
//   level 0 / 멈춤 아직 안 켜짐 — 꺼진 불씨(회색 · icon-streak-ember.png)
// 연출 신호(오늘 할 일 카드가 올린다): feedKey 불티 도착(통 튐) · evolveKey 단계 상승(빛 고리·불티) · bump 숫자 튐.
// 불티가 날아오는 목적지(ref)는 칩의 그림 상자다.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SPRING } from '../../lib/feel';
import { burst, jelly, ring } from '../takeTest/rewards/fx';
import { STREAK_IMG, CHIP_SPARKS } from './StreakChip';

const BOX = 22;

const HomeFlameChip = forwardRef(function HomeFlameChip(
  { level = 0, shield = false, paused = false, count = 0, feedKey = 0, evolveKey = 0, bump = 0, onClick },
  ref
) {
  const reducedMotion = useReducedMotion();
  const boxRef = useRef(null);
  const bodyRef = useRef(null);
  useImperativeHandle(ref, () => boxRef.current, []);

  const lit = level >= 1 && !paused;
  const showShield = !lit && shield;
  const src = lit ? STREAK_IMG.flame : showShield ? STREAK_IMG.shield : STREAK_IMG.ember;

  useEffect(() => {
    if (!feedKey || reducedMotion) return;
    jelly(bodyRef.current, 0.7);
  }, [feedKey, reducedMotion]);

  useEffect(() => {
    if (!evolveKey || reducedMotion) return;
    const box = boxRef.current;
    if (!box) return;
    ring(box, BOX / 2, BOX / 2, { size: BOX * 2.6, color: 'var(--secondary-yellow-400)', dur: 720 });
    burst(box, BOX / 2, BOX / 2, { n: 12, dist: BOX * 1.4, size: 5, colors: CHIP_SPARKS, up: 8, dur: 860 });
  }, [evolveKey, reducedMotion]);

  return (
    <button
      id="home-flame-chip"
      type="button"
      onClick={onClick}
      aria-label={`연속 학습 ${count}일`}
      className="
        inline-flex items-center gap-[6px]
        h-[36px] pl-[6px] pr-[12px] rounded-full
        bg-layout-white/90 dark:bg-layout-gray-dark/90 backdrop-blur-[8px]
        shadow-[0_2px_8px_rgba(96,80,52,.16)] dark:shadow-[0_2px_8px_rgba(0,0,0,.4)]
        text-[16px] font-[700] tracking-[-0.02em]
        text-layout-black dark:text-layout-white
      "
    >
      <span ref={boxRef} className="relative block h-[22px] w-[22px]">
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-[30%] rounded-full bg-[radial-gradient(circle,var(--secondary-yellow-400)_0%,transparent_66%)]"
          initial={false}
          animate={{ opacity: lit ? (level >= 2 ? 0.55 : 0.3) : 0 }}
          transition={{ duration: 0.4 }}
        />
        <span ref={bodyRef} className="absolute inset-0 block">
          <img
            src={src}
            alt=""
            draggable={false}
            className={`relative block h-[22px] w-[22px] select-none object-contain ${lit || showShield ? '' : 'grayscale opacity-50'}`}
          />
        </span>
      </span>
      <motion.span
        key={bump}
        className="inline-block origin-bottom-left tabular-nums"
        initial={bump && !reducedMotion ? { scale: 1.35 } : false}
        animate={{ scale: 1 }}
        transition={SPRING.bouncy}
      >
        {count}
      </motion.span>
    </button>
  );
});

export default HomeFlameChip;
