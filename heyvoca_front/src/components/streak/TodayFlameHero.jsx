// src/components/streak/TodayFlameHero.jsx
//
// 홈 '오늘 할 일' 카드의 머리 — 이슈 #25 14차 콘셉트 「할 일이 오늘의 불꽃을 키운다」.
//
//   불꽃    오늘 할 일을 하나씩 끝낼 때마다 커진다. 기존 그림 자산을 단계 그대로 쓴다
//             level 0  아무것도 안 함      → 작은 불씨(icon-streak-ember.png), 숨 쉬듯 깜빡
//             level 1  일부 완료          → 불꽃(icon-streak.png)이 작게 — 끝낸 비율만큼 조금씩 커진다
//             level 2  전부 완료          → 큰 불꽃 + 진한 빛 + 위로 날리는 불티
//   숫자    불꽃 옆 「N일 연속」 큰 숫자 — 누르면 농장 방문 기록(onOpenRecord)
//   문구    지금 단계를 한 줄로(할 일 개수는 아래 목록 머리말이 말한다 — 중복하지 않는다)
//
// 연출 신호(호출부 TodayTasksCard 가 올린다)
//   feedKey    불티가 불꽃에 막 들어왔다 — 불꽃이 통 튄다
//   evolveKey  불꽃 단계가 올랐다 — 섬광 · 빛 고리 · 불티가 퍼지며 크게 타오른다
//   bump       연속 일수가 막 늘었다 — 숫자가 한 번 통 튄다
// flameRef 는 불티가 날아갈 목표(불꽃 상자)로 호출부에 넘긴다.
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CaretRight } from '@phosphor-icons/react';
import { SPRING, TAP } from '../../lib/feel';
import { burst, jelly, ring } from '../takeTest/rewards/fx';
import { STREAK_IMG, CHIP_SPARKS } from './StreakChip';

const BOX = 76; // 불꽃 상자 한 변(px)

/** 단계 · 끝낸 비율 → 그림 크기(상자 대비) */
const flameScale = (level, fraction) => {
  if (level >= 2) return 1;
  if (level === 1) return 0.6 + 0.24 * Math.min(1, Math.max(0, fraction));
  return 0.5;
};

const GLOW = [0.18, 0.42, 0.75];
const HALO_DUR = 2.8; // 잔상 빛 한 주기(초) — 두 겹이 반 주기씩 어긋나 돈다

const captionOf = (level, hasTasks) => {
  if (level >= 2) return '오늘 불꽃이 활짝 타올랐어요';
  if (level === 1) return '불꽃이 자라고 있어요';
  return hasTasks ? '할 일을 끝낼 때마다 불꽃이 커져요' : '오늘은 돌볼 일이 없어요';
};

