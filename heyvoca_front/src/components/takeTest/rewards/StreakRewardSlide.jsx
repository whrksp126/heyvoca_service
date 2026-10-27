// src/components/takeTest/rewards/StreakRewardSlide.jsx
//
// 연속 학습 달성 — 큰 불꽃이 솟아 자리 잡고, 연속 일수가 어제 값에서 오늘 값으로 굴러 넘어간 뒤,
// 1주 띠의 오늘 칸에 불이 '붙는다'(2026-10-28 QA #19 — 예전엔 문구 + 띠만 있어 화면 대부분이 비었다).
// 이 슬라이드는 오늘 문턱을 이 세션에서 처음 넘겼을 때만 만들어진다(StudyResult 의 push 조건).
//
//   0ms     바닥 빛                          select
//   120ms   불꽃이 아래에서 솟아오른다
//   280ms                                    bonus — 착지에 맞춰 먼저 발사
//   520ms   착지 — 젤리 · 불티 · 고리 · 뒤 빛
//   660ms   숫자 등장(어제 값)
//   900ms   숫자가 오늘 값으로 굴러 넘어간다    tap
//   1150ms  한 줄 문구
//   1350ms  1주 띠(오늘 칸은 아직 빈칸)
//   1750ms  오늘 칸에 불꽃이 튀어 들어온다      correct — 링 펄스 시작
//   2050ms  격려 한 줄(내일도 이어가면 N+1일)
//   2250ms  「확인」 켜짐                      select
//
// 보호권으로 지킨 날(방패)·끊긴 날 표현은 WeekStreakCell(홈과 같은 그림) 그대로다 — 오늘 칸만 연출한다.
// 전부 transform / opacity 만 움직인다(저사양 Android WebView). 동작 줄이기면 최종 상태만 바로 보인다.
import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import StreakFlame, { FLAME_SPARKS } from '../../streak/StreakFlame';
import { STREAK_LIT } from '../../streak/StreakMark';
import { WeekStreakCell } from '../../farm/WeekStreakStrip';
import { useRewardTimeline } from './useRewardTimeline';
import { anim, burst, ring, pulse, clearFx, BACK_OUT } from './fx';
import RewardGlow from './RewardGlow';

const LAND = 520;
const ROLL_AT = 900;
const STRIP_AT = 1350;
const IGNITE_AT = 1750;
const HERO = 190;          // 주인공 상자 한 변
const FLAME = 140;         // 불꽃 크기
const C = HERO / 2;
const FLOOR = 160;         // 착지 지점(상자 안 y)

const FADE_UP = 'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none';

