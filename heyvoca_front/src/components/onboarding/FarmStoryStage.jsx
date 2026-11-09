// src/components/onboarding/FarmStoryStage.jsx
//
// 온보딩 '농사 이야기' 무대(이슈 #25 4차) — 장면이 바뀌어도 **밭 하나가 그대로 남아** 그 위에서 이어진다.
// 화면 전환(좌우 슬라이드)이 없다. 호출부(pages/Onboarding.jsx)는 scene 만 바꾸고 문구를 크로스페이드한다.
//
//   grow    밭 가운데 구멍 → 씨앗 낙하 → 흙 덮기 → 새싹 → 이파리 → 싱싱한 당근
//           (심기 = takeTest/planting/PlantingScene, 자람 = rewards/FarmGrowthSlide 연출을 그대로 가져왔다)
//   wilt    같은 당근 그대로, 날짜 칩(3일 뒤 → 7일 뒤 → 14일 뒤)과 함께 마름 → 시듦 → 썩음
//   field   썩은 당근이 흙으로 가라앉고 밭이 살짝 뒤로 물러나며, 이번 학습에 나올 단어 8개가 여러 상태
//           (씨앗·새싹·이파리·당근, 일부 마름·시듦)로 '뽕' 돋아난다. 돋을 때·탭할 때 작물 위에 단어 이름표가
//           잠깐 떴다 사라진다(학습 결과 밭 성장·씨앗 심기 슬라이드와 같은 연출 — rewards/fx WORD_LABEL_FRAMES).
//   (학습을 마친 뒤는 실제 학습 결과 화면(StudyResult)이 맡는다 — 이슈 #25 4차 후속)
//
// 연출이 끝나면 onSceneDone 을 한 번 부른다(호출부가 그때 버튼을 켠다). instant 면 끝 모습으로 바로 그리고
// 곧장 끝을 알린다 — 뒤로 가기로 이전 장면을 다시 세울 때, 동작 줄이기(prefers-reduced-motion)일 때.
// 밭을 탭하면 지금 장면을 끝 모습으로 건너뛴다.
// 움직임은 transform·opacity 만 쓴다(Web Animations · CSS transition). 소리는 내지 않는다 — 탭할 때만 짧은 진동.
import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { cropAssetByVariant, CROP_BASELINE } from '../farm/CropImage';
import fieldBase from '../../assets/images/farm/field-base.png';
import { anim, burst, ring, jelly, clearFx, BACK_OUT, WORD_LABEL_FRAMES, WORD_LABEL_CLASS } from '../takeTest/rewards/fx';
import { FIELD_W, FIELD_H, CROP_BOX } from '../takeTest/rewards/growth';
import SoilMound, { MOUND_GROUND_X, MOUND_GROUND_Y, MOUND_H } from '../takeTest/planting/SoilMound';
import SoilHole, { HOLE_W, HOLE_H } from '../takeTest/planting/SoilHole';
import { healthToVariant } from '../../utils/crop';
import { vibrate } from '../../utils/osFunction';

// 가운데 칸 — 주인공 당근 자리(growth.planField 의 1칸 자리)
const X = FIELD_W / 2;
const Y = 158;
const HERO = 150;
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
const IMG_FADE = 'transition-opacity duration-150 motion-reduce:transition-none';

// 주인공 당근의 그림 — 자라는 세 단계 + 시드는 세 상태
const HERO_IMGS = [
  ['sprout', 'healthy'], ['leaf', 'healthy'], ['carrot', 'healthy'],
  ['carrot', 'drying'], ['carrot', 'wilted'], ['carrot', 'rotten'],
];
const heroIdx = (crop, variant) => HERO_IMGS.findIndex(([c, v]) => c === crop && v === variant);

