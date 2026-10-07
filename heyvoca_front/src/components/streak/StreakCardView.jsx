// src/components/streak/StreakCardView.jsx
//
// 홈 연속 학습 카드의 그림 — 데이터 조회 · 정산 알림 · 재조회 시점은 home/StreakCard.jsx 가 맡고,
// 여기는 받은 값을 그리기만 한다(연속 계산 · 보호권 · 보상 로직은 건드리지 않는다).
//
//   머리말   일렁이는 불꽃(일수에 따라 커진다 · 누르면 통 튄다) + 굴러 올라가는 연속 일수 + 최장 기록 버튼
//   본문     1주 불꽃 줄(StreakWeekRow). 멈춤 알림 · 다시 잇기 도전은 예전 규칙 그대로 그 자리를 대신한다
//
// §6 — 홈은 "얼마나 해 왔나"만 말한다. 남은 거리(다음 보상까지 N일) 문구는 두지 않는다.
import React, { useMemo, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { CaretRight, Crown } from '@phosphor-icons/react';
import { haptic, SPRING, TAP, useCountUp } from '../../lib/feel';
import { CROP_ASSETS } from '../farm/CropImage';
import StreakFlame from './StreakFlame';
import StreakWeekRow from './StreakWeekRow';

/** 멈춤 기한까지 남은 시간(시간 단위, 올림) — "41시간 안에 채우면 이어져요" */
const hoursUntil = (iso) => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 3600000));
};

const EARN_BACK_LABELS = ['오늘', '내일', '모레'];

