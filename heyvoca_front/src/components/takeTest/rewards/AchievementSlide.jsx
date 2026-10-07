// src/components/takeTest/rewards/AchievementSlide.jsx
//
// 업적 레벨 — 메달 승급. 이전 레벨 메달이 먼저 나오고, 테두리 게이지가 가득 찬 뒤
// 메달이 한 바퀴 뒤집히며 숫자(와 등급 색)가 바뀐다.
//
//   0ms     이전 레벨 메달 등장        select
//   420ms   테두리 게이지가 가득 찬다  xpUp
//   1060ms                             evolve — 뒷면이 보이는 순간(약 240ms 뒤)에 강한 음
//   1120ms  메달이 뒤집힌다
//   1420ms  레벨 · 등급 색 교체, 빛 · 고리 · 파편 · 색종이
//   1740ms  리본 → 1900ms 한 줄 문구
//   2170ms  「확인」 켜짐              select
//
// 목업의 「보상 보석 +N」 칩은 업적 응답(goals[])에 보상 개수가 없어 넣지 않았다.
import React, { useRef, useState } from 'react';
import { feel } from '../../../lib/feel';
import { useRewardTimeline } from './useRewardTimeline';
import { anim, burst, ring, confetti, clearFx, FX_COLORS, FX_GOLDS } from './fx';
import { ACHIEVEMENT_IMAGES, achievementTier } from './achievement';
import RewardGlow from './RewardGlow';

const FLIP = 1120;
const HERO = 190;
const C = HERO / 2;
const R = 86;
const LEN = 2 * Math.PI * R;
const FADE_UP = 'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none';
const RIBBON_CLIP = 'polygon(0 0, 100% 0, calc(100% - 12px) 50%, 100% 100%, 0 100%, 12px 50%)';

