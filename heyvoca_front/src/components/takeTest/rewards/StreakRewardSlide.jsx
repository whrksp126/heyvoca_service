// src/components/takeTest/rewards/StreakRewardSlide.jsx
//
// 연속 학습 달성 — 바닥 불씨가 반짝이다 불꽃이 아래에서 확 치솟아 타오르고(점화), 연속 일수가 어제 값에서 오늘 값으로 굴러 넘어간 뒤,
// 1주 띠의 오늘 칸에 불이 '붙는다'(2026-10-28 QA #19 — 예전엔 문구 + 띠만 있어 화면 대부분이 비었다).
// 이 슬라이드는 오늘 문턱을 이 세션에서 처음 넘겼을 때만 만들어진다(StudyResult 의 push 조건).
//
//   0ms     select
//   80ms    바닥 불씨가 두어 번 반짝인다(작은 불티 한 줌)
//   280ms                                    bonus — 점화 순간에 맞춰 먼저 발사
//   360ms   점화 — 불꽃이 밑동 기준으로 확 치솟는다(scaleY 0→1.2→1) · 따뜻한 화면 플래시 ·
//           빛 번짐 · 열기 아지랑이 · 불티가 위로 튄다
//   520ms   타오름 — 일렁임 시작 · 고리 · 뒤 빛
// (2026-11 이슈 #25 15차 — 예전엔 불꽃이 아래에서 날아올라 '착지'했다. 불과 안 어울려 콤보 번개처럼
//  소재에 맞는 임팩트로 바꿨다. 불꽃 그림은 기존 StreakFlame 그대로.)
//   660ms   숫자 등장(어제 값)
//   900ms   숫자가 오늘 값으로 굴러 넘어간다    tap
//   1150ms  1주 띠(오늘 칸은 아직 빈칸)
//   1550ms  오늘 칸에 불꽃이 튀어 들어온다      correct — 링 펄스 시작
//   1900ms  「확인」 켜짐                      select
//
// 2026-11 QA #24 — 'N일 연속으로 농장을 돌봤어요!' · '내일도 이어가면 N+1일' 두 문구를 뺐다.
// 숫자(N일) + 1주 띠만 남기고, 빈 시간은 당겨 띠·점화가 숫자 직후에 이어지게 했다.
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

const IGNITE = 360;        // 불꽃이 치솟는 순간
const LAND = 520;
const ROLL_AT = 900;
const STRIP_AT = 1150;
const IGNITE_AT = 1550;
const READY_AT = 1900;
const HERO = 190;          // 주인공 상자 한 변
const FLAME = 140;         // 불꽃 크기
const C = HERO / 2;
const FLOOR = 160;         // 불꽃 밑동(상자 안 y)
// 열기 아지랑이·빛 번짐·화면 플래시 색 — 불꽃 그림(StreakFlame)의 주황·노랑 계열
const HEAT_GLOW = 'radial-gradient(ellipse at 50% 100%, rgba(255,186,73,.55) 0%, rgba(245,138,34,.28) 40%, rgba(245,138,34,0) 72%)';
const EMBER_GLOW = 'radial-gradient(circle, #FFF3C4 0%, #FFB520 45%, rgba(245,138,34,0) 72%)';

const FADE_UP = 'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none';