const StreakCardView = ({
  streak,
  weekCells = [],
  onOpenRecord,
  onOpenPaused,
  onStartEarnBack,
  startingEarnBack = false,
}) => {
  "use memo";

  const reducedMotion = useReducedMotion();
  const rootRef = useRef(null);
  const flameRef = useRef(null);
  // 홈에서 이 카드는 첫 화면 아래쪽에 걸쳐 있다 — 화면에 들어온 순간에 한 번 연출한다
  const seen = useInView(rootRef, { once: true, amount: 0.35 });
  const play = seen || typeof IntersectionObserver === 'undefined';

  const current = streak.current ?? 0;
  const best = streak.best ?? 0;
  const paused = !!streak.paused;
  const pause = streak.pause ?? null;
  const required = Math.max(1, streak.required ?? 5);
  const todayCorrect = streak.today_correct ?? 0;
  const todayDone = streak.today_done ?? todayCorrect >= required;
  const isRecord = current > 0 && current >= best;

  const shown = useCountUp(play || reducedMotion ? current : 0, { duration: 0.7 });

  // 다시 잇기 도전(계약 §3) — active/offered 모두 1주 줄 자리를 대신한다
  const earnBack = streak.earn_back ?? null;
  const showEarnBack = earnBack?.status === 'active' || earnBack?.status === 'offered';
  const earnBackDots = useMemo(() => {
    if (!earnBack) return [];
    const total = earnBack.days_required ?? 3;
    const doneCnt = earnBack.days_done ?? 0;
    return Array.from({ length: total }).map((_, i) => {
      let fill = 0;
      if (i < doneCnt) fill = 1;
      else if (i === doneCnt && earnBack.status === 'active' && !earnBack.today_done) {
        fill = Math.min(1, todayCorrect / required);
      }
      return { key: i, label: EARN_BACK_LABELS[i] || `${i + 1}일째`, fill };
    });
  }, [earnBack, todayCorrect, required]);
  const dayOrdinal = earnBack ? (earnBack.today_done ? (earnBack.days_done ?? 0) : (earnBack.days_done ?? 0) + 1) : 0;
  const daysLeft = earnBack ? Math.max(0, (earnBack.days_required ?? 3) - dayOrdinal) : 0;

  let statusLine = null;
  if (!paused && !showEarnBack) {
    if (todayDone) statusLine = '오늘 불꽃을 켰어요';
    else if (current > 0) statusLine = '오늘 불꽃은 아직이에요';
    else statusLine = '첫 불꽃을 기다리고 있어요';
  }

  return (
    <div
      ref={rootRef}
      className="
        rounded-[12px] p-[18px]
        bg-layout-white dark:bg-layout-gray-dark
        border border-farm-line dark:border-transparent
      "
    >
      {/* 1층 — 불꽃 · 연속 일수 · 최장 기록 */}
      <div className="flex items-center gap-[12px]">
        <motion.button
          type="button"
          aria-label="연속 학습 불꽃"
          onClick={() => { haptic('light'); flameRef.current?.play(); }}
          className="shrink-0"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
          animate={play ? { opacity: 1, scale: 1 } : undefined}
          transition={reducedMotion ? { duration: 0.15 } : SPRING.bouncy}
        >
          <StreakFlame ref={flameRef} days={paused ? 0 : current} size={46} alive={play} />
        </motion.button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-[3px] text-layout-black dark:text-layout-white">
            <span className="text-[26px] font-[800] leading-none tracking-[-0.04em] tabular-nums">{shown}</span>
            <span className="text-[14px] font-[700] tracking-[-0.03em]">일 연속</span>
            {/* 멈춤(paused) — 계약 §3 "M일 연속 옆 멈춤 태그" */}
            {paused && (
              <span className="ml-[5px] shrink-0 self-center rounded-full bg-primary-main-100 px-[8px] py-[3px] text-[10.5px] font-[800] text-primary-main-600 dark:bg-primary-main-dark dark:text-primary-main-400">
                멈춤
              </span>
            )}
          </div>
          {statusLine && (
            <p className="mt-[5px] truncate text-[11.5px] font-[600] tracking-[-0.02em] text-layout-gray-300">
              {statusLine}
            </p>
          )}
        </div>

        <motion.button
          type="button"
          onClick={onOpenRecord}
          whileTap={{ scale: TAP.scale }}
          transition={SPRING.snappy}
          className="flex shrink-0 items-center gap-[3px] rounded-full bg-layout-gray-50 py-[7px] pl-[10px] pr-[7px] text-[12px] font-[700] text-layout-gray-400 dark:bg-layout-black dark:text-layout-gray-300"
        >
          {isRecord && <Crown size={12} weight="fill" className="text-secondary-yellow-500" />}
          최장 {best}일
          <CaretRight size={10} weight="bold" className="text-layout-gray-200 dark:text-layout-gray-400" />
        </motion.button>
      </div>

      {/* 멈춤 알림 행 — 계약 §3 "보호권 이미지 · 보호권 K개가 모자라요 · N시간 안에 채우면
          이어져요 · [지키기] → paused 시트 재오픈" */}
      {paused && pause && (
        <div className="mt-[12px] flex items-center gap-[10px] rounded-[10px] bg-layout-gray-50 px-[11px] py-[10px] dark:bg-layout-black">
          <img src={CROP_ASSETS.shield} alt="" draggable={false} className="h-[28px] w-[28px] shrink-0 select-none object-contain" />
          <span className="min-w-0 flex-1 text-[12px] leading-[1.45] text-layout-gray-400 dark:text-layout-gray-300">
            <span className="block text-[12.5px] font-[800] text-layout-black dark:text-layout-white">
              보호권 {pause.short}개가 모자라요
            </span>
            {hoursUntil(pause.deadline)}시간 안에 채우면 이어져요
          </span>
          <motion.button
            type="button"
            onClick={onOpenPaused}
            whileTap={{ scale: TAP.scale }}
            transition={SPRING.snappy}
            className="h-[30px] shrink-0 rounded-[8px] bg-primary-main-600 px-[11px] text-[12px] font-[800] text-layout-white"
          >
            지키기
          </motion.button>
        </div>
      )}

      {/* 다시 잇기 도전 — 1주 줄 자리를 대신한다(계약 §3) */}
      {showEarnBack ? (
        <div className="mt-[12px] rounded-[10px] bg-layout-gray-50 p-[12px] dark:bg-layout-black">
          {earnBack.status === 'active' ? (
            <>
              <div className="flex items-center gap-[6px] text-[12.5px] font-[800] text-layout-black dark:text-layout-white">
                다시 잇기 {dayOrdinal}일째
                <span className="rounded-full bg-primary-main-100 px-[7px] py-[2px] text-[10.5px] font-[800] text-primary-main-600 dark:bg-primary-main-dark dark:text-primary-main-400">
                  오늘 {todayCorrect}/{required}
                </span>
              </div>
              <div className="mt-[4px] text-[11px] leading-[1.5] text-layout-gray-400 dark:text-layout-gray-300">
                {daysLeft > 0
                  ? `${daysLeft}일 더 하면 연속 ${earnBack.from_streak}일에 이어서 ${earnBack.result_streak}일이 돼요`
                  : `오늘 완료하면 연속 ${earnBack.result_streak}일이 돼요`}
              </div>
              <div className="mt-[10px] flex gap-[8px]">
                {earnBackDots.map((dot, i) => (
                  <div key={dot.key} className="flex flex-1 flex-col items-center gap-[5px]">
                    <span className="block h-[8px] w-full overflow-hidden rounded-full bg-primary-main-200 dark:bg-white/[0.14]">
                      <motion.span
                        className="block h-full w-full origin-left rounded-full bg-primary-main-600"
                        initial={{ scaleX: reducedMotion ? dot.fill : 0 }}
                        animate={play ? { scaleX: dot.fill } : undefined}
                        transition={{ duration: 0.5, delay: reducedMotion ? 0 : 0.1 + i * 0.12, ease: [0.3, 0.7, 0.3, 1] }}
                      />
                    </span>
                    <span className="text-[10px] font-[700] text-primary-main-600 dark:text-primary-main-400">{dot.label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="text-[12.5px] font-[800] text-layout-black dark:text-layout-white">다시 잇기 도전</div>
              <div className="mt-[4px] text-[11px] leading-[1.5] text-layout-gray-400 dark:text-layout-gray-300">
                끊긴 연속 {earnBack.from_streak}일, {earnBack.days_required}일 동안 이어가면 다시 연결돼요
              </div>
              <motion.button
                type="button"
                onClick={onStartEarnBack}
                disabled={startingEarnBack}
                whileTap={startingEarnBack ? undefined : { scale: TAP.scale }}
                transition={SPRING.snappy}
                className="mt-[10px] h-[36px] w-full rounded-[9px] bg-primary-main-600 text-[12.5px] font-[800] text-layout-white disabled:opacity-50"
              >
                도전 시작
              </motion.button>
            </>
          )}
        </div>
      ) : weekCells.length === 7 ? (
        <StreakWeekRow cells={weekCells} play={play} className="mt-[16px]" />
      ) : (
        // week 응답이 아직 없을 때(로딩·구버전 백엔드) — 빈 칸 스켈레톤만 둔다
        <div className="mt-[16px] grid grid-cols-7 gap-[6px]">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-[48px] animate-pulse rounded-[14px] bg-layout-gray-50 dark:bg-layout-black" />
          ))}
        </div>
      )}
    </div>
  );
};

export default StreakCardView;
