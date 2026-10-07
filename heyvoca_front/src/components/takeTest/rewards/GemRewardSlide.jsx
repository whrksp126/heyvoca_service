// src/components/takeTest/rewards/GemRewardSlide.jsx
//
// 보석 — 받은 개수만큼 작은 보석이 쏟아져 나왔다가 헤더 잔액으로 하나씩 날아가 쌓인다.
//
//   0ms      보석 등장                         bonus — 강한 음(240ms)에 최대 크기
//   240ms    빛 · 고리 · 파편
//   520ms    +N 카운트업, 한 줄 문구
//   760ms    작은 보석이 터져 나온다            xpUp
//   1500ms~  하나씩 잔액으로 날아간다           도착할 때마다 select, 잔액 +1
//   끝       잔액이 빛난다                      perfect → 「확인」 켜짐
//
// 작은 보석은 12개까지만 그린다(그 이상은 한 개가 여러 개를 대표한다).
// 게스트(가입 전)는 잔액이 없으므로 작은 보석이 큰 보석으로 되돌아 모인다.
// 보석 그림은 농장 보석(farm/icon-gem.png, 289px 원본)을 쓴다.
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import gemImg from '../../../assets/images/farm/icon-gem.png';
import { feel, useCountUp } from '../../../lib/feel';
import { useRewardTimeline } from './useRewardTimeline';
import { useRewardShell } from './RewardShell';
import { anim, burst, ring, jelly, pulse, clearFx, BACK_OUT } from './fx';
import RewardGlow from './RewardGlow';

const HERO = 200;
const C = HERO / 2;
const MINI = 30;
const MAX_MINIS = 12;
const FLY0 = 1500;
const FLY_MS = 380;
const FADE_UP = 'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none';
const HOT_SHADOW = '0 0 0 2px #FF70D4, 0 0 18px rgba(255,112,212,.5)';
const COLD_SHADOW = '0 0 0 0 rgba(255,112,212,0)';

