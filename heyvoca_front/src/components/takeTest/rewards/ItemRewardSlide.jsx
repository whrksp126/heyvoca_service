// src/components/takeTest/rewards/ItemRewardSlide.jsx
//
// 농장 아이템(새심기 삽 · 영양 회복제 · 연속 학습 보호권) — 빛기둥에서 떨어져 쿵 착지한다.
// 세 아이템이 같은 틀을 쓴다.
//
//   0ms     빛기둥이 켜진다            select
//   140ms   위에서 돌며 떨어진다
//   380ms                              bonus — 네 번째 강한 음(240ms)과 click 이 착지에 맞게 먼저 발사
//   620ms   착지 — 찌그러짐 · 파편 · 고리 · 바닥 빛
//   840ms   수량 도장                  tap
//   1000ms  한 줄 문구
//   1300ms  「확인」 켜짐              select
//   보유 수량(before/after)을 알면 보석 슬라이드처럼 헤더에 잔액 칩을 띄우고, 1300ms~ 작은 아이템이
//   하나씩 칩으로 날아가 +1 씩 오른다. 끝나면 칩이 빛나고 「확인」이 켜진다.
//   모르면(게스트 · 조회 실패) 칩 없이 착지까지만 보여 준다.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { feel } from '../../../lib/feel';
import { FARM_ITEM_ASSETS } from '../../farm/CropImage';
import { FARM_ITEM_LABEL } from '../../../utils/crop';
import { useRewardTimeline } from './useRewardTimeline';
import { useRewardShell } from './RewardShell';
import { anim, burst, ring, jelly, pulse, clearFx } from './fx';
import RewardGlow from './RewardGlow';

const LAND = 620;
const HERO = 200;          // 주인공 상자 한 변
const C = HERO / 2;        // 상자 중심
const FLOOR = 170;         // 착지 지점(상자 안 y)

// 받침 유무에 따른 조사 — "삽을" / "회복제를"
const eulReul = (noun) => {
  const code = String(noun ?? '').slice(-1).charCodeAt(0);
  const hasJong = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return hasJong ? '을' : '를';
};

const FADE_UP = 'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none';
// 잔액 칩으로 날아가는 작은 아이템 — 보석 슬라이드(GemRewardSlide)와 같은 크기·궤적
const MINI = 34;
const MAX_MINIS = 6;
const FLY0 = LAND + 700;
const FLY_MS = 380;
const HOT_SHADOW = '0 0 0 2px #FF70D4, 0 0 18px rgba(255,112,212,.5)';
const COLD_SHADOW = '0 0 0 0 rgba(255,112,212,0)';

