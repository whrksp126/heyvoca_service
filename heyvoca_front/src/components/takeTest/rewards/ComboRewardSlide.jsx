// src/components/takeTest/rewards/ComboRewardSlide.jsx
//
// 콤보 신기록 — 번개가 하늘에서 번쩍 내리꽂히고(지그재그 섬광 + 화면 플래시 + 흔들림), 콤보 수가 굴러 올라간다.
// 이 슬라이드는 최고 기록을 갱신했을 때만 만들어진다(StudyResult 의 push 조건).
//
//   0ms     select
//   320ms                               bonus — 강한 음이 내리꽂힘에 맞게 먼저 발사
//   380ms   지그재그 섬광이 위에서 번쩍
//   440ms   번개가 위에서 빠르게 떨어진다(120ms, 가속)
//   560ms   꽂힘 — 화면 플래시 · 흔들림 · 찌그러짐 · 불꽃 · 고리
//   700ms   콤보 수 카운트업(650ms)
//   1350ms  콤보 수 통 튐                 tap
//   1500ms  한 줄 문구
//   1750ms  「확인」 켜짐               select
import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { feel, useCountUp } from '../../../lib/feel';
import ComboIcon from '../ComboIcon';
import { useRewardTimeline } from './useRewardTimeline';
import { anim, burst, ring, jelly, pulse, clearFx } from './fx';
import RewardGlow from './RewardGlow';

const LAND = 560;
const COUNT_MS = 650;
const HERO = 200;          // 주인공 상자 한 변
const C = HERO / 2;        // 상자 중심
const FLOOR = 170;         // 착지 지점(상자 안 y)
const FX_COMBO = ['#FFDA3E', '#FFB520', '#F8800F', '#FFEFB0', '#FFFFFF'];

const FADE_UP = 'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none';