// 체험 밭 8칸 — 가운데(주인공 자리)를 비운 3×3 (growth.js SLOTS_BY_COUNT[8] 과 같은 배치)
const SLOTS = [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [2, 1], [1, 2], [2, 2]];
const slotXY = (n) => {
  const [i, j] = SLOTS[n % SLOTS.length];
  return { x: FIELD_W / 2 + (i - j) * 44, y: 150 + (i + j - 2) * 19 };
};
const STAGE_CROP = { PLANTED_SEED: 'seed', SPROUT: 'sprout', LEAF: 'leaf', CARROT: 'carrot' };
// 밭 위 그림 — 흙 딸린 판, 씨앗만 낱알(FarmGrowthSlide fieldSrc 와 같다)
const fieldSrc = (stage, health) => {
  const crop = STAGE_CROP[stage] || 'seed';
  return cropAssetByVariant(crop, healthToVariant(health), { solo: crop === 'seed' });
};

// 장면 시간표(ms)
const GROW_T = { dug: 450, seeded: 90, landed: Math.round(DROP_MS * 0.76), covered: 180, sprout: 900, leaf: 950, carrot: 950, done: 650 };
const WILT_T = { first: 800, step: 1150, done: 600 };
const FIELD_T = { recede: 380, firstCrop: 900, each: 150, done: 450 };

/**
 * @param {'grow'|'wilt'|'field'} scene
 * @param {number} runKey     값이 바뀌면 같은 장면이라도 처음부터 다시 그린다(호출부의 장면 진입 토큰)
 * @param {boolean} instant   끝 모습으로 바로(뒤로 가기·건너뛰기)
 * @param {Array} words       field 장면 단어 [{ id, origin, stage, health }]
 * @param {(scene) => void} onSceneDone
 */
