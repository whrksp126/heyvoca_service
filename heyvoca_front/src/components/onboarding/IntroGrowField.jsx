// src/components/onboarding/IntroGrowField.jsx
//
// 온보딩 소개 — 밭 한가운데에 씨앗 하나를 심고, 그 씨앗이 새싹 → 이파리 → 당근으로 자란다.
// 새로 그린 그림은 없다. 두 결과 화면의 연출을 한 작물에 이어 붙였다.
//   · 심기     takeTest/planting/PlantingScene — 구멍(SoilHole) → 씨앗 낙하 → 흙 튐 → 흙무덤(SoilMound)
//   · 자람     takeTest/rewards/FarmGrowthSlide — 흙무덤이 가라앉으며 새싹, 젤리 눌림 뒤 그림 교체 + 파편·고리
//   · 밭·작물  field-base.png, CropImage(planted V5 · 낱알 씨앗), rewards/fx
//
//   0ms      밭 등장
//   400ms    구멍 → 씨앗 낙하 → 흙 튐 → 흙 덮기
//   +1000ms  새싹 · 이파리 · 당근 (한 박자씩)
//   당근 뒤  잠시 머문 뒤 사라지고 처음부터 다시 심는다
//
// 탭하면 기다리지 않고 다음 단계로 넘어간다(심는 중이면 흙 덮기까지 바로). 당근에서 탭하면 통 튄다.
// 소리는 내지 않는다(아직 첫 화면이라 사용자 제스처 전) — 탭할 때만 짧은 진동.
// 움직임은 transform·opacity 만 쓴다(Web Animations · CSS transition).
import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cropAssetByVariant, CROP_BASELINE } from '../farm/CropImage';
import fieldBase from '../../assets/images/farm/field-base.png';
import { anim, burst, ring, jelly, clearFx, BACK_OUT } from '../takeTest/rewards/fx';
import { FIELD_W, FIELD_H } from '../takeTest/rewards/growth';
import SoilMound, { MOUND_GROUND_X, MOUND_GROUND_Y, MOUND_H } from '../takeTest/planting/SoilMound';
import SoilHole, { HOLE_W, HOLE_H } from '../takeTest/planting/SoilHole';
import { vibrate } from '../../utils/osFunction';

// 심는 자리 — 밭 그림의 가운데 칸(growth.planField 의 1칸 자리와 같다)
const X = FIELD_W / 2;
const Y = 158;
const CROP = 150;                 // 작물 칸 — 한 작물만 있으니 밭 결과 화면(88)보다 크게
// 씨앗·구멍 수치는 PlantingScene 과 같다
const SEED_SRC = cropAssetByVariant('seed', 'healthy', { solo: true });
const SEED_BOX = 112;
const SEED_SINK = 10;
const DROP_MS = 340;
const COVER_MS = 380;
const SLOT = 60;
const GROUND_X = 30;
const GROUND_Y = 44;
const SEED_CLIP = `ellipse(86px 200px at ${GROUND_X}px ${GROUND_Y + 6.5 - 200}px)`;
const SOIL_COLORS = ['#7A5230', '#9A7046', '#A47548', '#B98C5E'];

const GROWN = ['sprout', 'leaf', 'carrot'];
const GROWN_SRC = GROWN.map((c) => cropAssetByVariant(c, 'healthy'));

// 단계 — 각 단계가 시작되기까지 기다리는 시간(앞 단계 시작 기준)
const S = { EMPTY: -1, DUG: 0, SEEDED: 1, LANDED: 2, COVERED: 3, SPROUT: 4, LEAF: 5, CARROT: 6, RESET: 7 };
const WAIT = { [S.DUG]: 400, [S.SEEDED]: 90, [S.LANDED]: Math.round(DROP_MS * 0.76), [S.COVERED]: 180, [S.SPROUT]: 1000, [S.LEAF]: 1000, [S.CARROT]: 1000, [S.RESET]: 2600 };
const RESTART_MS = 500;
const IMG_FADE = 'transition-opacity duration-100 motion-reduce:transition-none';