const TodayFlameHero = forwardRef(function TodayFlameHero(
  {
    level = 0,
    fraction = 0,
    count = 0,
    paused = false,
    hasTasks = true,
    onOpenRecord,
    feedKey = 0,
    evolveKey = 0,
    bump = 0,
  },
  ref
) {
  const reducedMotion = useReducedMotion();
  const boxRef = useRef(null);
  const bodyRef = useRef(null);
  useImperativeHandle(ref, () => boxRef.current, []);

  const moving = !reducedMotion;
  const isEmber = level === 0;
  const scale = flameScale(level, fraction);
  const size = BOX * scale;

  // 불티가 들어올 때 — 불꽃이 통 튄다
  useEffect(() => {
    if (!feedKey || reducedMotion) return;
    jelly(bodyRef.current, 0.7);
  }, [feedKey, reducedMotion]);

  // 단계 상승 — 빛 고리 · 불티가 퍼진다
  useEffect(() => {
    if (!evolveKey || reducedMotion) return;
    const box = boxRef.current;
    if (!box) return;
    ring(box, BOX / 2, BOX * 0.58, { size: BOX * 2, color: 'var(--secondary-yellow-400)', dur: 720 });
    burst(box, BOX / 2, BOX * 0.55, { n: 16, dist: BOX * 0.8, size: 6, colors: CHIP_SPARKS, up: 18, dur: 860 });
  }, [evolveKey, reducedMotion]);

  return (
    <motion.button
      type="button"
      onClick={onOpenRecord}
      aria-label={`연속 ${count}일 — 기록 보기`}
      whileTap={{ scale: TAP.scale }}
      transition={SPRING.snappy}
      className="flex w-full items-center gap-[12px] text-left"
    >
      <span ref={boxRef} className="relative shrink-0" style={{ width: BOX, height: BOX }}>
        {/* 화덕 그림자 — 불꽃이 바닥에 서 있게 */}
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[3px] left-[14px] right-[14px] h-[10px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(96,80,52,.22)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,.5)_0%,transparent_70%)]"
        />
        {/* 빛 — 단계가 오를수록 진하다. 바탕 빛은 반복하지 않고 단계가 바뀔 때만 opacity 를 옮긴다 */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-[22%] rounded-full bg-[radial-gradient(circle,var(--secondary-yellow-400)_0%,transparent_64%)]"
          initial={false}
          animate={{ opacity: GLOW[level] * (moving ? 0.55 : 0.85) }}
          transition={{ duration: 0.4 }}
        />
        {/* 잔상 빛 — 이슈 #25 15차. 예전엔 한 겹이 0.7→1→0.7 로 숨 쉬다 반복 경계에서 뚝 끊겨 보였다.
            이제 두 겹이 위상차(반 주기)를 두고 opacity 0 에서 서서히 나타나 커지며 퍼지고 0 으로 사라진다.
            키프레임 시작·끝이 모두 opacity 0 이라 loop 이음매가 보이지 않는다. transform·opacity 만 쓴다 */}
        {/* 단계별 진하기는 바깥 겹이 맡는다 — 단계가 바뀌어도 안쪽 루프가 다시 시작되며 튀지 않게 */}
        {moving && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={false}
            animate={{ opacity: GLOW[level] * 0.9 }}
            transition={{ duration: 0.4 }}
          >
            {[0, 1].map((i) => (
              <motion.span
                key={i}
                className="absolute -inset-[22%] rounded-full bg-[radial-gradient(circle,var(--secondary-yellow-400)_0%,transparent_64%)] will-change-transform"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: [0, 1, 0], scale: [0.7, 1.05, 1.35] }}
                transition={{
                  duration: HALO_DUR,
                  times: [0, 0.4, 1],
                  ease: 'easeInOut',
                  repeat: Infinity,
                  repeatType: 'loop',
                  delay: i * (HALO_DUR / 2),
                }}
              />
            ))}
          </motion.span>
        )}
        {/* 단계 상승 섬광 */}
        {evolveKey > 0 && !reducedMotion && (
          <motion.span
            key={evolveKey}
            aria-hidden
            className="pointer-events-none absolute -inset-[10%] rounded-full bg-[radial-gradient(circle,var(--secondary-yellow-300)_0%,transparent_70%)]"
            initial={{ opacity: 1, scale: 0.5 }}
            animate={{ opacity: 0, scale: 2 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        )}

        <span ref={bodyRef} className="absolute inset-0 flex items-end justify-center pb-[6px]">
          <motion.span
            className="relative block origin-bottom"
            initial={false}
            animate={{ width: size, height: size }}
            transition={reducedMotion ? { duration: 0.15 } : SPRING.bouncy}
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.img
                key={isEmber ? 'ember' : 'flame'}
                src={isEmber ? STREAK_IMG.ember : STREAK_IMG.flame}
                alt=""
                draggable={false}
                className="absolute inset-0 block h-full w-full origin-bottom select-none object-contain"
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                animate={moving
                  ? (isEmber
                    ? { opacity: [0.75, 1, 0.75], scale: 1 }
                    : { opacity: 1, scale: 1, scaleY: [1, 1.06, 0.97, 1.04, 1], scaleX: [1, 0.96, 1.03, 0.98, 1], rotate: [0, -2, 1.5, -1, 0] })
                  : { opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: reducedMotion ? 1 : 1.3 }}
                transition={moving
                  ? {
                    opacity: isEmber ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.25 },
                    scale: SPRING.bouncy,
                    scaleY: { duration: level >= 2 ? 1.2 : 1.6, repeat: Infinity, ease: 'easeInOut' },
                    scaleX: { duration: level >= 2 ? 1.2 : 1.6, repeat: Infinity, ease: 'easeInOut' },
                    rotate: { duration: level >= 2 ? 1.2 : 1.6, repeat: Infinity, ease: 'easeInOut' },
                  }
                  : { duration: 0.15 }}
              />
            </AnimatePresence>
          </motion.span>
        </span>

        {/* 큰 불꽃은 불티가 위로 날린다 */}
        {level >= 2 && moving && [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className={`pointer-events-none absolute rounded-full ${i % 2 ? 'bg-secondary-yellow-400' : 'bg-secondary-yellow-500'}`}
            style={{ width: i % 2 ? 4 : 5, height: i % 2 ? 4 : 5, left: BOX * (0.36 + i * 0.12), top: BOX * 0.3 }}
            initial={{ opacity: 0 }}
            animate={{ y: [0, -BOX * 0.5], x: [0, (i % 2 ? 1 : -1) * 8], opacity: [0, 0.95, 0], scale: [1, 0.4] }}
            transition={{ duration: 1.5 + i * 0.25, delay: 0.3 + i * 0.5, repeat: Infinity, repeatDelay: 0.4, ease: 'easeOut' }}
          />
        ))}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-[3px] text-layout-black dark:text-layout-white">
          <motion.span
            key={bump}
            className="inline-block origin-bottom-left text-[34px] font-[800] leading-none tracking-[-0.05em] tabular-nums"
            initial={bump && !reducedMotion ? { scale: 1.35 } : false}
            animate={{ scale: 1 }}
            transition={SPRING.bouncy}
          >
            {count}
          </motion.span>
          <span className="text-[15px] font-[700] tracking-[-0.03em]">일 연속</span>
          {paused && (
            <span className="ml-[4px] shrink-0 self-center rounded-full bg-primary-main-100 px-[7px] py-[2px] text-[10.5px] font-[800] text-primary-main-600 dark:bg-primary-main-dark dark:text-primary-main-400">
              멈춤
            </span>
          )}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${level}-${hasTasks ? 1 : 0}`}
            className="mt-[6px] block truncate text-[12.5px] font-[600] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300"
            initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -4 }}
            transition={{ duration: 0.16 }}
          >
            {captionOf(level, hasTasks)}
          </motion.span>
        </AnimatePresence>
      </span>
      <CaretRight size={14} weight="bold" className="shrink-0 text-layout-gray-200 dark:text-layout-gray-400" />
    </motion.button>
  );
});

export default TodayFlameHero;
