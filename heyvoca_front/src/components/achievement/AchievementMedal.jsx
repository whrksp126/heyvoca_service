// src/components/achievement/AchievementMedal.jsx
//
// 업적 메달 — 학습 결과 업적 슬라이드(takeTest/rewards/AchievementSlide.jsx)의 메달을
// 크기만 바꿔 어디서든 쓸 수 있게 뽑은 것. 마이페이지 '나의 업적'과 업적 달성 기준 바텀시트가 쓴다.
//
//   테두리 게이지  달성 레벨 / 최고 레벨 만큼 찬다(등장할 때 0 에서 차오른다)
//   메달 면        등급 색(동 · 은 · 금 · 무지개). 달성한 메달은 빛줄기가 가끔 지나가고 캐릭터가 살짝 떠 있다
//   레벨 알약      흰 바탕 + 등급 색 테두리 — 그림 위에 글자만 얹던 예전 표기는 겹쳐서 읽기 어려웠다
//   잠금           레벨 0 은 회색 면 + 자물쇠
//
// 눌렀을 때의 반응(젤리 · 뒤집기 · 파편)은 ref.play() 로 부른다. 누르는 영역은 호출부가 정한다.
import React, { forwardRef, useId, useImperativeHandle, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Crown, LockSimple } from '@phosphor-icons/react';
import { anim, burst, ring, jelly, FX_COLORS, FX_GOLDS } from '../takeTest/rewards/fx';
import { ACHIEVEMENT_IMAGES, achievementTier, RAINBOW_STOPS, TIER_INK } from './achievementMeta';

