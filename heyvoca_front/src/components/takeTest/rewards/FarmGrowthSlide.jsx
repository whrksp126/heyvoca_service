// src/components/takeTest/rewards/FarmGrowthSlide.jsx
//
// 「밭 성장」 — 이번 세션에 자란 작물을 밭 한 판 위에서 차례로 키워 보여 준다(승인 목업 A안).
// 예전의 네 장(작물이 자랐어요 · 새싹이 돋았어요 · 되살렸어요 · 황금 당근)이 이 한 장이 됐다.
//
//   0ms      밭 등장                                   select
//   260ms~   학습 전 모습의 작물이 45ms 간격으로 놓인다
//   1050ms~  새싹이 190ms 간격으로 돋는다                 xpUp 한 번 + 매번 tick 진동
//            이어서 자람(한 박자씩) → 되살림(물방울 뒤)   xpUp
//            마지막에 황금 당근                          evolve — 강한 음(240ms)이 바뀌는 순간에 오도록 먼저 발사
//   끝       「자란 단어 보기」 · 안내 · 「확인」 켜짐     select
//
// 밭에는 9칸까지만 올리고 나머지는 숫자로 센다(planField). 단어 목록은 필요할 때만 여는 시트다.
import React, { useMemo, useRef, useState } from 'react';
import { CaretUp, Drop } from '@phosphor-icons/react';
import CropImage, { CROP_ASSETS, CROP_BASELINE, cropAssetByVariant } from '../../farm/CropImage';
import fieldBase from '../../../assets/images/farm/field-base.png';
import { feel } from '../../../lib/feel';
import { useRewardTimeline } from './useRewardTimeline';
import { anim, burst, ring, jelly, pulse, clearFx, BACK_OUT, FX_GOLDS } from './fx';
import { planField, growthRightLabel, GROWTH_KINDS, GROWTH_KIND_META, FIELD_W, FIELD_H, CROP_BOX } from './growth';
import RewardGlow from './RewardGlow';
import RewardHint from './RewardHint';
import FarmGrowRow from './FarmGrowRow';

// 밭 위 그림 — 흙 없는 심긴 판. 씨앗만 낱알(심긴 판의 씨앗은 32px 점이라 밭에서 안 보인다)
const fieldSrc = (crop, variant = 'healthy') => (
  crop === 'golden' ? CROP_ASSETS.goldenCarrot : cropAssetByVariant(crop, variant, { solo: crop === 'seed' })
);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TICK = { cue: 'tap', cueOpts: { sound: false } };   // 소리 없이 진동만 한 번
const WORD_LABEL_FRAMES = [
  { opacity: 0, transform: 'translate(-50%,8px) scale(.7)' },
  { opacity: 1, transform: 'translate(-50%,-6px) scale(1)', offset: 0.18 },
  { opacity: 1, transform: 'translate(-50%,-10px) scale(1)', offset: 0.8 },
  { opacity: 0, transform: 'translate(-50%,-20px) scale(.9)' },
];
const IMG_BASE = 'pointer-events-none select-none transition-opacity duration-100';

