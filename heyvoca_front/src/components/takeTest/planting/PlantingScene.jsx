// src/components/takeTest/planting/PlantingScene.jsx
//
// 「새 씨앗 심기」 결과 — 이번 세션에 심은 씨앗을 밭 한 판 위에 하나씩 심어 보여 준다.
// 밭 성장 슬라이드(rewards/FarmGrowthSlide)와 같은 밭·같은 자리 규칙·같은 시간표 훅을 쓴다.
//
//   0ms      밭 등장                                         select
//   520ms~   씨앗마다(간격 220~520ms)
//              +0     구멍이 파인다
//              +90    씨앗이 위에서 떨어진다
//              +350   흙에 닿는다 — 흙이 튀고 밭이 살짝 눌린다    tap
//              +440   흙이 덮인다 — 숫자가 오르고 단어 줄이 뜬다  select(간격이 좁으면 진동만)
//                       구멍이 오므라들며 둘레 흙이 안쪽으로 모이고, 씨앗이 묻히고,
//                       넓고 낮게 깔린 흙이 봉긋하게 솟았다가 살짝 가라앉는다(COVER_MS)
//   끝       심은 자리가 차례로 통 튄다                        xpUp
//            「학습 종료」가 켜진다
//
// 밭에는 9칸까지만 올리고 나머지는 마지막 자리가 숫자로 대신한다(planField 의 weight).
// 화면을 탭하면(skipRef) 남은 연출을 건너뛰고 최종 상태만 남긴다.
import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cropAssetByVariant, CROP_BASELINE } from '../../farm/CropImage';
import fieldBase from '../../../assets/images/farm/field-base.png';
import { feel, SPRING } from '../../../lib/feel';
import { useRewardTimeline } from '../rewards/useRewardTimeline';
import { anim, burst, ring, jelly, pulse, clearFx, BACK_OUT } from '../rewards/fx';
import { planField, FIELD_W, FIELD_H } from '../rewards/growth';
import FarmGrowRow from '../rewards/FarmGrowRow';
import SoilMound, { MOUND_GROUND_X, MOUND_GROUND_Y, MOUND_H } from './SoilMound';
import SoilHole, { HOLE_W, HOLE_H } from './SoilHole';

const SEED_SRC = cropAssetByVariant('seed', 'healthy', { solo: true });   // 낱알
// 튀는 흙 알갱이 — 밭 그림·구멍·흙무덤과 같은 흙 색 계열(SoilMound 주석)
const SOIL_COLORS = ['#7A5230', '#9A7046', '#A47548', '#B98C5E'];
const TICK = { cue: 'tap', cueOpts: { sound: false } };   // 소리 없이 진동만 한 번

// 자리 한 칸 — 심는 지점(밭 좌표 x, y)이 칸 안의 (GROUND_X, GROUND_Y)에 온다
const SLOT = 60;
const GROUND_X = 30;
const GROUND_Y = 44;
const SEED_BOX = 112;   // 낱알 그림은 512 캔버스의 1/5 크기라, 이 칸에서 약 22px 로 보인다
const SEED_SINK = 10;   // 구멍 안으로 내려앉는다 — 앞쪽 턱 아래는 SEED_CLIP 이 가린다
const DROP_MS = 340;
// 씨앗이 구멍 **안에** 들어가 보이도록 구멍 앞쪽 턱 아래를 잘라낸다. 아주 길쭉한 타원의 밑동이
// 구멍 앞 가장자리(반지름 15.5×6.5 타원)의 굽이와 같다(15.5² / 6.5 ≈ 86² / 200). 위는 낙하 구간까지 열려 있다.
const SEED_CLIP = `ellipse(86px 200px at ${GROUND_X}px ${GROUND_Y + 6.5 - 200}px)`;
const COVER_MS = 380;
const PHASE = { NONE: 0, DUG: 1, SEEDED: 2, COVERED: 3 };