const ItemRewardSlide = ({ itemKey, qty = 1, why, before = null, after = null, reducedMotion, onReady, skipRef }) => {
  const label = FARM_ITEM_LABEL[itemKey] ?? '아이템';
  const src = FARM_ITEM_ASSETS[itemKey];
  const hasBalance = Number.isFinite(before) && Number.isFinite(after);
  const shown = hasBalance ? Math.min(Math.max(1, qty), MAX_MINIS) : 0;
  const per = shown > 0 ? (after - before) / shown : 0;
  const gap = shown > 0 ? Math.max(80, Math.min(140, 700 / shown)) : 0;

  const { headerSlot } = useRewardShell();
  const [bal, setBal] = useState(hasBalance ? before : 0);
  const pillRef = useRef(null);
  const pillIconRef = useRef(null);

  const [dropped, setDropped] = useState(false);
  const [landed, setLanded] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [texted, setTexted] = useState(false);
  const [tail, setTail] = useState(false);

  const heroRef = useRef(null);
  const itemRef = useRef(null);
  const beamRef = useRef(null);

  // 작은 아이템 하나가 주인공 자리에서 잔액 칩 그림으로 날아간다. 슬라이드 본문은 빛기둥 때문에
  // overflow-hidden 이라, 화면(body) 위 고정 좌표로 띄워 헤더까지 잘리지 않게 한다.
  const minisRef = useRef([]);
  const flyMini = (i) => {
    const hero = heroRef.current;
    const icon = pillIconRef.current;
    if (!hero || !icon) return;
    const a = icon.getBoundingClientRect();
    const b = hero.getBoundingClientRect();
    const sx = b.left + C + (i % 2 ? 1 : -1) * (10 + i * 6);
    const sy = b.top + C - 10;
    const dx = a.left + a.width / 2 - sx;
    const dy = a.top + a.height / 2 - sy;
    const m = document.createElement('span');
    m.setAttribute('aria-hidden', 'true');
    m.style.cssText = `position:fixed;left:${sx - MINI / 2}px;top:${sy - MINI / 2}px;width:${MINI}px;height:${MINI}px;pointer-events:none;z-index:2147483000`;
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:contain';
    m.appendChild(img);
    document.body.appendChild(m);
    minisRef.current.push(m);
    const fly = anim(m, [
      { transform: 'translate(0,0) scale(.4)', opacity: 0 },
      { transform: `translate(${dx / 2 - 40}px,${dy / 2 - 10}px) scale(1.15)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px,${dy}px) scale(.55)`, opacity: 1 },
    ], { duration: FLY_MS, easing: 'cubic-bezier(.5,0,.8,.5)', fill: 'forwards' });
    if (fly) fly.onfinish = () => m.remove();
    else m.remove();
  };
  const clearMinis = () => { minisRef.current.forEach((m) => m.remove()); minisRef.current = []; };
  useEffect(() => () => { minisRef.current.forEach((m) => m.remove()); }, []);   // 날던 중 다음 장으로 넘겨도 남지 않게

  const flySteps = [];
  for (let i = 0; i < shown; i += 1) {
    flySteps.push({ at: FLY0 + i * gap, run: (instant) => { if (!instant) flyMini(i); } });
    flySteps.push({
      at: FLY0 + i * gap + FLY_MS,
      cue: 'select',
      run: (instant) => {
        setBal((prev) => Math.max(prev, Math.round(before + per * (i + 1))));
        if (!instant) pulse(pillRef.current, 1.2, 220);
      },
    });
  }
  const flyEnd = FLY0 + shown * gap + 420;
  if (shown > 0) {
    flySteps.push({
      at: flyEnd,
      run: (instant) => {
        setBal(after);
        if (instant) return;
        anim(pillRef.current, [
          { boxShadow: COLD_SHADOW }, { boxShadow: HOT_SHADOW, offset: 0.12 }, { boxShadow: HOT_SHADOW, offset: 0.8 }, { boxShadow: COLD_SHADOW },
        ], { duration: 1500 });
      },
    });
  }

  const build = () => ({
    readyAt: shown > 0 ? flyEnd + 100 : LAND + 680,
    steps: [
      {
        at: 0,
        cue: 'select',
        run: (instant) => {
          if (!instant) anim(beamRef.current, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: 1500 });
        },
      },
      {
        at: 140,
        run: (instant) => {
          setDropped(true);
          if (!instant) anim(itemRef.current, [
            { transform: 'translateY(-330px) rotate(-220deg) scale(.6)' },
            { transform: 'translateY(0) rotate(0deg) scale(1)' },
          ], { duration: LAND - 140, easing: 'cubic-bezier(.5,0,.9,.4)' });
        },
      },
      { at: LAND - 240, cue: 'bonus' },
      {
        at: LAND,
        run: (instant) => {
          setLanded(true);
          if (instant) return;
          const hero = heroRef.current;
          jelly(itemRef.current, 1.6);
          burst(hero, C, FLOOR, { n: 14, dist: 110, size: 8, up: 26, dur: 800 });
          ring(hero, C, FLOOR, { size: 260, dur: 650 });
          ring(hero, C, FLOOR, { size: 180, color: '#FFFFFF', dur: 560 });
          anim(hero, [{ transform: 'translateY(0)' }, { transform: 'translateY(6px)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], { duration: 260 });
        },
      },
      { at: LAND + 220, cue: 'tap', run: () => setStamped(true) },
      { at: LAND + 380, run: () => setTexted(true) },
      { at: LAND + 560, run: () => setTail(true) },
      ...flySteps,
    ],
  });

  useRewardTimeline(build, { reducedMotion, reducedCue: 'bonus', onReady, skipRef, onSkip: () => { clearFx(heroRef.current); clearMinis(); } });

  const onTapItem = (e) => {
    e.stopPropagation();
    if (!dropped) return;
    feel('tap');
    jelly(itemRef.current, 1.1);
    burst(heroRef.current, C, C, { n: 10, dist: 90, size: 8 });
  };

  const pill = hasBalance && headerSlot ? createPortal(
    <div
      ref={pillRef}
      aria-label={`${label} ${bal}개`}
      className='flex h-[30px] items-center gap-[5px] rounded-full bg-layout-gray-50 pl-[6px] pr-[11px] text-[14px] font-[800] tabular-nums dark:bg-layout-gray-dark'
    >
      <img ref={pillIconRef} src={src} alt='' className='h-[22px] w-[22px] object-contain' />
      <span>{bal}</span>
    </div>,
    headerSlot,
  ) : null;

  return (
    <div className='relative flex flex-1 flex-col items-center justify-center gap-[14px] overflow-hidden px-[20px] pb-[10px]'>
      {pill}
      <div ref={heroRef} className='relative shrink-0' style={{ width: HERO, height: HERO }}>
        <RewardGlow on={landed} />
        {/* 빛기둥 */}
        <div
          ref={beamRef}
          aria-hidden
          className='pointer-events-none absolute left-1/2 -ml-[75px] h-[330px] w-[150px] opacity-0 blur-[6px]'
          style={{
            top: FLOOR - 330,
            background: 'linear-gradient(180deg, rgba(255,112,212,0) 0%, rgba(255,112,212,.22) 60%, rgba(255,255,255,.34) 100%)',
            clipPath: 'polygon(34% 0, 66% 0, 100% 100%, 0 100%)',
          }}
        />
        {/* 바닥 빛 */}
        <div
          aria-hidden
          className={`pointer-events-none absolute left-1/2 -ml-[95px] h-[34px] w-[190px] rounded-[50%] transition-[transform,opacity] duration-300 motion-reduce:transition-none ${landed ? 'scale-100 opacity-100' : 'scale-[.4] opacity-0'}`}
          style={{ top: FLOOR - 17, background: 'radial-gradient(ellipse, rgba(255,112,212,.42) 0%, rgba(255,112,212,0) 70%)' }}
        />
        <div
          ref={itemRef}
          onClick={onTapItem}
          className={`absolute left-[25px] top-[25px] h-[150px] w-[150px] cursor-pointer origin-[50%_92%] ${dropped ? 'opacity-100' : 'opacity-0'}`}
        >
          <motion.div
            className='h-full w-full'
            animate={tail && !reducedMotion ? { y: [0, -9, 0], rotate: [-2, 2, -2] } : { y: 0, rotate: 0 }}
            transition={tail && !reducedMotion ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          >
            <img src={src} alt={label} draggable={false} className='pointer-events-none h-full w-full select-none object-contain' />
          </motion.div>
        </div>
        {/* 수량 도장 */}
        <div
          className={`absolute left-[138px] top-[14px] z-[35] flex h-[40px] min-w-[54px] items-center justify-center rounded-full bg-primary-main-600 px-[13px] text-[22px] font-[800] text-layout-white shadow-[0_6px_16px_rgba(255,112,212,.4)] transition-[transform,opacity] duration-[260ms] ease-[cubic-bezier(.2,1.4,.4,1)] motion-reduce:transition-none ${stamped ? 'rotate-[8deg] scale-100 opacity-100' : '-rotate-[20deg] scale-[2.6] opacity-0'}`}
        >
          +{qty}
        </div>
      </div>

      <div className={`text-center ${FADE_UP} ${texted ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'}`}>
        <p className='text-[17px] font-[700] leading-[1.45] tracking-[-0.02em]'>
          <strong className='text-primary-main-600'>{label}</strong>{eulReul(label)} 받았어요
        </p>
        {why ? <p className='mt-[6px] text-[12px] font-[500] text-layout-gray-300'>{why}</p> : null}
      </div>
    </div>
  );
};

export default ItemRewardSlide;