const AchievementSlide = ({ goal, reducedMotion, onReady, skipRef }) => {
  const goalType = goal?.type || '단어왕';
  const to = Number(goal?.level) || 0;
  const from = Math.max(0, to - 1);
  const tierFrom = achievementTier(from);
  const tierTo = achievementTier(to);
  const tierChanged = tierFrom.key !== tierTo.key;

  const [medalIn, setMedalIn] = useState(false);
  const [gaugeFull, setGaugeFull] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const [ribbon, setRibbon] = useState(false);
  const [texted, setTexted] = useState(false);

  const rootRef = useRef(null);
  const heroRef = useRef(null);
  const wrapRef = useRef(null);
  const medalRef = useRef(null);

  const tier = upgraded ? tierTo : tierFrom;
  const flip = () => anim(medalRef.current, [
    { transform: 'rotateY(0deg) scale(1)' },
    { transform: 'rotateY(180deg) scale(1.22)' },
    { transform: 'rotateY(360deg) scale(1)' },
  ], { duration: 640, easing: 'cubic-bezier(.4,0,.2,1)' });

  const build = () => ({
    readyAt: FLIP + 1050,
    steps: [
      {
        at: 0,
        cue: 'select',
        run: (instant) => {
          setMedalIn(true);
          if (!instant) anim(wrapRef.current, [{ transform: 'translateY(-60px) scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        },
      },
      { at: 420, cue: 'xpUp', run: () => setGaugeFull(true) },
      { at: FLIP - 60, cue: 'evolve' },
      { at: FLIP, run: (instant) => { if (!instant) flip(); } },
      {
        at: FLIP + 300,
        run: (instant) => {
          setUpgraded(true);
          if (instant) return;
          ring(heroRef.current, C, C, { size: 330, color: tierTo.color, dur: 800 });
          burst(heroRef.current, C, C, { n: 18, dist: 150, size: 9, dur: 900, colors: tierChanged ? FX_GOLDS : FX_COLORS });
          confetti(rootRef.current);
        },
      },
      { at: FLIP + 620, run: () => setRibbon(true) },
      { at: FLIP + 780, run: () => setTexted(true) },
    ],
  });

  useRewardTimeline(build, {
    reducedMotion,
    reducedCue: 'evolve',
    onReady,
    skipRef,
    onSkip: () => { clearFx(heroRef.current); clearFx(rootRef.current); },
  });

  const onTapMedal = (e) => {
    e.stopPropagation();
    if (!medalIn) return;
    feel('tap');
    if (!reducedMotion) flip();
    burst(heroRef.current, C, C, { n: 12, dist: 120, size: 8 });
  };

  return (
    <div ref={rootRef} className='relative flex flex-1 flex-col items-center justify-center gap-[16px] overflow-hidden px-[20px] pb-[10px]'>
      <div ref={heroRef} className='relative shrink-0' style={{ width: HERO, height: HERO }}>
        <RewardGlow on={upgraded} gold={tierChanged} />
        <div
          ref={wrapRef}
          onClick={onTapMedal}
          className={`absolute inset-0 cursor-pointer [perspective:700px] ${medalIn ? 'opacity-100' : 'opacity-0'}`}
        >
          <div ref={medalRef} className='absolute inset-0'>
            {/* 테두리 게이지 */}
            <svg viewBox={`0 0 ${HERO} ${HERO}`} aria-hidden className='absolute inset-0 h-full w-full -rotate-90'>
              <circle cx={C} cy={C} r={R} fill='none' strokeWidth='7' className='stroke-layout-gray-100 dark:stroke-layout-gray-500' />
              <circle
                cx={C}
                cy={C}
                r={R}
                fill='none'
                stroke={tier.color}
                strokeWidth='7'
                strokeLinecap='round'
                strokeDasharray={LEN}
                strokeDashoffset={gaugeFull ? 0 : LEN * 0.28}
                className='transition-[stroke-dashoffset] duration-[620ms] ease-[cubic-bezier(.3,.7,.3,1)] motion-reduce:transition-none'
              />
            </svg>
            {/* 메달 면 */}
            <div
              className='absolute left-[30px] top-[30px] h-[130px] w-[130px] rounded-full shadow-[inset_0_-8px_0_rgba(0,0,0,.14),inset_0_6px_0_rgba(255,255,255,.4)]'
              style={{ background: tier.bg }}
            />
            <img
              src={ACHIEVEMENT_IMAGES[goalType]}
              alt={goalType}
              draggable={false}
              className='pointer-events-none absolute left-1/2 top-[6px] -ml-[69px] h-[138px] w-[138px] select-none object-contain'
            />
            {/* 레벨 — 숫자가 아래에서 위로 굴러 바뀐다 */}
            <div
              className='absolute bottom-[8px] left-1/2 flex h-[34px] -translate-x-1/2 items-baseline gap-[2px] overflow-hidden rounded-full border-[2.5px] bg-layout-white px-[14px] text-[19px] font-[800] leading-[29px] dark:bg-layout-black'
              style={{ color: tier.color, borderColor: tier.color }}
            >
              <small className='text-[11px] font-[800]'>LV.</small>
              <span className='inline-block h-[29px] overflow-hidden tabular-nums'>
                <span className={`block transition-transform duration-[450ms] ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none ${upgraded ? '-translate-y-[29px]' : 'translate-y-0'}`}>
                  <span className='block h-[29px]'>{from}</span>
                  <span className='block h-[29px]'>{to}</span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 리본 */}
      <div
        className={`h-[36px] whitespace-nowrap px-[26px] text-[16px] font-[800] leading-[36px] text-layout-white bg-[linear-gradient(180deg,#FF88DC,#FF70D4)] transition-transform duration-[380ms] ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none ${ribbon ? 'scale-x-100' : 'scale-x-0'}`}
        style={{ clipPath: RIBBON_CLIP }}
      >
        {goalType}
      </div>
      <p className={`text-center text-[17px] font-[700] leading-[1.45] tracking-[-0.02em] ${FADE_UP} ${texted ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'}`}>
        <strong className='text-primary-main-600'>{goalType} {to}레벨</strong>을 달성했어요
      </p>
    </div>
  );
};

export default AchievementSlide;
