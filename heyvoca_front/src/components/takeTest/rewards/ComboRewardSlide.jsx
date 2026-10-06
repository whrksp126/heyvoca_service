// src/components/takeTest/rewards/ComboRewardSlide.jsx
//
// 콤보 신기록 — 번개가 아래에서 솟아올라 쿵 자리 잡고, 콤보 수가 굴러 올라간다.
// 이 슬라이드는 최고 기록을 갱신했을 때만 만들어진다(StudyResult 의 push 조건).
//
//   0ms     바닥 빛이 켜진다            select
//   120ms   아래에서 돌며 솟아오른다
//   320ms                               bonus — 네 번째 강한 음(240ms)과 click 이 착지에 맞게 먼저 발사
//   560ms   착지 — 찌그러짐 · 파편 · 고리 · 뒤 빛
//   700ms   콤보 수 카운트업(650ms)
//   1350ms  「최고 기록 갱신」 띠           tap
//   1500ms  한 줄 문구
//   1750ms  「확인」 켜짐               select
import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { feel, useCountUp } from '../../../lib/feel';
import ComboIcon from '../ComboIcon';
import { useRewardTimeline } from './useRewardTimeline';
import { anim, burst, ring, jelly, pulse, clearFx } from './fx';
import RewardGlow from './RewardGlow';
import RewardHint from './RewardHint';

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
  const [ribbon, setRibbon] = useState(false);
  const [texted, setTexted] = useState(false);
  const [tail, setTail] = useState(false);

  const heroRef = useRef(null);
  const iconRef = useRef(null);
  const numRef = useRef(null);

  const shown = useCountUp(counting ? maxCombo : 0, { duration: reducedMotion ? 0.01 : COUNT_MS / 1000 });

  const build = () => ({
    readyAt: LAND + 1190,
    steps: [
      { at: 0, cue: 'select' },
      {
        at: 120,
        run: (instant) => {
          setRisen(true);
          if (!instant) anim(iconRef.current, [
            { transform: 'translateY(210px) rotate(-160deg) scale(.3)', offset: 0 },
            { transform: 'translateY(-46px) rotate(8deg) scale(1.08)', offset: 0.7 },
            { transform: 'translateY(0) rotate(0deg) scale(1)', offset: 1 },
          ], { duration: LAND - 120, easing: 'cubic-bezier(.3,.7,.5,1)' });
        },
      },
      { at: LAND - 240, cue: 'bonus' },
      {
        at: LAND,
        run: (instant) => {
          setLanded(true);
          if (instant) return;
          const hero = heroRef.current;
          jelly(iconRef.current, 1.5);
          burst(hero, C, FLOOR, { n: 16, dist: 120, size: 8, up: 30, dur: 820, colors: FX_COMBO });
          ring(hero, C, FLOOR, { size: 260, color: '#FFB520', dur: 650 });
          ring(hero, C, FLOOR, { size: 180, color: '#FFFFFF', dur: 560 });
          anim(hero, [{ transform: 'translateY(0)' }, { transform: 'translateY(6px)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], { duration: 260 });
        },
      },
      { at: LAND + 140, run: () => setCounting(true) },
      {
        at: LAND + 140 + COUNT_MS,
        cue: 'tap',
        run: (instant) => {
          setRibbon(true);
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
    <div className='relative flex flex-1 flex-col items-center justify-center gap-[10px] overflow-hidden px-[20px] pb-[10px]'>
      <div ref={heroRef} className='relative shrink-0' style={{ width: HERO, height: HERO }}>
        <RewardGlow on={landed} gold />
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

      {/* 최고 기록 띠 */}
      <div
        className={`h-[32px] whitespace-nowrap rounded-full px-[18px] text-[14px] font-[800] leading-[32px] text-layout-white bg-[linear-gradient(180deg,#FF88DC,#FF70D4)] transition-[transform,opacity] duration-[380ms] ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none ${ribbon ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
      >
        최고 기록 갱신
      </div>

      <p className={`text-center text-[17px] font-[700] leading-[1.45] tracking-[-0.02em] ${FADE_UP} ${texted ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'}`}>
        <strong className='text-primary-main-600'>{maxCombo}번</strong> 연속으로 맞혔어요
      </p>
      <RewardHint show={tail}>아이콘을 눌러 보세요</RewardHint>
    </div>
  );
};

export default ComboRewardSlide;