const IntroGrowField = () => {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(S.EMPTY);
  const stageRef = useRef(S.EMPTY);
  const timerRef = useRef(null);
  const running = useRef([]);

  const fieldRef = useRef(null);
  const holeRef = useRef(null);
  const seedRef = useRef(null);
  const moundRef = useRef(null);
  const cropRef = useRef(null);

  const track = (a) => { if (a) running.current.push(a); return a; };
  const stopAnims = () => {
    running.current.forEach((a) => { try { a.cancel(); } catch (e) { /* 이미 끝남 */ } });
    running.current = [];
  };

  const growFx = (big) => {
    const field = fieldRef.current;
    burst(field, X, Y - (big ? 50 : 30), big ? { n: 12, dist: 60, size: 8 } : { n: 8, dist: 36, size: 6 });
    ring(field, X, Y - 26, { size: big ? 150 : 96, color: '#6CE9A6', dur: 560 });
  };

  // 단계 하나를 화면에 반영한다. fx=false 면 최종 모습만(동작 줄이기·건너뛰기).
  const enter = (k, fx) => {
    stageRef.current = k;
    if (k === S.RESET) {
      // 다 자란 당근이 조용히 사라진 뒤 빈 밭으로
      if (fx) track(anim(cropRef.current, [{ opacity: 1 }, { opacity: 0 }], { duration: RESTART_MS - 60, easing: 'ease-in', fill: 'forwards' }));
      return;
    }
    setStage(k);
    if (k === S.EMPTY) { stopAnims(); return; }
    if (!fx) return;
    switch (k) {
      case S.DUG:
        track(anim(holeRef.current, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: BACK_OUT }));
        break;
      case S.SEEDED:
        track(anim(seedRef.current, [
          { transform: 'translate(-14px,-150px) rotate(-56deg) scale(1.15)', opacity: 0, easing: 'cubic-bezier(.5,0,.9,.6)' },
          { transform: 'translate(-11px,-120px) rotate(-42deg) scale(1.15)', opacity: 1, offset: 0.14, easing: 'cubic-bezier(.5,0,.9,.6)' },
          { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0.76 },
          { transform: 'translate(0,5px) scale(1.2,.74)', opacity: 1, offset: 0.86 },
          { transform: `translate(0,${SEED_SINK}px) scale(1)`, opacity: 1 },
        ], { duration: DROP_MS }));
        break;
      case S.LANDED:
        burst(fieldRef.current, X, Y - 4, { n: 7, dist: 28, size: 6, colors: SOIL_COLORS, dur: 520, up: 16 });
        track(anim(fieldRef.current, [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' }));
        break;
      case S.COVERED:
        track(anim(holeRef.current, [
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(.72,.6)', opacity: 1, offset: 0.55 },
          { transform: 'scale(.45,.3)', opacity: 0 },
        ], { duration: 220, easing: 'ease-in' }));
        track(anim(moundRef.current, [
          { transform: 'scale(1.3,.3)', opacity: 0 },
          { transform: 'scale(1.16,.74)', opacity: 1, offset: 0.24 },
          { transform: 'scale(.95,1.16)', opacity: 1, offset: 0.58 },
          { transform: 'scale(1.04,.92)', opacity: 1, offset: 0.82 },
          { transform: 'scale(1,1)', opacity: 1 },
        ], { duration: COVER_MS, easing: 'ease-out' }));
        break;
      case S.SPROUT:
      case S.LEAF:
      case S.CARROT:
        track(jelly(cropRef.current, k === S.CARROT ? 1.3 : 1.1));
        growFx(k === S.CARROT);
        break;
      default:
    }
  };

  const schedule = (k, wait) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (k === S.RESET + 1) {
        enter(S.EMPTY, false);
        schedule(S.DUG, RESTART_MS);
        return;
      }
      enter(k, !reduced);
      schedule(k + 1, k === S.RESET ? RESTART_MS : WAIT[k + 1]);
    }, wait);
  };

  useEffect(() => {
    if (!reduced) {
      anim(fieldRef.current, [{ transform: 'translateY(30px) scale(.86)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: BACK_OUT });
    }
    schedule(S.DUG, WAIT[S.DUG]);
    return () => {
      clearTimeout(timerRef.current);
      stopAnims();
      clearFx(fieldRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 탭 — 다음 단계로 바로. 심는 중이면 흙 덮기까지 건너뛰고, 당근이면 통 튀기만 한다.
  const onTap = () => {
    vibrate({ duration: 5 });
    const cur = stageRef.current;
    if (cur === S.CARROT || cur === S.RESET) {
      if (cur === S.RESET) { stopAnims(); enter(S.CARROT, false); }
      jelly(cropRef.current, 1.2);
      burst(fieldRef.current, X, Y - 50, { n: 8, dist: 44, size: 6 });
      schedule(S.RESET, WAIT[S.RESET]);
      return;
    }
    let next = cur + 1;
    if (cur < S.COVERED) {
      // 심는 중 — 흙 덮기로 곧장(진행 중이던 낙하는 끊는다)
      stopAnims();
      next = S.COVERED;
    }
    enter(next, !reduced);
    schedule(next + 1, WAIT[next + 1]);
  };

  const growIdx = stage - S.SPROUT;   // 0 새싹 · 1 이파리 · 2 당근 · 음수면 아직 흙 속

  return (
    <div
      className='relative mx-auto shrink-0 max-[380px]:-my-[12px] max-[380px]:scale-90'
      style={{ width: FIELD_W, height: FIELD_H }}
    >
      <div
        ref={fieldRef}
        role='button'
        tabIndex={0}
        aria-label='씨앗이 당근으로 자라는 모습'
        onClick={onTap}
        className='absolute inset-0 cursor-pointer select-none [-webkit-tap-highlight-color:transparent]'
      >
        <img src={fieldBase} alt='' draggable={false} className='absolute inset-0 h-full w-full select-none' />

        {/* 심는 자리 — PlantingScene 의 한 칸 */}
        <div className='pointer-events-none absolute' style={{ width: SLOT, height: SLOT, left: X - GROUND_X, top: Y - GROUND_Y, zIndex: 10 }}>
          <span
            ref={holeRef}
            aria-hidden
            className={`absolute ${stage >= S.DUG && stage < S.COVERED ? 'opacity-100' : 'opacity-0'}`}
            style={{ left: GROUND_X - HOLE_W / 2, top: GROUND_Y - HOLE_H / 2 }}
          >
            <SoilHole />
          </span>
          <span aria-hidden className='absolute inset-0' style={{ clipPath: SEED_CLIP }}>
            <img
              ref={seedRef}
              src={SEED_SRC}
              alt=''
              draggable={false}
              className={`absolute max-w-none select-none ${stage === S.SEEDED || stage === S.LANDED ? 'opacity-100' : 'opacity-0'}`}
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
          {/* 흙무덤 — 새싹이 돋으면 낮게 가라앉으며 사라진다(FarmGrowthSlide 와 같은 처리) */}
          <span
            aria-hidden
            className={`absolute transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${growIdx >= 0 ? 'scale-x-110 scale-y-50 opacity-0' : ''}`}
            style={{ left: GROUND_X - MOUND_GROUND_X, top: GROUND_Y - MOUND_GROUND_Y, transformOrigin: `50% ${((MOUND_GROUND_Y + 2) / MOUND_H) * 100}%` }}
          >
            <span ref={moundRef} className={`block ${stage >= S.COVERED ? 'opacity-100' : 'opacity-0'}`}>
              <SoilMound />
            </span>
          </span>
        </div>

        {/* 자라는 작물 — 바닥선이 심은 자리에 온다. 세 그림을 겹쳐 두고 opacity 로만 바꾼다 */}
        <div
          ref={cropRef}
          aria-hidden
          className='pointer-events-none absolute origin-[50%_86%]'
          style={{ width: CROP, height: CROP, left: X - CROP / 2, top: Y - CROP * CROP_BASELINE, zIndex: 11 }}
        >
          {GROWN_SRC.map((src, i) => (
            <img
              key={GROWN[i]}
              src={src}
              alt=''
              draggable={false}
              className={`absolute inset-0 h-full w-full select-none object-contain ${IMG_FADE} ${growIdx === i ? 'opacity-100' : 'opacity-0'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default IntroGrowField;