const AchievementMedal = forwardRef(function AchievementMedal(
  {
    type,
    level = 0,
    ratio = 0, // 테두리 게이지 채움 0~1
    size = 72,
    delay = 0, // 등장 · 반복 모션의 시작 지연(s) — 여러 개가 한 박자로 움직이지 않게
    isMax = false,
    showLevel = true,
    alive = true, // false 면 빛줄기 · 떠 있는 움직임을 끈다(캐러셀의 선택 안 된 메달)
    tapEffect = 'jelly', // 'jelly' | 'flip'
  },
  ref
) {
  const reducedMotion = useReducedMotion();
  const gradId = useId();
  const rootRef = useRef(null);
  const bodyRef = useRef(null);

  const locked = level <= 0;
  const tier = achievementTier(level);
  const ink = TIER_INK[tier.key];
  const moving = alive && !locked && !reducedMotion;

  const stroke = Math.max(3, Math.round(size * 0.055));
  const c = size / 2;
  const r = c - stroke / 2;
  const len = 2 * Math.PI * r;
  const inset = stroke + Math.max(2, Math.round(size * 0.04));
  const face = size - inset * 2;
  const pillH = Math.max(16, Math.round(size * 0.26));
  const pillFont = Math.max(10, Math.round(size * 0.17));

  useImperativeHandle(ref, () => ({
    play: () => {
      if (reducedMotion) return;
      if (tapEffect === 'flip') {
        anim(bodyRef.current, [
          { transform: 'rotateY(0deg) scale(1)' },
          { transform: 'rotateY(180deg) scale(1.16)' },
          { transform: 'rotateY(360deg) scale(1)' },
        ], { duration: 640, easing: 'cubic-bezier(.4,0,.2,1)' });
      } else {
        jelly(bodyRef.current, 0.9);
      }
      if (locked) return;
      ring(rootRef.current, c, c, { size: size * 1.7, color: tier.color, dur: 620 });
      burst(rootRef.current, c, c, {
        n: size >= 96 ? 14 : 9,
        dist: size * 0.8,
        size: Math.max(5, size * 0.07),
        colors: tier.key === 'gold' || tier.key === 'rainbow' ? FX_GOLDS : FX_COLORS,
      });
    },
  }), [reducedMotion, tapEffect, locked, c, size, tier.color, tier.key]);

  return (
    <div ref={rootRef} className="relative shrink-0 [perspective:600px]" style={{ width: size, height: size }}>
      <div ref={bodyRef} className="absolute inset-0">
        {/* 테두리 게이지 */}
        <svg viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 h-full w-full -rotate-90">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={RAINBOW_STOPS[0]} />
              <stop offset="50%" stopColor={RAINBOW_STOPS[1]} />
              <stop offset="100%" stopColor={RAINBOW_STOPS[2]} />
            </linearGradient>
          </defs>
          <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="stroke-layout-gray-100 dark:stroke-[#333333]" />
          {!locked && (
            <motion.circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={tier.key === 'rainbow' ? `url(#${gradId})` : tier.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={len}
              initial={{ strokeDashoffset: reducedMotion ? len * (1 - ratio) : len }}
              animate={{ strokeDashoffset: len * (1 - ratio) }}
              transition={{ duration: 0.8, delay: 0.15 + delay, ease: [0.3, 0.7, 0.3, 1] }}
            />
          )}
        </svg>

        {/* 메달 면 */}
        <div
          className={`absolute overflow-hidden rounded-full ${
            locked
              ? 'bg-layout-gray-100 dark:bg-[#2A2A2A] shadow-[inset_0_-3px_0_rgba(0,0,0,.08)]'
              : 'shadow-[inset_0_-4px_0_rgba(0,0,0,.14),inset_0_3px_0_rgba(255,255,255,.4)]'
          }`}
          style={{ left: inset, top: inset, width: face, height: face, ...(locked ? {} : { background: tier.bg }) }}
        >
          {/* 빛줄기 — 달성한 메달 위를 몇 초에 한 번 지나간다 */}
          {moving && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-[42%] -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent"
              initial={{ x: '-140%' }}
              animate={{ x: '340%' }}
              transition={{ duration: 0.9, delay: 0.9 + delay * 2.2, repeat: Infinity, repeatDelay: 3.6, ease: 'easeInOut' }}
            />
          )}
        </div>

        {/* 캐릭터 — 귀가 테두리 위로 살짝 올라온다(슬라이드 메달과 같은 비율) */}
        <motion.img
          src={ACHIEVEMENT_IMAGES[type]}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute select-none object-contain ${locked ? 'opacity-45 grayscale' : ''}`}
          style={{ left: inset - face * 0.03, top: inset - face * 0.12, width: face * 1.06, height: face * 1.06 }}
          animate={moving ? { y: [0, -size * 0.035, 0] } : { y: 0 }}
          transition={moving ? { duration: 2.8, delay, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
        />

        {/* 레벨 알약 / 자물쇠 */}
        {showLevel && (
          locked ? (
            <span
              className="absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-full border-[1.5px] border-layout-gray-100 bg-layout-white text-layout-gray-300 dark:border-[#3A3A3A] dark:bg-[#1C1C1C] dark:text-layout-gray-300"
              style={{ bottom: -pillH * 0.32, width: pillH, height: pillH }}
            >
              <LockSimple size={Math.round(pillH * 0.6)} weight="fill" />
            </span>
          ) : (
            <span
              className="absolute left-1/2 flex -translate-x-1/2 items-center gap-[1px] whitespace-nowrap rounded-full border-[1.5px] bg-layout-white font-[800] leading-none tabular-nums text-[color:var(--ink)] dark:bg-[#1C1C1C] dark:text-[color:var(--ink-d)]"
              style={{
                bottom: -pillH * 0.32,
                height: pillH,
                padding: `0 ${Math.round(pillH * 0.4)}px`,
                fontSize: pillFont,
                borderColor: tier.color,
                '--ink': ink.light,
                '--ink-d': ink.dark,
              }}
            >
              {isMax ? (
                <>
                  <Crown size={pillFont} weight="fill" />
                  <span>MAX</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: Math.round(pillFont * 0.72) }}>LV.</span>
                  <span>{level}</span>
                </>
              )}
            </span>
          )
        )}
      </div>
    </div>
  );
});

export default AchievementMedal;
