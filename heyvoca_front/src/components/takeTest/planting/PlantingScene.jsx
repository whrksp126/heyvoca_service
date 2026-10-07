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
//   끝       심은 자리가 차례로 통 튄다                        xpUp
//            안내가 뜨고 「학습 종료」가 켜진다
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
import RewardHint from '../rewards/RewardHint';
import FarmGrowRow from '../rewards/FarmGrowRow';
import SoilMound from './SoilMound';

const SEED_SRC = cropAssetByVariant('seed', 'healthy', { solo: true });   // 낱알
const SOIL_COLORS = ['#6B4526', '#8B5E3C', '#A9774A', '#C9A27A'];
const TICK = { cue: 'tap', cueOpts: { sound: false } };   // 소리 없이 진동만 한 번

// 자리 한 칸 — 심는 지점(밭 좌표 x, y)이 칸 안의 (GROUND_X, GROUND_Y)에 온다
const SLOT = 60;
const GROUND_X = 30;
const GROUND_Y = 44;
const SEED_BOX = 112;   // 낱알 그림은 512 캔버스의 1/5 크기라, 이 칸에서 약 22px 로 보인다
const SEED_SINK = 7;    // 흙에 묻힌 만큼 내려앉는다
const DROP_MS = 340;
const PHASE = { NONE: 0, DUG: 1, SEEDED: 2, COVERED: 3 };

const WORD_LABEL_FRAMES = [
  { opacity: 0, transform: 'translate(-50%,8px) scale(.7)' },
  { opacity: 1, transform: 'translate(-50%,-6px) scale(1)', offset: 0.18 },
  { opacity: 1, transform: 'translate(-50%,-10px) scale(1)', offset: 0.8 },
  { opacity: 0, transform: 'translate(-50%,-20px) scale(.9)' },
];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const PlantingScene = ({ rows, metaOfRow, reducedMotion, onDone, skipRef }) => {
  // 밭 자리 계산은 밭 성장 슬라이드의 것을 그대로 쓴다(한 종류로만 넘기면 순서대로 9칸을 채운다)
  const plan = useMemo(() => planField((rows ?? []).map((row) => ({ kind: 'sprout', row }))), [rows]);
  const { crops } = plan;
  const total = rows.length;

  const [fieldIn, setFieldIn] = useState(false);
  const [phases, setPhases] = useState([]);
  const [tail, setTail] = useState(false);

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
            { transform: 'translate(0,3px) scale(1.2,.74)', opacity: 1, offset: 0.86 },
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
          track(anim(moundRefs.current[i], [
            { transform: 'scale(.3,0)', opacity: 0 },
            { transform: 'scale(1.12,1.2)', opacity: 1, offset: 0.6 },
            { transform: 'scale(1,1)', opacity: 1 },
          ], { duration: 300, easing: 'ease-out' }));
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
    steps.push({ at: t, run: () => setTail(true) });
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
                {/* 구멍 — 씨앗 뒤에 남아 흙무덤의 뒤쪽 테두리가 된다 */}
                <span
                  ref={(el) => { holeRefs.current[i] = el; }}
                  aria-hidden
                  className={`pointer-events-none absolute h-[14px] w-[36px] rounded-[50%] ${phase >= PHASE.DUG ? 'opacity-100' : 'opacity-0'}`}
                  style={{ left: GROUND_X - 18, top: GROUND_Y - 8, background: 'radial-gradient(ellipse at 50% 60%, rgba(52,30,12,.78) 0%, rgba(74,45,20,.55) 55%, rgba(74,45,20,0) 100%)' }}
                />
                <img
                  ref={(el) => { seedRefs.current[i] = el; }}
                  src={SEED_SRC}
                  alt={entry.row.word}
                  draggable={false}
                  className={`pointer-events-none absolute max-w-none select-none ${phase >= PHASE.SEEDED ? 'opacity-100' : 'opacity-0'}`}
                  style={{
                    width: SEED_BOX,
                    height: SEED_BOX,
                    left: GROUND_X - SEED_BOX / 2,
                    top: GROUND_Y - SEED_BOX * CROP_BASELINE,
                    transform: `translateY(${SEED_SINK}px)`,
                    transformOrigin: `50% ${CROP_BASELINE * 100}%`,
                  }}
                />
                {/* 흙무덤 — 씨앗 앞에서 아래쪽을 덮는다. 씨앗 머리만 흙 위로 보인다 */}
                <span
                  ref={(el) => { moundRefs.current[i] = el; }}
                  aria-hidden
                  className={`pointer-events-none absolute origin-bottom ${phase >= PHASE.COVERED ? 'opacity-100' : 'opacity-0'}`}
                  style={{ left: GROUND_X - 22, top: GROUND_Y - 7 }}
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

      {total > 0 ? <RewardHint show={tail}>심은 자리를 눌러 보세요</RewardHint> : null}

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
                right='새로 심었어요'
              />
            </motion.div>
          ) : null
        ))}
      </div>
    </div>
  );
};

export default PlantingScene;