const FarmGrowthSlide = ({ entries, reducedMotion, onReady, skipRef }) => {
  const plan = useMemo(() => planField(entries ?? []), [entries]);
  const { crops, total } = plan;
  const kinds = GROWTH_KINDS.filter((k) => entries.some((e) => e.kind === k));
  const onlyRescue = kinds.length === 1 && kinds[0] === 'rescue';

  const [fieldIn, setFieldIn] = useState(false);
  const [appeared, setAppeared] = useState(0);
  const [grown, setGrown] = useState([]);
  const [tail, setTail] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMounted, setSheetMounted] = useState(false);

  const fieldRef = useRef(null);
  const numRef = useRef(null);
  const cropRefs = useRef([]);
  const labelRefs = useRef([]);
  const dropRefs = useRef([]);
  const haloRefs = useRef([]);
  const chipRefs = useRef({});

  const shownTotal = grown.reduce((s, i) => s + crops[i].weight, 0);
  const countOf = (kind) => grown.reduce((s, i) => s + (crops[i].entry.kind === kind ? crops[i].weight : 0), 0);
  const finale = grown.some((i) => crops[i].entry.kind === 'gold');

  const showWord = (i, hold = 900) => anim(labelRefs.current[i], WORD_LABEL_FRAMES, { duration: hold, easing: 'ease-out' });
  const markGrown = (i) => setGrown((prev) => (prev.includes(i) ? prev : [...prev, i]));

  const growFx = (i) => {
    const { entry, x, y } = crops[i];
    const field = fieldRef.current;
    const gold = entry.kind === 'gold';
    burst(field, x, y - 30, gold ? { n: 16, dist: 74, size: 9, colors: FX_GOLDS, dur: 900 } : { n: 8, dist: 34, size: 6 });
    ring(field, x, y - 26, gold
      ? { size: 220, color: '#F2D252', dur: 800 }
      : { size: 84, color: entry.kind === 'rescue' ? '#74D5FF' : '#6CE9A6', dur: 520 });
    showWord(i);
    pulse(numRef.current, 1.35, 260);
    pulse(chipRefs.current[entry.kind], 1.12, 220);
    if (gold) {
      anim(field, [{ transform: 'translateY(0)' }, { transform: 'translateY(7px)' }, { transform: 'translateY(0)' }], { duration: 320, easing: 'ease-out' });
    }
  };

  const build = () => {
    const steps = [];
    const indexOf = (kind) => crops.map((c, i) => (c.entry.kind === kind ? i : -1)).filter((i) => i >= 0);
    // 통 튀고(130ms) 나서 그림이 바뀐다 — 눌렸다 펴지는 순간에 자란 모습이 나오게
    const growStep = (i, at, cue, k = 1.15) => {
      steps.push({ at, ...cue, run: (instant) => { if (!instant) jelly(cropRefs.current[i], k); } });
      steps.push({ at: at + 130, run: (instant) => { markGrown(i); if (!instant) growFx(i); } });
    };

    steps.push({
      at: 0,
      cue: 'select',
      run: (instant) => {
        setFieldIn(true);
        if (!instant) anim(fieldRef.current, [{ transform: 'translateY(46px) scale(.82)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: BACK_OUT });
      },
    });
    crops.forEach((_, i) => steps.push({
      at: 260 + i * 45,
      run: (instant) => {
        setAppeared((a) => Math.max(a, i + 1));
        if (!instant) anim(cropRefs.current[i], [{ transform: 'translateY(-16px) scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: BACK_OUT });
      },
    }));

    let t = 1050;
    const sprouts = indexOf('sprout');
    sprouts.forEach((ci, n) => growStep(ci, t + n * 190, n === 0 ? { cue: 'xpUp' } : TICK));
    if (sprouts.length) t += sprouts.length * 190 + 260;

    const grows = indexOf('grow');
    const growGap = grows.length > 1 ? clamp(Math.round(1560 / grows.length), 190, 520) : 520;
    grows.forEach((ci, n) => growStep(ci, t + n * growGap, n === 0 || growGap >= 400 ? { cue: 'xpUp' } : TICK));
    t += grows.length * growGap;

    const rescues = indexOf('rescue');
    const rescueGap = rescues.length > 1 ? clamp(Math.round(1600 / rescues.length), 260, 800) : 800;
    rescues.forEach((ci, n) => {
      const at = t + n * rescueGap;
      steps.push({
        at: Math.max(0, at - 60),
        run: (instant) => {
          if (!instant) anim(dropRefs.current[ci], [
            { opacity: 0, transform: 'translateY(-30px)' },
            { opacity: 1, transform: 'translateY(4px)', offset: 0.7 },
            { opacity: 0, transform: 'translateY(22px) scale(1.4,.5)' },
          ], { duration: 360, easing: 'ease-in' });
        },
      });
      growStep(ci, at + 240, n === 0 || rescueGap >= 400 ? { cue: 'xpUp' } : TICK);
    });
    t += rescues.length * rescueGap;

    const golds = indexOf('gold');
    golds.forEach((ci, n) => {
      const at = t + n * 600;
      // 바뀌기 직전 금빛이 차오른다(필터 대신 뒤에 깐 빛 한 장의 opacity·scale 만 움직인다)
      steps.push({
        at,
        run: (instant) => {
          if (!instant) anim(haloRefs.current[ci], [
            { opacity: 0, transform: 'scale(.4)' },
            { opacity: 1, transform: 'scale(1)', offset: 0.5 },
            { opacity: 0, transform: 'scale(1.3)' },
          ], { duration: 780, easing: 'ease-out' });
        },
      });
      steps.push({ at: at + 140, cue: n === 0 ? 'evolve' : 'xpUp' });
      growStep(ci, at + 250, {}, 1.5);
    });
    if (golds.length) t += (golds.length - 1) * 600 + 1000;

    steps.push({ at: t, run: () => setTail(true) });
    return { steps, readyAt: t };
  };

  useRewardTimeline(build, {
    reducedMotion,
    reducedCue: crops.some((c) => c.entry.kind === 'gold') ? 'evolve' : 'xpUp',
    onReady,
    skipRef,
    onSkip: () => clearFx(fieldRef.current),   // 건너뛸 때 날아다니던 파편도 같이 치운다
  });

  const onTapCrop = (i) => (e) => {
    e.stopPropagation();
    if (i >= appeared) return;
    const { x, y } = crops[i];
    feel('tap');
    jelly(cropRefs.current[i], 1);
    showWord(i, 1300);
    burst(fieldRef.current, x, y - 34, { n: 6, dist: 26, size: 5 });
  };

  const openSheet = (e) => {
    e.stopPropagation();
    feel('tap');
    setSheetMounted(true);
    setSheetOpen(true);
  };
  const closeSheet = () => setSheetOpen(false);

  return (
    <div className='relative flex-1 overflow-hidden' onClick={sheetOpen ? closeSheet : undefined}>
      <div className='h-full overflow-y-auto scrollbar-hide'>
        <div className='flex min-h-full flex-col items-center justify-center gap-[10px] px-[16px] py-[14px]'>
          <div className='text-center'>
            <p className='mb-[6px] text-[12.5px] font-[700] text-layout-gray-300'>오늘 밭에서</p>
            <p className='text-[26px] font-[800] leading-[1.25] tracking-[-0.03em]'>
              <span className='text-primary-main-600'>
                <span ref={numRef} className='inline-block tabular-nums'>{shownTotal}</span>개
              </span>
              {onlyRescue ? '를 되살렸어요' : '가 자랐어요'}
            </p>
          </div>

          <div className='relative shrink-0 max-[350px]:-my-[12px] max-[350px]:scale-90' style={{ width: FIELD_W, height: FIELD_H }}>
            <RewardGlow on={finale} gold />
            <div ref={fieldRef} className={`absolute inset-0 ${fieldIn ? 'opacity-100' : 'opacity-0'}`}>
              <img src={fieldBase} alt='' draggable={false} className='absolute inset-0 h-full w-full select-none' />
              {crops.map(({ entry, x, y }, i) => {
                const isGrown = grown.includes(i);
                const gold = entry.kind === 'gold';
                const rescue = entry.kind === 'rescue';
                return (
                  <div
                    key={entry.id}
                    ref={(el) => { cropRefs.current[i] = el; }}
                    onClick={onTapCrop(i)}
                    className={`absolute cursor-pointer origin-[50%_86%] ${i < appeared ? 'opacity-100' : 'opacity-0'}`}
                    style={{ width: CROP_BOX, height: CROP_BOX, left: x - CROP_BOX / 2, top: y - CROP_BOX * CROP_BASELINE, zIndex: 10 + Math.round(y / 19) }}
                  >
                    {gold ? (
                      <span
                        ref={(el) => { haloRefs.current[i] = el; }}
                        aria-hidden
                        className='pointer-events-none absolute left-1/2 top-1/2 -ml-[60px] -mt-[60px] h-[120px] w-[120px] rounded-full opacity-0'
                        style={{ background: 'radial-gradient(circle, rgba(242,210,82,.85) 0%, rgba(242,183,19,.35) 45%, rgba(242,183,19,0) 70%)' }}
                      />
                    ) : null}
                    <img
                      src={fieldSrc(entry.from, rescue ? 'wilted' : 'healthy')}
                      alt=''
                      draggable={false}
                      className={`absolute inset-0 h-full w-full object-contain ${IMG_BASE} ${isGrown ? 'opacity-0' : 'opacity-100'}`}
                    />
                    <img
                      src={fieldSrc(entry.to)}
                      alt={entry.word}
                      draggable={false}
                      className={`absolute ${gold ? 'bottom-[13%] left-1/2 h-[74px] w-auto -translate-x-1/2' : 'inset-0 h-full w-full object-contain'} ${IMG_BASE} ${isGrown ? 'opacity-100' : 'opacity-0'}`}
                    />
                    <span
                      ref={(el) => { labelRefs.current[i] = el; }}
                      className='pointer-events-none absolute bottom-[78%] left-1/2 z-40 whitespace-nowrap rounded-full bg-layout-black px-[8px] py-[3px] text-[11px] font-[700] text-layout-white opacity-0 dark:bg-layout-white dark:text-layout-black'
                    >
                      {entry.word}
                    </span>
                    {rescue ? (
                      <span
                        ref={(el) => { dropRefs.current[i] = el; }}
                        aria-hidden
                        className='pointer-events-none absolute -top-[6px] left-1/2 -ml-[9px] text-secondary-blue-400 opacity-0'
                      >
                        <Drop size={18} weight='fill' />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 종류별 칩 — 자리는 처음부터 잡아 두고(밭이 밀리지 않게) 첫 작물이 자랄 때 튀어나온다 */}
          <div className='flex flex-wrap justify-center gap-[6px]'>
            {kinds.map((kind) => {
              const meta = GROWTH_KIND_META[kind];
              const n = countOf(kind);
              return (
                <div
                  key={kind}
                  ref={(el) => { chipRefs.current[kind] = el; }}
                  className={`flex h-[32px] items-center gap-[5px] rounded-full bg-layout-gray-50 pl-[6px] pr-[11px] text-[12.5px] font-[700] transition-[transform,opacity] duration-300 ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none dark:bg-layout-gray-dark ${n > 0 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
                >
                  <CropImage stage={meta.chipStage} size={22} align='center' alt='' />
                  {meta.drop ? <Drop size={15} weight='fill' className='text-secondary-blue-400' /> : null}
                  {meta.label}
                  <b className={`font-[800] tabular-nums ${meta.gold ? 'text-crop-golden' : 'text-primary-main-600'}`}>{n}</b>
                </div>
              );
            })}
          </div>

          <button
            type='button'
            onClick={openSheet}
            tabIndex={tail ? 0 : -1}
            className={`flex h-[36px] items-center gap-[5px] rounded-full px-[15px] text-[13px] font-[700] text-layout-gray-400 transition-[transform,opacity] duration-300 motion-reduce:transition-none dark:text-layout-gray-200 ${tail ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-[16px] opacity-0'}`}
          >
            <CaretUp size={14} weight='bold' />
            {onlyRescue ? '되살린' : '자란'} 단어 {total}개 보기
          </button>
          <RewardHint show={tail}>작물을 눌러 보세요</RewardHint>
        </div>
      </div>

      {/* 단어 목록 시트 — 본문 영역 안에서만 올라온다(「확인」 버튼은 가리지 않는다) */}
      <div
        role='dialog'
        aria-hidden={!sheetOpen}
        aria-label={`${onlyRescue ? '되살린' : '자란'} 단어 ${total}개`}
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-x-0 bottom-0 z-[60] flex h-[78%] flex-col rounded-t-[22px] bg-layout-white shadow-[0_-8px_30px_rgba(0,0,0,.16)] transition-transform duration-300 ease-[cubic-bezier(.2,.9,.3,1)] motion-reduce:transition-none dark:bg-layout-gray-dark ${sheetOpen ? 'translate-y-0' : 'translate-y-[104%]'}`}
      >
        <button type='button' aria-label='목록 닫기' onClick={closeSheet} className='mx-auto flex h-[26px] w-[80px] shrink-0 items-center justify-center'>
          <span className='h-[4px] w-[38px] rounded-full bg-layout-gray-100 dark:bg-layout-gray-500' />
        </button>
        <h4 className='shrink-0 px-[20px] pb-[10px] text-[15px] font-[800]'>
          {onlyRescue ? '되살린' : '자란'} 단어 {total}개
        </h4>
        <div className='flex flex-1 flex-col gap-[8px] overflow-y-auto px-[16px] pb-[16px] scrollbar-hide'>
          {sheetMounted ? entries.slice().reverse().map((entry) => (
            <FarmGrowRow
              key={entry.id}
              tone='sheet'
              crop={entry.to === 'seed' ? 'PLANTED_SEED' : entry.to}
              word={entry.word}
              meaning={entry.meaning}
              meta={entry.meta}
              right={growthRightLabel(entry)}
              gold={entry.kind === 'gold'}
            />
          )) : null}
        </div>
      </div>
    </div>
  );
};

export default FarmGrowthSlide;