const StreakRewardSlide = ({ current = 0, cells = [], reducedMotion, onReady, skipRef }) => {
  const days = Math.max(1, Number(current) || 0);
  const prevDays = days - 1;

  const [risen, setRisen] = useState(false);
  const [landed, setLanded] = useState(false);
  const [numShown, setNumShown] = useState(false);
  const [rolled, setRolled] = useState(false);
  const [texted, setTexted] = useState(false);
  const [stripShown, setStripShown] = useState(false);
  const [ignited, setIgnited] = useState(false);
  const [tail, setTail] = useState(false);

  const stageRef = useRef(null);
  const heroRef = useRef(null);
  const riseRef = useRef(null);
  const flameRef = useRef(null);
  const numRef = useRef(null);
  const todayRef = useRef(null);

  const hasWeek = cells.length === 7;
  const todayIdx = cells.findIndex((d) => d.isToday);
  // 불이 붙기 전에는 오늘 칸을 빈칸(점선)으로 보여 준다 — 붙는 순간이 곧 '오늘을 지켰다'는 사건이다.
  // 오늘 칸이 원래 켜진 상태가 아니면(드묾) 연출할 게 없으니 그대로 둔다.
  const todayLit = todayIdx >= 0 && STREAK_LIT.has(cells[todayIdx].status);
  const shownCells = cells.map((d, i) => (
    i === todayIdx && todayLit && !ignited ? { ...d, status: 'today_empty' } : d
  ));

  const build = () => ({
    readyAt: 2250,
    steps: [
      { at: 0, cue: 'select' },
      {
        at: 120,
        run: (instant) => {
          setRisen(true);
          if (!instant) anim(riseRef.current, [
            { transform: 'translateY(170px) scale(.3)', offset: 0 },
            { transform: 'translateY(-30px) scale(1.08)', offset: 0.72 },
            { transform: 'translateY(0) scale(1)', offset: 1 },
          ], { duration: LAND - 120, easing: 'cubic-bezier(.3,.7,.5,1)' });
        },
      },
      { at: LAND - 240, cue: 'bonus' },
      {
        at: LAND,
        run: (instant) => {
          setLanded(true);
          if (instant) return;
          flameRef.current?.play();
          burst(heroRef.current, C, FLOOR - 30, { n: 14, dist: 110, size: 8, up: 30, dur: 820, colors: FLAME_SPARKS });
          ring(heroRef.current, C, FLOOR - 20, { size: 240, color: 'var(--secondary-yellow-400)', dur: 650 });
        },
      },
      { at: LAND + 140, run: () => setNumShown(true) },
      {
        at: ROLL_AT,
        cue: 'tap',
        run: (instant) => {
          setRolled(true);
          if (!instant) pulse(numRef.current, 1.14, 300);
        },
      },
      { at: 1150, run: () => setTexted(true) },
      { at: STRIP_AT, run: () => setStripShown(true) },
      {
        at: IGNITE_AT,
        cue: 'correct',
        run: (instant) => {
          setIgnited(true);
          if (instant) return;
          const node = todayRef.current;
          const stage = stageRef.current;
          if (!node || !stage) return;
          // 오늘 칸 표식이 위에서 떨어져 통 튀며 자리 잡는다 — 칸 안 절대좌표가 아니라 칸 자체를 움직인다
          anim(node, [
            { transform: 'translateY(-34px) scale(.3)', opacity: 0 },
            { transform: 'translateY(0) scale(1.28)', opacity: 1, offset: 0.6 },
            { transform: 'translateY(0) scale(.94)', offset: 0.8 },
            { transform: 'translateY(0) scale(1)', opacity: 1 },
          ], { duration: 520, easing: BACK_OUT });
          // 불티·고리는 무대(stage) 좌표로 — 칸은 overflow 가 좁아 거기선 잘린다
          const s = stage.getBoundingClientRect();
          const r = node.getBoundingClientRect();
          const x = r.left - s.left + r.width / 2;
          const y = r.top - s.top + r.height / 2;
          burst(stage, x, y, { n: 10, dist: 48, size: 6, up: 8, dur: 650, colors: FLAME_SPARKS });
          ring(stage, x, y, { size: 84, color: 'var(--secondary-yellow-500)', dur: 560 });
        },
      },
      { at: 2050, run: () => setTail(true) },
    ],
  });

  useRewardTimeline(build, {
    reducedMotion,
    reducedCue: 'bonus',
    onReady,
    skipRef,
    onSkip: () => { clearFx(heroRef.current); clearFx(stageRef.current); },
  });

  const onTapFlame = (e) => {
    e.stopPropagation();
    if (!landed) return;
    flameRef.current?.play();
  };

  const number = rolled ? days : prevDays;

  return (
    <div ref={stageRef} className='relative flex flex-1 flex-col items-center justify-center gap-[10px] overflow-hidden px-[20px] pb-[10px]'>
      {/* 큰 불꽃 — 은은한 금빛 글로우 위에서 일렁인다(StreakFlame 의 일렁임 · 불티) */}
      <div ref={heroRef} className='relative shrink-0' style={{ width: HERO, height: HERO }}>
        <RewardGlow on={landed} gold />
        <div
          aria-hidden
          className={`pointer-events-none absolute left-1/2 -ml-[85px] h-[30px] w-[170px] rounded-[50%] transition-[transform,opacity] duration-300 motion-reduce:transition-none ${landed ? 'scale-100 opacity-100' : 'scale-[.4] opacity-0'}`}
          style={{ top: FLOOR - 15, background: 'radial-gradient(ellipse, rgba(245,138,34,.38) 0%, rgba(245,138,34,0) 70%)' }}
        />
        <div
          ref={riseRef}
          onClick={onTapFlame}
          className={`absolute cursor-pointer ${risen ? 'opacity-100' : 'opacity-0'}`}
          style={{ left: (HERO - FLAME) / 2, top: FLOOR - FLAME + 8 }}
        >
          <StreakFlame ref={flameRef} days={days} size={FLAME} lit alive={landed} />
        </div>
      </div>

      {/* 연속 일수 — 어제 값에서 오늘 값으로 위로 굴러 넘어간다 */}
      <div
        ref={numRef}
        className={`flex items-baseline gap-[4px] text-secondary-yellow-600 transition-opacity duration-200 motion-reduce:transition-none ${numShown ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className='relative inline-flex h-[56px] min-w-[1ch] items-center justify-center overflow-hidden text-[56px] font-[900] leading-[1] tracking-[-0.03em] tabular-nums'>
          <AnimatePresence initial={false} mode='popLayout'>
            <motion.span
              key={number}
              className='block'
              initial={reducedMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { y: '-100%', opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.32, ease: [0.3, 0.7, 0.4, 1] }}
            >
              {number}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className='text-[22px] font-[800] leading-[1]'>일</span>
      </div>

      <p className={`text-center text-[17px] font-[700] leading-[1.45] tracking-[-0.02em] ${FADE_UP} ${texted ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'}`}>
        <strong className='text-primary-main-600'>{days}일</strong> 연속으로 농장을 돌봤어요!
      </p>

      {/* 1주 띠 — 홈과 같은 칸 그림(WeekStreakCell). 오늘 칸만 불이 붙는 연출을 얹는다 */}
      <div className={`mt-[10px] w-full max-w-[400px] ${FADE_UP} ${stripShown ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'}`}>
        {hasWeek ? (
          <div className='grid grid-cols-7 gap-[6px]'>
            {shownCells.map((d, i) => (
              <div key={d.date} className='flex flex-col gap-[6px]'>
                <span className={`text-center text-[11px] ${d.isToday ? 'font-[800] text-layout-black dark:text-layout-white' : 'font-[600] text-layout-gray-300'}`}>
                  {d.label}
                </span>
                <div className='relative'>
                  <div ref={i === todayIdx ? todayRef : undefined}>
                    <WeekStreakCell
                      status={d.status}
                      isToday={d.isToday}
                      linkPrev={STREAK_LIT.has(d.status) && STREAK_LIT.has(shownCells[i - 1]?.status)}
                      linkNext={STREAK_LIT.has(d.status) && STREAK_LIT.has(shownCells[i + 1]?.status)}
                    />
                  </div>
                  {/* 불이 붙은 뒤 오늘 칸 둘레로 퍼지는 링 펄스 — 동작 줄이기면 끈다 */}
                  {i === todayIdx && ignited && !reducedMotion && (
                    <motion.span
                      aria-hidden
                      className='pointer-events-none absolute -inset-x-[3px] bottom-[2px] top-[2px] rounded-full border-[2px] border-secondary-yellow-500'
                      initial={{ scale: 1, opacity: 0.8 }}
                      animate={{ scale: 1.45, opacity: 0 }}
                      transition={{ duration: 1.3, delay: 0.35, repeat: Infinity, repeatDelay: 0.5, ease: 'easeOut' }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // week 조회 실패 시(드묾) — 띠 자리 스켈레톤만 남긴다(레이아웃 튐 방지)
          <div className='grid grid-cols-7 gap-[6px]'>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className='h-[46px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark animate-pulse motion-reduce:animate-none' />
            ))}
          </div>
        )}
      </div>

      {/* 다음 목표 한 줄 */}
      <p className={`mt-[6px] text-center text-[13.5px] font-[700] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300 ${FADE_UP} ${tail ? 'translate-y-0 opacity-100' : 'translate-y-[12px] opacity-0'}`}>
        내일도 이어가면 <strong className='font-[800] text-secondary-yellow-600'>{days + 1}일</strong>
      </p>
    </div>
  );
};

export default StreakRewardSlide;