const GemRewardSlide = ({ gemCount, before = null, after = null, isGuest = false, reducedMotion, onReady, skipRef }) => {
  const N = Math.max(0, Number(gemCount) || 0);
  // 잔액 칩은 실제 잔액을 알 때만 그린다(게스트는 계정이 없다)
  const hasBalance = !isGuest && Number.isFinite(before) && Number.isFinite(after);
  const shown = Math.min(N, MAX_MINIS);
  const per = shown > 0 ? N / shown : 0;
  const gap = shown > 0 ? Math.max(70, Math.min(110, 900 / shown)) : 0;

  const { headerSlot } = useRewardShell();
  const [gemIn, setGemIn] = useState(false);
  const [glow, setGlow] = useState(false);
  const [counted, setCounted] = useState(false);
  const [bal, setBal] = useState(hasBalance ? before : 0);
  const plusN = useCountUp(counted ? N : 0, { duration: 0.6 });

  const heroRef = useRef(null);
  const gemRef = useRef(null);
  const pillRef = useRef(null);
  const pillIconRef = useRef(null);
  const minisRef = useRef([]);

  // 잔액 칩 그림의 중심 — 주인공 상자 기준 좌표
  const balanceTarget = () => {
    const icon = pillIconRef.current;
    const hero = heroRef.current;
    if (!icon || !hero) return { x: 0, y: -C };
    const a = icon.getBoundingClientRect();
    const b = hero.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2 - C, y: a.top - b.top + a.height / 2 - C };
  };

  const spawnMinis = () => {
    const hero = heroRef.current;
    if (!hero) return;
    minisRef.current = [];
    for (let i = 0; i < shown; i += 1) {
      const ang = -Math.PI / 2 + ((i + 0.5) / shown - 0.5) * Math.PI * 1.5;
      const d = 104 + (i % 2) * 22;
      const tx = Math.cos(ang) * d;
      const ty = Math.sin(ang) * d * 0.8;
      const m = document.createElement('span');
      m.setAttribute('aria-hidden', 'true');
      m.style.cssText = `position:absolute;left:${C - MINI / 2}px;top:${C - MINI / 2}px;width:${MINI}px;height:${MINI}px;pointer-events:none;z-index:20;opacity:0`;
      const img = document.createElement('img');
      img.src = gemImg;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain';
      m.appendChild(img);
      hero.appendChild(m);
      anim(m, [
        { transform: 'translate(0,0) scale(.2)', opacity: 0 },
        { transform: `translate(${tx * 0.8}px,${ty - 34}px) scale(1.1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${tx}px,${ty}px) scale(1)`, opacity: 1 },
      ], { duration: 460, delay: i * 40, easing: 'ease-out', fill: 'both' });
      minisRef.current.push({ m, tx, ty });
    }
  };

  const flyMini = (i) => {
    const item = minisRef.current[i];
    if (!item?.m?.isConnected) return;
    const { m, tx, ty } = item;
    const to = hasBalance ? balanceTarget() : { x: 0, y: 0 };
    m.getAnimations?.().forEach((a) => a.cancel());
    const a = anim(m, [
      { transform: `translate(${tx}px,${ty}px) scale(1)`, opacity: 1 },
      { transform: `translate(${(tx + to.x) / 2 - 40}px,${(ty + to.y) / 2 - 10}px) scale(1.15)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${to.x}px,${to.y}px) scale(.55)`, opacity: hasBalance ? 1 : 0 },
    ], { duration: FLY_MS, easing: 'cubic-bezier(.5,0,.8,.5)', fill: 'forwards' });
    if (a) a.onfinish = () => m.remove();
    else m.remove();
  };

  const build = () => {
    const steps = [
      {
        at: 0,
        cue: 'bonus',
        run: (instant) => {
          setGemIn(true);
          if (!instant) anim(gemRef.current, [
            { transform: 'scale(0) rotate(-40deg)', opacity: 0 },
            { transform: 'scale(1.3) rotate(8deg)', opacity: 1, offset: 0.5 },
            { transform: 'scale(.94) rotate(-4deg)', offset: 0.75 },
            { transform: 'scale(1) rotate(0deg)' },
          ], { duration: 520, easing: 'ease-out' });
        },
      },
      {
        at: 240,
        run: (instant) => {
          setGlow(true);
          if (instant) return;
          ring(heroRef.current, C, C, { size: 280 });
          burst(heroRef.current, C, C, { n: 14, dist: 120, size: 8, dur: 800 });
        },
      },
      { at: 520, run: () => setCounted(true) },
      {
        at: 760,
        cue: 'xpUp',
        run: (instant) => {
          if (instant) return;
          spawnMinis();
          pulse(gemRef.current, 1.16, 300);
        },
      },
    ];
    for (let i = 0; i < shown; i += 1) {
      steps.push({ at: FLY0 + i * gap, run: (instant) => { if (!instant) flyMini(i); } });
      steps.push({
        at: FLY0 + i * gap + FLY_MS,
        ...(hasBalance ? { cue: 'select' } : {}),
        run: (instant) => {
          if (hasBalance) setBal((prev) => Math.max(prev, Math.round(before + per * (i + 1))));
          if (instant) return;
          if (hasBalance) pulse(pillRef.current, 1.2, 220);
          else pulse(gemRef.current, 1.08, 180);
        },
      });
    }
    const end = FLY0 + shown * gap + 420;
    steps.push({
      at: end,
      cue: 'perfect',
      run: (instant) => {
        if (hasBalance) setBal(after);
        if (instant || !hasBalance) return;
        anim(pillRef.current, [
          { boxShadow: COLD_SHADOW }, { boxShadow: HOT_SHADOW, offset: 0.12 }, { boxShadow: HOT_SHADOW, offset: 0.8 }, { boxShadow: COLD_SHADOW },
        ], { duration: 1500 });
      },
    });
    return { steps, readyAt: end + 100 };
  };

  useRewardTimeline(build, {
    reducedMotion,
    reducedCue: 'bonus',
    readyCue: null,   // 마지막 perfect 가 켜짐 신호를 겸한다
    onReady,
    skipRef,
    onSkip: () => clearFx(heroRef.current),
  });

  const onTapGem = (e) => {
    e.stopPropagation();
    if (!gemIn) return;
    feel('tap');
    jelly(gemRef.current, 0.9);
    burst(heroRef.current, C, C, { n: 12, dist: 100, size: 8 });
  };

  const pill = hasBalance && headerSlot ? createPortal(
    <div
      ref={pillRef}
      aria-label={`보석 ${bal}개`}
      className='flex h-[30px] items-center gap-[5px] rounded-full bg-layout-gray-50 pl-[8px] pr-[11px] text-[14px] font-[800] tabular-nums dark:bg-layout-gray-dark'
    >
      <img ref={pillIconRef} src={gemImg} alt='' className='h-[18px] w-[18px] object-contain' />
      <span>{bal}</span>
    </div>,
    headerSlot,
  ) : null;

  return (
    <div className='relative flex flex-1 flex-col items-center justify-center gap-[6px] px-[20px] pb-[10px]'>
      {pill}
      <div ref={heroRef} className='relative shrink-0' style={{ width: HERO, height: HERO }}>
        <RewardGlow on={glow} />
        <div
          ref={gemRef}
          onClick={onTapGem}
          className={`absolute left-[25px] top-[25px] z-[21] h-[150px] w-[150px] cursor-pointer ${gemIn ? 'opacity-100' : 'opacity-0'}`}
        >
          <img src={gemImg} alt='보석' draggable={false} className='pointer-events-none h-full w-full select-none object-contain' />
          {/* 보석 모양으로 잘라 낸 빛줄기 */}
          {!reducedMotion ? (
            <div
              aria-hidden
              className='pointer-events-none absolute inset-0 overflow-hidden'
              style={{ WebkitMask: `url(${gemImg}) center / contain no-repeat`, mask: `url(${gemImg}) center / contain no-repeat` }}
            >
              <motion.span
                className='absolute -top-[20%] left-0 h-[140%] w-[45%] -skew-x-[20deg] bg-gradient-to-r from-transparent via-layout-white to-transparent opacity-75'
                initial={{ x: '-160%' }}
                animate={{ x: '300%' }}
                transition={{ duration: 1.2, delay: 1, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' }}
              />
            </div>
          ) : null}
        </div>
      </div>

      <p
        className={`text-[46px] font-[800] leading-[1.1] tracking-[-0.03em] text-primary-main-600 tabular-nums transition-[transform,opacity] duration-300 motion-reduce:transition-none ${counted ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
        style={{ transitionTimingFunction: BACK_OUT }}
      >
        +{plusN}
      </p>
      <div className={`mt-[8px] text-center ${FADE_UP} delay-200 ${counted ? 'translate-y-0 opacity-100' : 'translate-y-[18px] opacity-0'}`}>
        <p className='text-[17px] font-[700] leading-[1.45] tracking-[-0.02em]'>
          <strong className='text-primary-main-600'>보석 {N}개</strong>를 획득했어요
        </p>
        {/* 게스트는 아직 계정이 없어 보석이 들어갈 곳이 없다 — 어디로 들어오는지 한 줄 덧붙인다.
            이 줄이 없으면 가입 화면에서 보석이 사라진 것처럼 보인다. */}
        {isGuest ? <p className='mt-[6px] text-[12px] font-[500] text-layout-gray-300'>가입하면 계정으로 바로 들어와요</p> : null}
      </div>
    </div>
  );
};

export default GemRewardSlide;