const StreakRewardSlide = ({ current = 0, cells = [], reducedMotion, onReady, skipRef }) => {
  const days = Math.max(1, Number(current) || 0);
  const prevDays = days - 1;

  const [risen, setRisen] = useState(false);
  const [landed, setLanded] = useState(false);
  const [numShown, setNumShown] = useState(false);
  const [rolled, setRolled] = useState(false);
  const [stripShown, setStripShown] = useState(false);
  const [ignited, setIgnited] = useState(false);

  const stageRef = useRef(null);
  const heroRef = useRef(null);
  const riseRef = useRef(null);
  const flameRef = useRef(null);
  const emberRef = useRef(null);
  const hazeRef = useRef(null);
  const bloomRef = useRef(null);
  const flashRef = useRef(null);
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
    readyAt: READY_AT,
    steps: [
      { at: 0, cue: 'select' },
      {
        // 바닥 불씨 — 꺼질 듯 두어 번 반짝인다
        at: 80,
        run: (instant) => {
          if (instant) return;
          anim(emberRef.current, [
            { transform: 'scale(.2)', opacity: 0 },
            { transform: 'scale(1)', opacity: 1, offset: 0.25 },
            { transform: 'scale(.7)', opacity: 0.55, offset: 0.5 },
            { transform: 'scale(1.25)', opacity: 1, offset: 0.8 },
            { transform: 'scale(1.6)', opacity: 0 },
          ], { duration: IGNITE, easing: 'ease-in-out' });
          burst(heroRef.current, C, FLOOR - 4, { n: 4, dist: 14, size: 4, up: 18, dur: 420, colors: FLAME_SPARKS });
        },
      },
      { at: IGNITE - 80, cue: 'bonus' },
      {
        // 점화 — 밑동을 축으로 아래에서 확 치솟았다가(1.2) 자리 잡는다
        at: IGNITE,
        run: (instant) => {
          setRisen(true);
          if (instant) return;
          anim(riseRef.current, [
            { transform: 'scale(.5,0)', opacity: 0.4 },
            { transform: 'scale(.9,1.2)', opacity: 1, offset: 0.55 },
            { transform: 'scale(1.06,.94)', offset: 0.8 },
            { transform: 'scale(1,1)', opacity: 1 },
          ], { duration: LAND - IGNITE + 60, easing: 'cubic-bezier(.2,.9,.3,1)' });
          // 열기 아지랑이 — 불꽃 위로 일렁이며 올라가 흩어진다
          anim(hazeRef.current, [
            { transform: 'translateY(20px) scale(.6,.4)', opacity: 0 },
            { transform: 'translateY(-10px) scale(1,1.1)', opacity: 0.9, offset: 0.3 },
            { transform: 'translateY(-40px) scale(1.15,1.3) skewX(4deg)', opacity: 0.5, offset: 0.65 },
            { transform: 'translateY(-70px) scale(1.25,1.5) skewX(-4deg)', opacity: 0 },
          ], { duration: 900, easing: 'ease-out' });
          // 빛 번짐 — 불이 붙는 순간 확 퍼졌다가 잦아든다
          anim(bloomRef.current, [
            { transform: 'scale(.3)', opacity: 0 },
            { transform: 'scale(1.25)', opacity: 1, offset: 0.3 },
            { transform: 'scale(1)', opacity: 0 },
          ], { duration: 700, easing: 'ease-out' });
          // 짧은 따뜻한 화면 플래시
          anim(flashRef.current, [{ opacity: 0.55 }, { opacity: 0.15, offset: 0.4 }, { opacity: 0 }], { duration: 300, easing: 'ease-out' });
          // 불티 — 밑동에서 위로 튀어 오른다
          burst(heroRef.current, C, FLOOR - 20, { n: 12, dist: 40, size: 6, up: 90, dur: 900, colors: FLAME_SPARKS });
          burst(heroRef.current, C, FLOOR - 50, { n: 8, dist: 60, size: 5, up: 120, dur: 1100, colors: FLAME_SPARKS });
        },
      },
      {
        at: LAND,
        run: (instant) => {
          setLanded(true);
          if (instant) return;
          flameRef.current?.play();
          ring(heroRef.current, C, FLOOR - 40, { size: 220, color: 'var(--secondary-yellow-400)', dur: 650 });
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
      {/* 점화 순간의 따뜻한 화면 플래시 — 평소엔 투명, 눌림을 막지 않는다 */}
      <div ref={flashRef} aria-hidden className='pointer-events-none absolute inset-0 z-20 bg-[#FFE3B3] opacity-0' />
      {/* 큰 불꽃 — 은은한 금빛 글로우 위에서 일렁인다(StreakFlame 의 일렁임 · 불티) */}
      <div ref={heroRef} className='relative shrink-0' style={{ width: HERO, height: HERO }}>
        <RewardGlow on={landed} gold />
        <div
          aria-hidden
          className={`pointer-events-none absolute left-1/2 -ml-[85px] h-[30px] w-[170px] rounded-[50%] transition-[transform,opacity] duration-300 motion-reduce:transition-none ${landed ? 'scale-100 opacity-100' : 'scale-[.4] opacity-0'}`}
          style={{ top: FLOOR - 15, background: 'radial-gradient(ellipse, rgba(245,138,34,.38) 0%, rgba(245,138,34,0) 70%)' }}
        />
        {/* 빛 번짐 · 열기 아지랑이 — 점화 순간에만 보인다(평소 투명) */}
        <div
          ref={bloomRef}
          aria-hidden
          className='pointer-events-none absolute left-1/2 -ml-[90px] h-[180px] w-[180px] rounded-full opacity-0'
          style={{ top: FLOOR - 130, background: HEAT_GLOW }}
        />
        <div
          ref={hazeRef}
          aria-hidden
          className='pointer-events-none absolute left-1/2 -ml-[60px] h-[150px] w-[120px] origin-bottom rounded-[50%] opacity-0 blur-[10px]'
          style={{ top: FLOOR - 170, background: HEAT_GLOW }}
        />
        {/* 바닥 불씨 */}
        <div
          ref={emberRef}
          aria-hidden
          className='pointer-events-none absolute left-1/2 -ml-[14px] h-[28px] w-[28px] rounded-full opacity-0'
          style={{ top: FLOOR - 16, background: EMBER_GLOW }}
        />
        <div
          ref={riseRef}
          onClick={onTapFlame}
          className={`absolute cursor-pointer origin-bottom ${risen ? 'opacity-100' : 'opacity-0'}`}
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

      {/* 1주 띠 — 홈과 같은 칸 그림(WeekStreakCell). 오늘 칸만 불이 붙는 연출을 얹는다 */}
      <div className={`mt-[14px] w-full max-w-[400px] ${FADE_UP} ${stripShown ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'}`}>
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

    </div>
  );
};

export default StreakRewardSlide;