const FarmStoryStage = ({ scene, runKey = 0, instant = false, words = [], onSceneDone }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const reduced = useReducedMotion();
  // 주인공 당근 — plant: 'empty'|'dug'|'seeded'|'landed'|'covered'|'grown', img: HERO_IMGS 인덱스
  const [hero, setHero] = useState({ plant: 'empty', img: -1, gone: false });
  const [day, setDay] = useState(null);
  const [receded, setReceded] = useState(false);
  // 밭 작물 — 보이는 칸 수와 칸마다 지금 그림 상태
  const [shown, setShown] = useState(0);
  const [cropState, setCropState] = useState([]);

  const timers = useRef([]);
  const running = useRef([]);
  const doneRef = useRef(false);
  const sceneRef = useRef(scene);
  const fieldRef = useRef(null);
  const holeRef = useRef(null);
  const seedRef = useRef(null);
  const moundRef = useRef(null);
  const heroRef = useRef(null);
  const cropRefs = useRef([]);
  const labelRefs = useRef([]);
  const onDoneRef = useRef(onSceneDone);
  useEffect(() => { onDoneRef.current = onSceneDone; });

  const track = (a) => { if (a) running.current.push(a); return a; };
  const stopAll = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    running.current.forEach((a) => { try { a.cancel(); } catch (e) { /* 이미 끝남 */ } });
    running.current = [];
  };
  const at = (ms, fn) => { timers.current.push(setTimeout(fn, ms)); };
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current?.(sceneRef.current);
  };

  const finalWords = words;
  const stateOf = (w) => ({ stage: w.stage, health: w.health });

  // 각 장면의 끝 모습 — 건너뛰기·뒤로 가기·동작 줄이기가 모두 이걸 그린다
  const settle = (sc) => {
    stopAll();
    if (sc === 'grow') {
      setHero({ plant: 'grown', img: heroIdx('carrot', 'healthy'), gone: false });
      setDay(null); setReceded(false); setShown(0);
    } else if (sc === 'wilt') {
      setHero({ plant: 'grown', img: heroIdx('carrot', 'rotten'), gone: false });
      setDay('14일 뒤'); setReceded(false); setShown(0);
    } else if (sc === 'field') {
      setHero({ plant: 'grown', img: heroIdx('carrot', 'rotten'), gone: true });
      setDay(null); setReceded(true);
      setCropState(finalWords.map(stateOf)); setShown(finalWords.length);
    }
    finish();
  };

  const showWord = (i, hold = 900) => track(anim(labelRefs.current[i], WORD_LABEL_FRAMES, { duration: hold, easing: 'ease-out' }));
  // 작물 탭 — 결과 슬라이드와 같이 통 튀고 이름표가 다시 뜬다
  const onTapCrop = (i) => (e) => {
    if (!doneRef.current || i >= shown) return; // 연출 중이면 밭 탭(건너뛰기)으로 넘긴다
    e.stopPropagation();
    const { x, y } = slotXY(i);
    vibrate({ duration: 5 });
    jelly(cropRefs.current[i], 1);
    showWord(i, 1300);
    burst(fieldRef.current, x, y - 34, { n: 6, dist: 26, size: 5 });
  };

  const growFx = (big) => {
    const field = fieldRef.current;
    burst(field, X, Y - (big ? 50 : 30), big ? { n: 12, dist: 60, size: 8 } : { n: 8, dist: 36, size: 6 });
    ring(field, X, Y - 26, { size: big ? 150 : 96, color: '#6CE9A6', dur: 560 });
  };
  const heroTo = (img, fx) => {
    setHero((h) => ({ ...h, plant: 'grown', img }));
    if (fx === 'grow') { track(jelly(heroRef.current, img === heroIdx('carrot', 'healthy') ? 1.3 : 1.1)); growFx(img === heroIdx('carrot', 'healthy')); }
    if (fx === 'droop') {
      track(anim(heroRef.current, [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-5deg) translateY(2px)', offset: 0.4 }, { transform: 'rotate(0deg)' },
      ], { duration: 900, easing: 'ease-in-out' }));
    }
  };

  const runGrow = () => {
    setHero({ plant: 'empty', img: -1, gone: false });
    setDay(null); setReceded(false); setShown(0);
    let t = GROW_T.dug;
    at(t, () => {
      setHero({ plant: 'dug', img: -1, gone: false });
      track(anim(holeRef.current, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: BACK_OUT }));
    });
    t += GROW_T.seeded;
    at(t, () => {
      setHero({ plant: 'seeded', img: -1, gone: false });
      track(anim(seedRef.current, [
        { transform: 'translate(-14px,-150px) rotate(-56deg) scale(1.15)', opacity: 0, easing: 'cubic-bezier(.5,0,.9,.6)' },
        { transform: 'translate(-11px,-120px) rotate(-42deg) scale(1.15)', opacity: 1, offset: 0.14, easing: 'cubic-bezier(.5,0,.9,.6)' },
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0.76 },
        { transform: 'translate(0,5px) scale(1.2,.74)', opacity: 1, offset: 0.86 },
        { transform: `translate(0,${SEED_SINK}px) scale(1)`, opacity: 1 },
      ], { duration: DROP_MS }));
    });
    t += GROW_T.landed;
    at(t, () => {
      burst(fieldRef.current, X, Y - 4, { n: 7, dist: 28, size: 6, colors: SOIL_COLORS, dur: 520, up: 16 });
      track(anim(fieldRef.current, [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }], { duration: 200, easing: 'ease-out' }));
    });
    t += GROW_T.covered;
    at(t, () => {
      setHero({ plant: 'covered', img: -1, gone: false });
      track(anim(holeRef.current, [
        { transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.72,.6)', opacity: 1, offset: 0.55 }, { transform: 'scale(.45,.3)', opacity: 0 },
      ], { duration: 220, easing: 'ease-in' }));
      track(anim(moundRef.current, [
        { transform: 'scale(1.3,.3)', opacity: 0 }, { transform: 'scale(1.16,.74)', opacity: 1, offset: 0.24 },
        { transform: 'scale(.95,1.16)', opacity: 1, offset: 0.58 }, { transform: 'scale(1.04,.92)', opacity: 1, offset: 0.82 },
        { transform: 'scale(1,1)', opacity: 1 },
      ], { duration: COVER_MS, easing: 'ease-out' }));
    });
    t += GROW_T.sprout; at(t, () => heroTo(heroIdx('sprout', 'healthy'), 'grow'));
    t += GROW_T.leaf; at(t, () => heroTo(heroIdx('leaf', 'healthy'), 'grow'));
    t += GROW_T.carrot; at(t, () => heroTo(heroIdx('carrot', 'healthy'), 'grow'));
    t += GROW_T.done; at(t, finish);
  };

  const runWilt = () => {
    setHero({ plant: 'grown', img: heroIdx('carrot', 'healthy'), gone: false });
    setReceded(false); setShown(0);
    setDay('오늘');
    [['3일 뒤', 'drying'], ['7일 뒤', 'wilted'], ['14일 뒤', 'rotten']].forEach(([label, v], i) => {
      at(WILT_T.first + i * WILT_T.step, () => { setDay(label); heroTo(heroIdx('carrot', v), 'droop'); });
    });
    at(WILT_T.first + 2 * WILT_T.step + WILT_T.done, finish);
  };

  const runField = () => {
    setDay(null);
    setHero({ plant: 'grown', img: heroIdx('carrot', 'rotten'), gone: false });
    setCropState(finalWords.map(stateOf));
    setShown(0);
    // 썩은 당근은 흙으로 가라앉는다
    track(anim(heroRef.current, [
      { transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(14px) scale(.55,.4)', opacity: 0 },
    ], { duration: 420, easing: 'ease-in', fill: 'forwards' }));
    at(420, () => setHero((h) => ({ ...h, gone: true })));
    at(FIELD_T.recede, () => setReceded(true));
    finalWords.forEach((w, i) => {
      at(FIELD_T.firstCrop + i * FIELD_T.each, () => {
        setShown(i + 1);
        const { x, y } = slotXY(i);
        // 결과 슬라이드(FarmGrowthSlide)의 작물 등장과 같은 '뽕' + 단어 이름표
        track(anim(cropRefs.current[i], [{ transform: 'translateY(-16px) scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 320, easing: BACK_OUT }));
        showWord(i);
        burst(fieldRef.current, x, y - 6, { n: 5, dist: 20, size: 5, colors: SOIL_COLORS, dur: 420, up: 10 });
      });
    });
    at(FIELD_T.firstCrop + finalWords.length * FIELD_T.each + FIELD_T.done, finish);
  };

  useEffect(() => {
    sceneRef.current = scene;
    doneRef.current = false;
    stopAll();
    if (instant || reduced) {
      // 동작 줄이기 — 끝 모습을 바로 그리되 버튼이 너무 갑자기 켜지지 않게 아주 잠깐 둔다
      const t = setTimeout(() => settle(scene), instant ? 0 : 250);
      timers.current.push(t);
    } else if (scene === 'grow') runGrow();
    else if (scene === 'wilt') runWilt();
    else if (scene === 'field') runField();
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, runKey]);

  useEffect(() => {
    if (!reduced) {
      anim(fieldRef.current, [{ transform: 'translateY(24px) scale(.88)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: BACK_OUT });
    }
    return () => { stopAll(); clearFx(fieldRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 탭 — 지금 장면을 끝 모습으로
  const onTap = () => {
    vibrate({ duration: 5 });
    if (!doneRef.current) { settle(sceneRef.current); return; }
    if (hero.img >= 0 && !hero.gone) {
      jelly(heroRef.current, 1.15);
      burst(fieldRef.current, X, Y - 50, { n: 8, dist: 44, size: 6 });
    }
  };

  const showSeed = hero.plant === 'seeded';
  const showHole = hero.plant === 'dug' || hero.plant === 'seeded';
  const showMound = hero.plant === 'covered' || hero.plant === 'grown';
  const heroUp = hero.plant === 'grown' && hero.img >= 0;

  return (
    <div
      className='relative mx-auto shrink-0 max-[380px]:-my-[12px] max-[380px]:scale-90'
      style={{ width: FIELD_W, height: FIELD_H }}
    >
      {/* 날짜 칩 — 시듦 장면에서만. 밭 위 가운데 */}
      <div
        aria-live='polite'
        className={`
          pointer-events-none absolute left-1/2 top-[-6px] z-[40] -translate-x-1/2
          rounded-full border border-border dark:border-border-dark bg-layout-white dark:bg-layout-black
          px-[12px] py-[4px] text-[14px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white
          transition-opacity duration-300 motion-reduce:transition-none ${day ? 'opacity-100' : 'opacity-0'}
        `}
      >
        {day ?? ''}
      </div>
      <div
        className={`absolute inset-0 origin-top transition-transform duration-[900ms] ease-[cubic-bezier(.6,.05,.25,1)] motion-reduce:transition-none ${receded ? 'scale-[0.92] -translate-y-[6px]' : ''}`}
      >
        <div
          ref={fieldRef}
          role='button'
          tabIndex={0}
          aria-label='농장 밭'
          onClick={onTap}
          className='absolute inset-0 cursor-pointer select-none [-webkit-tap-highlight-color:transparent]'
        >
          <img src={fieldBase} alt='' draggable={false} className='absolute inset-0 h-full w-full select-none' />

          {/* 주인공 심는 자리 — PlantingScene 의 한 칸 */}
          <div className='pointer-events-none absolute' style={{ width: SLOT, height: SLOT, left: X - GROUND_X, top: Y - GROUND_Y, zIndex: 10 }}>
            <span
              ref={holeRef}
              aria-hidden
              className={`absolute ${showHole ? 'opacity-100' : 'opacity-0'}`}
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
                className={`absolute max-w-none select-none ${showSeed ? 'opacity-100' : 'opacity-0'}`}
                style={{
                  width: SEED_BOX, height: SEED_BOX,
                  left: GROUND_X - SEED_BOX / 2, top: GROUND_Y - SEED_BOX * CROP_BASELINE,
                  transform: `translateY(${SEED_SINK}px)`, transformOrigin: `50% ${CROP_BASELINE * 100}%`,
                }}
              />
            </span>
            {/* 흙무덤 — 새싹이 돋으면 낮게 가라앉으며 사라진다(FarmGrowthSlide 와 같은 처리) */}
            <span
              aria-hidden
              className={`absolute transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${heroUp ? 'scale-x-110 scale-y-50 opacity-0' : ''}`}
              style={{ left: GROUND_X - MOUND_GROUND_X, top: GROUND_Y - MOUND_GROUND_Y, transformOrigin: `50% ${((MOUND_GROUND_Y + 2) / MOUND_H) * 100}%` }}
            >
              <span ref={moundRef} className={`block ${showMound ? 'opacity-100' : 'opacity-0'}`}>
                <SoilMound />
              </span>
            </span>
          </div>

          {/* 주인공 당근 — 그림을 겹쳐 두고 opacity 로만 바꾼다 */}
          <div
            ref={heroRef}
            aria-hidden
            className={`pointer-events-none absolute origin-[50%_86%] ${hero.gone ? 'opacity-0' : ''}`}
            style={{ width: HERO, height: HERO, left: X - HERO / 2, top: Y - HERO * CROP_BASELINE, zIndex: 11 }}
          >
            {HERO_IMGS.map(([c, v], i) => (
              <img
                key={`${c}-${v}`}
                src={cropAssetByVariant(c, v)}
                alt=''
                draggable={false}
                className={`absolute inset-0 h-full w-full select-none object-contain ${IMG_FADE} ${heroUp && hero.img === i ? 'opacity-100' : 'opacity-0'}`}
              />
            ))}
          </div>

          {/* 체험 밭 작물 — 단어는 돋을 때·탭할 때만 위에 잠깐 뜬다 */}
          {finalWords.map((w, i) => {
            const { x, y } = slotXY(i);
            const st = cropState[i] ?? stateOf(w);
            const visible = i < shown;
            return (
              <div
                key={w.id}
                ref={(el) => { cropRefs.current[i] = el; }}
                onClick={onTapCrop(i)}
                className={`absolute origin-[50%_86%] ${visible ? 'cursor-pointer opacity-100' : 'pointer-events-none opacity-0'}`}
                style={{ width: CROP_BOX, height: CROP_BOX, left: x - CROP_BOX / 2, top: y - CROP_BOX * CROP_BASELINE, zIndex: 12 + Math.round(y / 19) }}
              >
                <img
                  src={fieldSrc(st.stage, st.health)}
                  alt={w.origin}
                  draggable={false}
                  className='pointer-events-none absolute inset-0 h-full w-full select-none object-contain'
                />
                <span ref={(el) => { labelRefs.current[i] = el; }} className={`${WORD_LABEL_CLASS} bottom-[78%]`}>
                  {w.origin}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default FarmStoryStage;