const ComboRewardSlide = ({ maxCombo = 0, reducedMotion, onReady, skipRef }) => {
  const [risen, setRisen] = useState(false);
  const [landed, setLanded] = useState(false);
  const [counting, setCounting] = useState(false);
  const [texted, setTexted] = useState(false);
  const [tail, setTail] = useState(false);

  const heroRef = useRef(null);
  const iconRef = useRef(null);
  const numRef = useRef(null);
  const boltRef = useRef(null);
  const flashRef = useRef(null);
  const rootRef = useRef(null);

  const shown = useCountUp(counting ? maxCombo : 0, { duration: reducedMotion ? 0.01 : COUNT_MS / 1000 });

  const build = () => ({
    readyAt: LAND + 1190,
    steps: [
      { at: 0, cue: 'select' },
      { at: LAND - 240, cue: 'bonus' },
      {
        // 지그재그 섬광 — 번개가 내려올 길을 먼저 번쩍 그어 둔다
        at: LAND - 180,
        run: (instant) => {
          if (instant) return;
          anim(boltRef.current, [
            { opacity: 0, transform: 'scaleY(.2)' },
            { opacity: 1, transform: 'scaleY(1)', offset: 0.2 },
            { opacity: 0.25, offset: 0.4 },
            { opacity: 1, offset: 0.55 },
            { opacity: 0, transform: 'scaleY(1)' },
          ], { duration: 360, easing: 'linear' });
        },
      },
      {
        at: LAND - 120,
        run: (instant) => {
          setRisen(true);
          if (!instant) anim(iconRef.current, [
            { transform: 'translateY(-320px) scale(.75,1.35)', opacity: 0.6 },
            { transform: 'translateY(0) scale(.85,1.2)', opacity: 1 },
          ], { duration: 120, easing: 'cubic-bezier(.55,0,1,.45)' });
        },
      },
      {
        at: LAND,
        run: (instant) => {
          setLanded(true);
          if (instant) return;
          const hero = heroRef.current;
          jelly(iconRef.current, 1.5);
          burst(hero, C, FLOOR, { n: 18, dist: 130, size: 8, up: 40, dur: 760, colors: FX_COMBO });
          ring(hero, C, FLOOR, { size: 260, color: '#FFB520', dur: 650 });
          ring(hero, C, FLOOR, { size: 180, color: '#FFFFFF', dur: 560 });
          anim(flashRef.current, [{ opacity: 0.85 }, { opacity: 0.2, offset: 0.35 }, { opacity: 0.5, offset: 0.5 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' });
          anim(rootRef.current, [
            { transform: 'translate(0,0)' },
            { transform: 'translate(-7px,5px)' },
            { transform: 'translate(6px,-3px)' },
            { transform: 'translate(-4px,2px)' },
            { transform: 'translate(2px,-1px)' },
            { transform: 'translate(0,0)' },
          ], { duration: 300, easing: 'ease-out' });
        },
      },
      { at: LAND + 140, run: () => setCounting(true) },
      {
        at: LAND + 140 + COUNT_MS,
        cue: 'tap',
        run: (instant) => {
          if (!instant) pulse(numRef.current, 1.18, 260);
        },
      },
      { at: LAND + 940, run: () => setTexted(true) },
      { at: LAND + 1100, run: () => setTail(true) },
    ],
  });

  useRewardTimeline(build, { reducedMotion, reducedCue: 'bonus', onReady, skipRef, onSkip: () => clearFx(heroRef.current) });

  const onTapIcon = (e) => {
    e.stopPropagation();
    if (!risen) return;
    feel('tap');
    jelly(iconRef.current, 1.1);
    burst(heroRef.current, C, C, { n: 10, dist: 90, size: 8, colors: FX_COMBO });
  };

  return (
    <div ref={rootRef} className='relative flex flex-1 flex-col items-center justify-center gap-[10px] overflow-hidden px-[20px] pb-[10px]'>
      {/* 꽂히는 순간의 화면 플래시 — 평소엔 투명, 눌림을 막지 않는다 */}
      <div ref={flashRef} aria-hidden className='pointer-events-none absolute inset-0 z-20 bg-[#FFF6D6] opacity-0' />
      <div ref={heroRef} className='relative shrink-0' style={{ width: HERO, height: HERO }}>
        <RewardGlow on={landed} gold />
        {/* 지그재그 섬광 — 하늘에서 번개 착지점까지 */}
        <svg
          ref={boltRef}
          aria-hidden
          className='pointer-events-none absolute left-1/2 -ml-[40px] origin-top opacity-0'
          style={{ top: -230, width: 80, height: FLOOR + 230 - 40, filter: 'drop-shadow(0 0 6px rgba(255,218,62,.9))' }}
          viewBox='0 0 80 360'
          preserveAspectRatio='none'
        >
          <polyline points='44,0 26,70 52,120 22,195 50,250 30,310 40,360' fill='none' stroke='#FFDA3E' strokeWidth='9' strokeLinejoin='miter' opacity='.55' />
          <polyline points='44,0 26,70 52,120 22,195 50,250 30,310 40,360' fill='none' stroke='#FFFFFF' strokeWidth='4' strokeLinejoin='miter' />
        </svg>
        {/* 바닥 빛 */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-1/2 -ml-[95px] h-[34px] w-[190px] rounded-[50%] transition-[transform,opacity] duration-300 motion-reduce:transition-none ${landed ? 'scale-100 opacity-100' : 'scale-[.4] opacity-0'}`}
          style={{ top: FLOOR - 17, background: 'radial-gradient(ellipse, rgba(245,138,34,.4) 0%, rgba(245,138,34,0) 70%)' }}
        />
        <div
          ref={iconRef}
          onClick={onTapIcon}
          className={`absolute left-[25px] top-[25px] h-[150px] w-[150px] cursor-pointer origin-[50%_92%] ${risen ? 'opacity-100' : 'opacity-0'}`}
        >
          <motion.div
            className='h-full w-full'
            animate={tail && !reducedMotion ? { y: [0, -9, 0], rotate: [-2, 2, -2] } : { y: 0, rotate: 0 }}
            transition={tail && !reducedMotion ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          >
            <ComboIcon className='pointer-events-none h-full w-full' />
          </motion.div>
        </div>
      </div>

      {/* 콤보 수 — 착지 뒤에 굴러 올라간다 */}
      <div
        ref={numRef}
        className={`flex items-baseline gap-[4px] text-primary-main-600 transition-opacity duration-200 motion-reduce:transition-none ${counting ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className='text-[52px] font-[900] leading-[1] tracking-[-0.03em] tabular-nums'>{shown}</span>
        <span className='text-[22px] font-[800] leading-[1]'>콤보</span>
      </div>

      <p className={`text-center text-[17px] font-[700] leading-[1.45] tracking-[-0.02em] ${FADE_UP} ${texted ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'}`}>
        연속 정답 최고 기록!
      </p>
    </div>
  );
};

export default ComboRewardSlide;