const WORD_LABEL_FRAMES = [
  { opacity: 0, transform: 'translate(-50%,8px) scale(.7)' },
  { opacity: 1, transform: 'translate(-50%,-6px) scale(1)', offset: 0.18 },
  { opacity: 1, transform: 'translate(-50%,-10px) scale(1)', offset: 0.8 },
  { opacity: 0, transform: 'translate(-50%,-20px) scale(.9)' },
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 구멍 둘레의 흙 알갱이가 안쪽으로 모여든다 — fx.burst 의 반대 방향. 끝나면 스스로 빠지고,
// 건너뛸 때는 clearFx 가 치운다(부모 직속 span[aria-hidden]).
const gatherSoil = (parent, x, y) => {
  if (!parent) return;
  const n = 6;
  for (let k = 0; k < n; k += 1) {
    const ang = (k / n) * Math.PI * 2 + 0.5;
    const size = k % 2 ? 4 : 5.5;
    const node = document.createElement('span');
    node.setAttribute('aria-hidden', 'true');
    node.style.cssText = `position:absolute;pointer-events:none;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size * 0.8}px;border-radius:50%;z-index:30;opacity:0;background:${SOIL_COLORS[k % SOIL_COLORS.length]}`;
    parent.appendChild(node);
    const a = anim(node, [
      { transform: `translate(${Math.cos(ang) * 23}px,${Math.sin(ang) * 10}px) scale(1)`, opacity: 0 },
      { transform: `translate(${Math.cos(ang) * 17}px,${Math.sin(ang) * 7 - 3}px) scale(1)`, opacity: 1, offset: 0.3 },
      { transform: 'translate(0,-2px) scale(.5)', opacity: 0 },
    ], { duration: 240, easing: 'ease-in' });
    if (!a) { node.remove(); continue; }
    a.onfinish = () => node.remove();
    a.oncancel = () => node.remove();
  }
};

const PlantingScene = ({ rows, metaOfRow, reducedMotion, onDone, skipRef }) => {
  // 밭 자리 계산은 밭 성장 슬라이드의 것을 그대로 쓴다(한 종류로만 넘기면 순서대로 9칸을 채운다)
  const plan = useMemo(() => planField((rows ?? []).map((row) => ({ kind: 'sprout', row }))), [rows]);
  const { crops } = plan;
  const total = rows.length;

  const [fieldIn, setFieldIn] = useState(false);
  const [phases, setPhases] = useState([]);

  const fieldRef = useRef(null);
  const numRef = useRef(null);
  const slotRefs = useRef([]);
  const holeRefs = useRef([]);
  const seedRefs = useRef([]);
  const moundRefs = useRef([]);
  const labelRefs = useRef([]);
  const running = useRef([]);   // 건너뛸 때 끊어야 하는 진행 중 애니메이션

  const phaseOf = (i) => phases[i] ?? PHASE.NONE;
  const setPhase = (i, p) => setPhases((prev) => {
    if ((prev[i] ?? 0) >= p) return prev;
    const next = prev.slice();
    next[i] = p;
    return next;
  });
  const track = (a) => { if (a) running.current.push(a); return a; };
  const planted = crops.reduce((s, c, i) => s + (phaseOf(i) >= PHASE.COVERED ? c.weight : 0), 0);

  const showWord = (i, hold = 900) => anim(labelRefs.current[i], WORD_LABEL_FRAMES, { duration: hold, easing: 'ease-out' });

  const build = () => {
    const steps = [];
    const n = crops.length;
    const gap = n > 1 ? clamp(Math.round(2200 / n), 220, 520) : 520;

    steps.push({
      at: 0,
      cue: 'select',
      run: (instant) => {
        setFieldIn(true);
        if (!instant) track(anim(fieldRef.current, [{ transform: 'translateY(46px) scale(.82)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: BACK_OUT }));
      },
    });

    crops.forEach(({ x, y }, i) => {
      const at = 520 + i * gap;
      // 구멍
      steps.push({
        at,
        run: (instant) => {
          setPhase(i, PHASE.DUG);
          if (!instant) track(anim(holeRefs.current[i], [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: BACK_OUT }));
        },
      });
      // 씨앗 낙하 → 착지 → 내려앉음. 좌우로 조금씩 다른 데서 떨어진다
      steps.push({
        at: at + 90,
        run: (instant) => {
          setPhase(i, PHASE.SEEDED);
          if (instant) return;
          const dx = (i % 2 ? 1 : -1) * (10 + (i % 3) * 5);
          track(anim(seedRefs.current[i], [
            { transform: `translate(${dx}px,-150px) rotate(${dx * 4}deg) scale(1.15)`, opacity: 0, easing: 'cubic-bezier(.5,0,.9,.6)' },
            { transform: `translate(${dx * 0.8}px,-120px) rotate(${dx * 3}deg) scale(1.15)`, opacity: 1, offset: 0.14, easing: 'cubic-bezier(.5,0,.9,.6)' },
            { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0.76 },
            { transform: 'translate(0,5px) scale(1.2,.74)', opacity: 1, offset: 0.86 },
            { transform: `translate(0,${SEED_SINK}px) scale(1)`, opacity: 1 },
          ], { duration: DROP_MS }));
        },
      });
      // 착지 — 흙이 튄다
      steps.push({
        at: at + 90 + Math.round(DROP_MS * 0.76),
        cue: 'tap',
        run: (instant) => {
          if (instant) return;
          burst(fieldRef.current, x, y - 4, { n: 7, dist: 28, size: 6, colors: SOIL_COLORS, dur: 520, up: 16 });
          track(anim(fieldRef.current, [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' }));
        },
      });
      // 흙 덮기
      steps.push({
        at: at + 440,
        ...(gap >= 300 ? { cue: 'select' } : TICK),
        run: (instant) => {
          setPhase(i, PHASE.COVERED);
          if (instant) return;
          // 구멍이 오므라들고 둘레 흙이 안쪽으로 모인다
          track(anim(holeRefs.current[i], [
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(.72,.6)', opacity: 1, offset: 0.55 },
            { transform: 'scale(.45,.3)', opacity: 0 },
          ], { duration: 220, easing: 'ease-in' }));
          gatherSoil(fieldRef.current, x, y - 1);
          // 씨앗이 흙에 묻힌다
          track(anim(seedRefs.current[i], [
            { transform: `translateY(${SEED_SINK}px) scale(1)`, opacity: 1 },
            { transform: `translateY(${SEED_SINK + 2}px) scale(.94)`, opacity: 1, offset: 0.5 },
            { transform: `translateY(${SEED_SINK + 4}px) scale(.86)`, opacity: 0 },
          ], { duration: 130, easing: 'ease-in' }));
          // 넓고 낮게 깔린 흙이 가운데로 모이며 솟고, 봉긋하게 가라앉는다
          track(anim(moundRefs.current[i], [
            { transform: 'scale(1.3,.3)', opacity: 0 },
            { transform: 'scale(1.16,.74)', opacity: 1, offset: 0.24 },
            { transform: 'scale(.95,1.16)', opacity: 1, offset: 0.58 },
            { transform: 'scale(1.04,.92)', opacity: 1, offset: 0.82 },
            { transform: 'scale(1,1)', opacity: 1 },
          ], { duration: COVER_MS, easing: 'ease-out' }));
          showWord(i);
          pulse(numRef.current, 1.35, 260);
        },
      });
    });

    // 마무리 — 심은 자리가 차례로 통 튄다
    let t = 520 + n * gap + (n ? 300 : 0);
    if (n) {
      steps.push({ at: t, cue: 'xpUp' });
      crops.forEach(({ x, y }, i) => steps.push({
        at: t + i * 55,
        run: (instant) => {
          if (instant) return;
          jelly(slotRefs.current[i], 1.1);
          ring(fieldRef.current, x, y - 6, { size: 64, color: '#6CE9A6', dur: 520 });
        },
      }));
      t += n * 55 + 260;
    }
    return { steps, readyAt: t };
  };

  useRewardTimeline(build, {
    reducedMotion,
    reducedCue: total ? 'xpUp' : null,
    onReady: onDone,
    skipRef,
    onSkip: () => {
      running.current.forEach((a) => { try { a.cancel(); } catch (e) { /* 이미 끝난 애니메이션 */ } });
      running.current = [];
      clearFx(fieldRef.current);
    },
  });

  const onTapSlot = (i) => () => {
    if (phaseOf(i) < PHASE.COVERED) return;
    const { x, y } = crops[i];
    feel('tap');
    jelly(slotRefs.current[i], 1);
    showWord(i, 1300);
    burst(fieldRef.current, x, y - 4, { n: 6, dist: 22, size: 5, colors: SOIL_COLORS, dur: 480, up: 12 });
  };

  return (
    <div className='flex flex-col items-center gap-[12px] px-[20px] pt-[22px] pb-[30px]'>
      <div className='text-center'>
        <p className='mb-[6px] text-[12.5px] font-[700] text-layout-gray-300'>오늘 밭에</p>
        {total > 0 ? (
          <p className='text-[26px] font-[800] leading-[1.25] tracking-[-0.03em]'>
            씨앗{' '}
            <span className='text-primary-main-600'>
              <span ref={numRef} className='inline-block tabular-nums'>{planted}</span>개
            </span>
            를 심었어요
          </p>
        ) : (
          <p className='text-[20px] font-[800] leading-[1.3] tracking-[-0.02em]'>이번에는 심은 씨앗이 없어요</p>
        )}
      </div>

      <div className='relative -mt-[40px] shrink-0 max-[350px]:-mb-[12px] max-[350px]:-mt-[52px] max-[350px]:scale-90' style={{ width: FIELD_W, height: FIELD_H }}>
        <div ref={fieldRef} className={`absolute inset-0 ${fieldIn ? 'opacity-100' : 'opacity-0'}`}>
          <img src={fieldBase} alt='' draggable={false} className='absolute inset-0 h-full w-full select-none' />
          {crops.map(({ entry, x, y }, i) => {
            const phase = phaseOf(i);
            return (
              <div
                key={entry.row.user_voca_id}
                ref={(el) => { slotRefs.current[i] = el; }}
                onClick={onTapSlot(i)}
                className='absolute cursor-pointer origin-[50%_73%]'
                style={{ width: SLOT, height: SLOT, left: x - GROUND_X, top: y - GROUND_Y, zIndex: 10 + Math.round(y / 19) }}
              >
                {/* 구멍 — 흙이 덮이면 사라진다 */}
                <span
                  ref={(el) => { holeRefs.current[i] = el; }}
                  aria-hidden
                  className={`pointer-events-none absolute ${phase >= PHASE.DUG && phase < PHASE.COVERED ? 'opacity-100' : 'opacity-0'}`}
                  style={{ left: GROUND_X - HOLE_W / 2, top: GROUND_Y - HOLE_H / 2 }}
                >
                  <SoilHole />
                </span>
                <span aria-hidden className='pointer-events-none absolute inset-0' style={{ clipPath: SEED_CLIP }}>
                <img
                  ref={(el) => { seedRefs.current[i] = el; }}
                  src={SEED_SRC}
                  alt={entry.row.word}
                  draggable={false}
                  className={`pointer-events-none absolute max-w-none select-none ${phase === PHASE.SEEDED ? 'opacity-100' : 'opacity-0'}`}
                  style={{
                    width: SEED_BOX,
                    height: SEED_BOX,
                    left: GROUND_X - SEED_BOX / 2,
                    top: GROUND_Y - SEED_BOX * CROP_BASELINE,
                    transform: `translateY(${SEED_SINK}px)`,
                    transformOrigin: `50% ${CROP_BASELINE * 100}%`,
                  }}
                />
                </span>
                {/* 흙무덤 — 씨앗을 완전히 덮는다. 땅에 닿는 줄을 축으로 솟는다 */}
                <span
                  ref={(el) => { moundRefs.current[i] = el; }}
                  aria-hidden
                  className={`pointer-events-none absolute ${phase >= PHASE.COVERED ? 'opacity-100' : 'opacity-0'}`}
                  style={{ left: GROUND_X - MOUND_GROUND_X, top: GROUND_Y - MOUND_GROUND_Y, transformOrigin: `50% ${((MOUND_GROUND_Y + 2) / MOUND_H) * 100}%` }}
                >
                  <SoilMound />
                </span>
                <span
                  ref={(el) => { labelRefs.current[i] = el; }}
                  className='pointer-events-none absolute bottom-[74%] left-1/2 z-40 whitespace-nowrap rounded-full bg-layout-black px-[8px] py-[3px] text-[11px] font-[700] text-layout-white opacity-0 dark:bg-layout-white dark:text-layout-black'
                >
                  {entry.row.word}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 심기는 순서대로 한 줄씩 — 밭에 못 올린 단어는 마지막 자리와 함께 뜬다 */}
      <div className='flex w-full flex-col gap-[8px]'>
        {rows.map((row, i) => (
          i < planted ? (
            <motion.div
              key={row.user_voca_id}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, transition: SPRING.soft }}
            >
              <FarmGrowRow
                crop='PLANTED_SEED'
                word={row.word}
                meaning={row.meaning}
                meta={metaOfRow(row)}
              />
            </motion.div>
          ) : null
        ))}
      </div>
    </div>
  );
};

export default PlantingScene;
