// src/components/onboarding/FarmStoryStage.jsx
//
// 온보딩 '농사 이야기' 무대 — 장면이 바뀌어도 **밭 하나가 그대로 남아** 그 위에서 이어진다.
// 화면 전환(좌우 슬라이드)이 없다. 호출부(pages/Onboarding.jsx)는 scene 만 바꾸고 문구를 크로스페이드한다.
//
// (이슈 #25 9차 QA) 예전엔 가운데 당근 하나가 자라고 시든 뒤 사라지고, 그다음에 체험 단어 8개가 따로
// 돋았다. 이제는 처음부터 **체험 단어 8칸**이 무대다 — 같은 밭이 그대로 이어진다.
//   grow    8칸에 차례로 구멍 → 씨앗 낙하 → 흙 덮기(takeTest/planting/PlantingScene 과 같은 연출).
//           그중 일부가 새싹으로, 그중 일부가 이파리로, 그중 일부가 당근까지 자란다(칸마다 시차).
//           어디까지 자랄지는 체험 밭 가상 작물의 시작 상태(utils/onboardingPlacement initVirtualFarm)다.
//   wilt    날짜 칩(3일 뒤 → 7일 뒤 …)과 함께 그중 일부가 마름 → 시듦으로 점점 시든다.
//           → 이 장면 끝 모습 = 체험 시작 밭(학습 화면 농장 결과 바가 그리는 상태와 같다).
//   field   같은 밭 그대로, 작물마다 단어 이름표가 차례로 잠깐 떴다 사라진다(+ 가벼운 소리·진동, 시차).
//   result  학습을 마친 뒤 안내 장 — words 에 학습 후 상태를 받아 끝 모습으로 바로 그리고 이름표만 차례로 띄운다.
//
// 연출이 끝나면 onSceneDone 을 한 번 부른다(호출부가 그때 버튼을 켠다). instant 면 끝 모습으로 바로 그리고
// 곧장 끝을 알린다 — 뒤로 가기로 이전 장면을 다시 세울 때, 동작 줄이기(prefers-reduced-motion)일 때.
// 밭을 탭하면 지금 장면을 끝 모습으로 건너뛴다. 끝난 뒤 작물을 탭하면 통 튀고 이름표가 다시 뜬다.
// 움직임은 transform·opacity·filter 만 쓴다(Web Animations · CSS transition).
//
// 【손맛】 작물 그림이 바뀌는 순간 lib/feel 의 feel(cue) 한 줄로 소리+진동을 같이 낸다.
//   진화  밝은 빛(뒤쪽 후광 + 밝기 번쩍)이 차오른 순간 그림을 크로스페이드 → 젤리·파편·고리.
//         새싹 xpUp(칸마다, 소리가 겹치지 않는 간격) · 이파리/당근 evolve(라운드 첫 칸만 소리, 나머지 칸은 진동만).
//   퇴화  그 반대 — 채도·밝기가 가라앉고 어두운 그늘이 끼며 처지고 떨린다, 어두운 부스러기가 떨어진다.
//         소리 wilt(시듦 전용 — 내려가는 저음 글리산도 + 먹먹한 필터, 묵직한 진동). 라운드 첫 칸만 소리.
//   이름표 select(심기·학습 결과의 단어 이름표와 같은 결) — 칸마다 시차.
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
import { primeSfx } from '../../utils/audio';
import { feel } from '../../lib/feel';

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
const IMG_FADE = 'transition-opacity duration-[320ms] ease-out motion-reduce:transition-none';
// 효과 시작 → 그림 교체까지(ms). 진화는 evolve 의 강한 마지막 음(240ms)에, 퇴화는 가장 어두운 순간에 맞춘다.
const EVOLVE_SWAP_MS = 220;
const WILT_SWAP_MS = 360;
const DUST_COLORS = ['#4A3B2C', '#5E4A35', '#3B3340', '#6B5A48'];
const TICK = { cue: 'tap', opts: { sound: false } }; // 소리 없이 진동만

// 체험 밭 8칸 — 가운데를 비운 3×3 (growth.js SLOTS_BY_COUNT[8] 과 같은 배치)
const SLOTS = [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [2, 1], [1, 2], [2, 2]];
const slotXY = (n) => {
  const [i, j] = SLOTS[n % SLOTS.length];
  return { x: FIELD_W / 2 + (i - j) * 44, y: 150 + (i + j - 2) * 19 };
};
const STAGES = ['PLANTED_SEED', 'SPROUT', 'LEAF', 'CARROT'];
const STAGE_CROPS = ['seed', 'sprout', 'leaf', 'carrot'];
const WILT_ORDER = ['drying', 'wilted', 'rotten'];
const DAY_LABELS = ['3일 뒤', '7일 뒤', '14일 뒤'];

/*
  칸 하나가 지나는 그림 순서 — 씨앗부터 마지막 단계까지 싱싱하게 자라고(grow), 그다음 마지막 상태까지
  한 단계씩 시든다(wilt). grownAt = 다 자란 그림의 인덱스, path 의 끝 = 마지막 상태.
*/
const pathOf = (w) => {
  const si = Math.max(0, STAGES.indexOf(w.stage));
  const path = STAGE_CROPS.slice(0, si + 1).map((c) => [c, 'healthy']);
  const v = healthToVariant(w.health);
  const wi = WILT_ORDER.indexOf(v);
  if (wi >= 0) WILT_ORDER.slice(0, wi + 1).forEach((wv) => path.push([STAGE_CROPS[si], wv]));
  if (v === 'golden') path.push([STAGE_CROPS[si], 'golden']);
  return { path, grownAt: si };
};

// 칸 단계 — 빈 땅 / 구멍 / 씨앗 / 흙 덮음 / 작물(그림 idx)
const PH = { NONE: 0, DUG: 1, SEEDED: 2, COVERED: 3, UP: 4 };

// 장면 시간표(ms)
const PLANT_T = { start: 300, gap: 110, toCrop: 740 };
const GROW_T = { roundGap: 650, each: 220, done: 650 };
const WILT_T = { first: 800, step: 1300, each: 200, done: 700 };
const LABEL_T = { first: 350, each: 260, hold: 1000, done: 500 };

/**
 * @param {'grow'|'wilt'|'field'|'result'} scene
 * @param {number} runKey     값이 바뀌면 같은 장면이라도 처음부터 다시 그린다(호출부의 장면 진입 토큰)
 * @param {boolean} instant   끝 모습으로 바로(뒤로 가기·건너뛰기)
 * @param {Array} words       밭 단어 [{ id, origin, stage, health }] — grow·wilt·field 는 체험 시작 상태, result 는 학습 후 상태
 * @param {(scene) => void} onSceneDone
 */
const FarmStoryStage = ({ scene, runKey = 0, instant = false, words = [], onSceneDone }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const reduced = useReducedMotion();
  const plans = words.map(pathOf);
  // 칸마다 { ph, idx } — idx 는 plans[i].path 인덱스
  const [cells, setCells] = useState([]);
  const [day, setDay] = useState(null);

  const timers = useRef([]);
  const running = useRef([]);
  const doneRef = useRef(false);
  const sceneRef = useRef(scene);
  const fieldRef = useRef(null);
  const cropRefs = useRef([]);
  const imgWrapRefs = useRef([]);
  const holeRefs = useRef([]);
  const seedRefs = useRef([]);
  const moundRefs = useRef([]);
  const glowRefs = useRef([]);
  const gloomRefs = useRef([]);
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
  const setCell = (i, patch) => setCells((prev) => {
    const next = prev.length ? [...prev] : plans.map(() => ({ ph: PH.NONE, idx: -1 }));
    next[i] = { ...(next[i] || { ph: PH.NONE, idx: -1 }), ...patch };
    return next;
  });
  const fillCells = (fn) => setCells(plans.map((p, i) => fn(p, i)));
  // 시듦 라운드 수 — 가장 많이 시드는 칸이 다 자란 뒤 몇 단계 시드는지
  const wiltRounds = () => Math.max(0, ...plans.map((p) => p.path.length - 1 - p.grownAt));

  // 각 장면의 끝 모습 — 건너뛰기·뒤로 가기·동작 줄이기가 모두 이걸 그린다
  const settle = (sc) => {
    stopAll();
    if (sc === 'grow') {
      fillCells((p) => ({ ph: PH.UP, idx: p.grownAt }));
      setDay(null);
    } else {
      fillCells((p) => ({ ph: PH.UP, idx: p.path.length - 1 }));
      const rounds = wiltRounds();
      setDay(sc === 'wilt' && rounds ? DAY_LABELS[Math.min(rounds, DAY_LABELS.length) - 1] : null);
    }
    finish();
  };

  const showWord = (i, hold = LABEL_T.hold) => track(anim(labelRefs.current[i], WORD_LABEL_FRAMES, { duration: hold, easing: 'ease-out' }));

  // 작물 탭 — 결과 슬라이드와 같이 통 튀고 이름표가 다시 뜬다
  const onTapCrop = (i) => (e) => {
    if (!doneRef.current || (cells[i]?.ph ?? 0) < PH.UP) return; // 연출 중이면 밭 탭(건너뛰기)으로 넘긴다
    e.stopPropagation();
    const { x, y } = slotXY(i);
    feel('tap');
    jelly(cropRefs.current[i], 1);
    showWord(i, 1300);
    burst(fieldRef.current, x, y - 34, { n: 6, dist: 26, size: 5 });
  };

  // 어두운 부스러기 — 작물 위쪽에서 아래로 힘없이 떨어진다(fx.burst 의 반대). 끝나면 스스로 빠진다.
  const dust = (cx, cy, n = 6) => {
    const field = fieldRef.current;
    if (!field) return;
    for (let k = 0; k < n; k += 1) {
      const size = 3 + (k % 3);
      const node = document.createElement('span');
      node.setAttribute('aria-hidden', 'true');
      const x0 = cx + (k - (n - 1) / 2) * 7 + ((k * 37) % 5) - 2;
      const y0 = cy - 58 + ((k * 53) % 20);
      node.style.cssText = `position:absolute;pointer-events:none;left:${x0}px;top:${y0}px;width:${size}px;height:${size}px;border-radius:50%;z-index:30;opacity:0;background:${DUST_COLORS[k % DUST_COLORS.length]}`;
      field.appendChild(node);
      const a = anim(node, [
        { transform: 'translate(0,0) scale(.6)', opacity: 0 },
        { transform: `translate(${(k % 2 ? 1 : -1) * 2}px,8px) scale(1)`, opacity: 0.85, offset: 0.2 },
        { transform: `translate(${(k % 2 ? -1 : 1) * 4}px,${46 + (k % 4) * 8}px) scale(.7)`, opacity: 0 },
      ], { duration: 820 + (k % 3) * 120, delay: (k % 4) * 50, easing: 'cubic-bezier(.45,0,.9,.6)' });
      if (!a) { node.remove(); continue; }
      a.onfinish = () => node.remove();
      a.oncancel = () => node.remove();
    }
  };

  // 진화 — 후광과 밝기가 차오른 정점에서 그림을 바꾼다
  const evolveCell = (i, idx, fx) => {
    if (fx) feel(fx.cue, fx.opts);
    const { x, y } = slotXY(i);
    const big = plans[i]?.path[idx]?.[0] === 'carrot';
    track(anim(glowRefs.current[i], [
      { transform: 'scale(.55)', opacity: 0 },
      { transform: 'scale(1.05)', opacity: 1, offset: 0.35 },
      { transform: 'scale(1.3)', opacity: 0 },
    ], { duration: 760, easing: 'ease-out' }));
    track(anim(imgWrapRefs.current[i], [
      { filter: 'brightness(1) saturate(1)' },
      { filter: 'brightness(1.55) saturate(1.15)', offset: 0.4 },
      { filter: 'brightness(1) saturate(1)' },
    ], { duration: 540, easing: 'ease-out' }));
    at(EVOLVE_SWAP_MS, () => {
      setCell(i, { ph: PH.UP, idx });
      track(jelly(cropRefs.current[i], big ? 1.25 : 1.1));
      burst(fieldRef.current, x, y - (big ? 40 : 26), big ? { n: 10, dist: 46, size: 7 } : { n: 6, dist: 28, size: 5 });
      ring(fieldRef.current, x, y - 22, { size: big ? 110 : 76, color: '#6CE9A6', dur: 520 });
    });
  };

  // 퇴화 — 진화의 반대: 가라앉는 색·어두운 그늘·처짐과 떨림·떨어지는 부스러기. 가장 어두운 순간 그림을 바꾼다
  const wiltCell = (i, idx, fx) => {
    if (fx) feel(fx.cue, fx.opts);
    const { x, y } = slotXY(i);
    track(anim(imgWrapRefs.current[i], [
      { filter: 'saturate(1) brightness(1)' },
      { filter: 'saturate(.35) brightness(.62)', offset: 0.42 },
      { filter: 'saturate(.6) brightness(.8)', offset: 0.7 },
      { filter: 'saturate(1) brightness(1)' },
    ], { duration: 1000, easing: 'ease-in-out' }));
    track(anim(cropRefs.current[i], [
      { transform: 'rotate(0deg) translateY(0)' },
      { transform: 'rotate(-2.5deg) translateY(1px)', offset: 0.12 },
      { transform: 'rotate(2deg) translateY(1px)', offset: 0.24 },
      { transform: 'rotate(-1.5deg) translateY(2px)', offset: 0.34 },
      { transform: 'rotate(-6deg) translateY(3px) scale(1,.96)', offset: 0.55 },
      { transform: 'rotate(0deg) translateY(0)' },
    ], { duration: 1000, easing: 'ease-in-out' }));
    track(anim(gloomRefs.current[i], [
      { transform: 'translateY(-10px) scale(.8)', opacity: 0 },
      { transform: 'translateY(0) scale(1)', opacity: 1, offset: 0.4 },
      { transform: 'translateY(3px) scale(1.05)', opacity: 0 },
    ], { duration: 1050, easing: 'ease-in-out' }));
    at(120, () => dust(x, y));
    at(WILT_SWAP_MS, () => setCell(i, { ph: PH.UP, idx }));
  };

  // 이름표를 차례로 — 심기·학습 결과의 단어 이름표와 같은 결(select, 칸마다 시차)
  const runLabels = (start) => {
    plans.forEach((_, i) => {
      at(start + i * LABEL_T.each, () => {
        feel('select');
        track(jelly(cropRefs.current[i], 0.8));
        showWord(i);
      });
    });
    at(start + Math.max(0, plans.length - 1) * LABEL_T.each + LABEL_T.hold + LABEL_T.done, finish);
  };

  const runGrow = () => {
    setDay(null);
    fillCells(() => ({ ph: PH.NONE, idx: -1 }));
    // ① 심기 — PlantingScene 과 같은 구멍 → 낙하 → 흙 덮기, 칸마다 시차
    plans.forEach((_, i) => {
      const t0 = PLANT_T.start + i * PLANT_T.gap;
      const { x, y } = slotXY(i);
      at(t0, () => {
        setCell(i, { ph: PH.DUG });
        track(anim(holeRefs.current[i], [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: BACK_OUT }));
      });
      at(t0 + 90, () => {
        setCell(i, { ph: PH.SEEDED });
        const dx = (i % 2 ? 1 : -1) * (10 + (i % 3) * 5);
        track(anim(seedRefs.current[i], [
          { transform: `translate(${dx}px,-150px) rotate(${dx * 4}deg) scale(1.15)`, opacity: 0, easing: 'cubic-bezier(.5,0,.9,.6)' },
          { transform: `translate(${dx * 0.8}px,-120px) rotate(${dx * 3}deg) scale(1.15)`, opacity: 1, offset: 0.14, easing: 'cubic-bezier(.5,0,.9,.6)' },
          { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0.76 },
          { transform: 'translate(0,5px) scale(1.2,.74)', opacity: 1, offset: 0.86 },
          { transform: `translate(0,${SEED_SINK}px) scale(1)`, opacity: 1 },
        ], { duration: DROP_MS }));
      });
      at(t0 + 90 + Math.round(DROP_MS * 0.76), () => {
        // 착지 — 흙이 튄다. 소리는 두 칸에 하나(촘촘하면 시끄럽다), 나머지는 진동만
        feel('tap', i % 2 ? { sound: false } : undefined);
        burst(fieldRef.current, x, y - 4, { n: 6, dist: 24, size: 5, colors: SOIL_COLORS, dur: 480, up: 14 });
      });
      at(t0 + 440, () => {
        setCell(i, { ph: PH.COVERED });
        track(anim(holeRefs.current[i], [
          { transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.72,.6)', opacity: 1, offset: 0.55 }, { transform: 'scale(.45,.3)', opacity: 0 },
        ], { duration: 220, easing: 'ease-in' }));
        track(anim(moundRefs.current[i], [
          { transform: 'scale(1.3,.3)', opacity: 0 }, { transform: 'scale(1.16,.74)', opacity: 1, offset: 0.24 },
          { transform: 'scale(.95,1.16)', opacity: 1, offset: 0.58 }, { transform: 'scale(1.04,.92)', opacity: 1, offset: 0.82 },
          { transform: 'scale(1,1)', opacity: 1 },
        ], { duration: COVER_MS, easing: 'ease-out' }));
      });
      // 흙무덤이 가라앉고 심긴 씨앗 판으로
      at(t0 + PLANT_T.toCrop, () => setCell(i, { ph: PH.UP, idx: 0 }));
    });
    let t = PLANT_T.start + Math.max(0, plans.length - 1) * PLANT_T.gap + PLANT_T.toCrop + GROW_T.roundGap;

    // ② 자라기 — 새싹 → 이파리 → 당근 라운드. 라운드마다 그 단계까지 갈 칸만, 칸마다 시차.
    for (let stage = 1; stage < STAGE_CROPS.length; stage += 1) {
      const idxs = plans.map((p, i) => (p.grownAt >= stage ? i : -1)).filter((i) => i >= 0);
      if (!idxs.length) continue;
      idxs.forEach((ci, n) => {
        // 새싹 xpUp 은 짧아 칸마다 울려도 안 겹친다. evolve 는 길어 라운드 첫 칸만 소리, 나머지는 진동만.
        const fx = stage === 1 ? { cue: 'xpUp' } : (n === 0 ? { cue: 'evolve' } : TICK);
        at(t + n * GROW_T.each, () => evolveCell(ci, stage, fx));
      });
      t += (idxs.length - 1) * GROW_T.each + GROW_T.roundGap;
    }
    at(t - GROW_T.roundGap + GROW_T.done + EVOLVE_SWAP_MS, finish);
  };

  const runWilt = () => {
    fillCells((p) => ({ ph: PH.UP, idx: p.grownAt }));
    setDay('오늘');
    const rounds = wiltRounds();
    let end = WILT_T.first;
    for (let r = 1; r <= rounds; r += 1) {
      const t = WILT_T.first + (r - 1) * WILT_T.step;
      at(t, () => setDay(DAY_LABELS[r - 1] || DAY_LABELS[DAY_LABELS.length - 1]));
      const idxs = plans.map((p, i) => (p.path.length - 1 - p.grownAt >= r ? i : -1)).filter((i) => i >= 0);
      // 시듦 소리는 길고 낮아 겹치면 뭉개진다 — 라운드 첫 칸만 소리+묵직한 진동, 나머지는 진동만
      idxs.forEach((ci, n) => at(t + n * WILT_T.each, () => wiltCell(ci, plans[ci].grownAt + r, n === 0 ? { cue: 'wilt' } : TICK)));
      end = t + Math.max(0, idxs.length - 1) * WILT_T.each + WILT_SWAP_MS;
    }
    at(end + WILT_T.done, finish);
  };

  // 같은 밭 그대로, 이름표만 차례로
  const runLabelsScene = () => {
    setDay(null);
    fillCells((p) => ({ ph: PH.UP, idx: p.path.length - 1 }));
    runLabels(LABEL_T.first);
  };

  const wordsKey = words.map((w) => `${w.id}:${w.stage}:${w.health}`).join('|');
  useEffect(() => {
    sceneRef.current = scene;
    doneRef.current = false;
    stopAll();
    if (!words.length) return () => stopAll(); // 단어가 오면 다시 돈다(wordsKey)
    if (instant || reduced) {
      // 동작 줄이기 — 끝 모습을 바로 그리되 버튼이 너무 갑자기 켜지지 않게 아주 잠깐 둔다
      const t = setTimeout(() => settle(scene), instant ? 0 : 250);
      timers.current.push(t);
    } else if (scene === 'grow') runGrow();
    else if (scene === 'wilt') runWilt();
    else runLabelsScene();
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, runKey, wordsKey]);

  useEffect(() => {
    if (!reduced) {
      anim(fieldRef.current, [{ transform: 'translateY(24px) scale(.88)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: BACK_OUT });
    }
    return () => { stopAll(); clearFx(fieldRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 탭 — 지금 장면을 끝 모습으로
  const onTap = () => {
    primeSfx(); // 탭(user gesture) 안에서 소리를 깨워 둔다 — 다음 장면 소리가 나게
    vibrate({ duration: 5 });
    if (!doneRef.current && words.length) settle(sceneRef.current);
  };

  return (
    <div
      className='relative mx-auto shrink-0 max-[380px]:-my-[12px] max-[380px]:scale-90'
      style={{ width: FIELD_W, height: FIELD_H }}
    >
      {/* 날짜 칩 — 시듦 장면에서만. 밭 위 가운데 */}
      <div
        aria-live='polite'
        className={`
          pointer-events-none absolute left-1/2 top-[-6px] z-[60] -translate-x-1/2
          rounded-full border border-border dark:border-border-dark bg-layout-white dark:bg-layout-black
          px-[12px] py-[4px] text-[14px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white
          transition-opacity duration-300 motion-reduce:transition-none ${day ? 'opacity-100' : 'opacity-0'}
        `}
      >
        {day ?? ''}
      </div>
      <div
        ref={fieldRef}
        role='button'
        tabIndex={0}
        aria-label='농장 밭'
        onClick={onTap}
        className='absolute inset-0 cursor-pointer select-none [-webkit-tap-highlight-color:transparent]'
      >
        <img src={fieldBase} alt='' draggable={false} className='absolute inset-0 h-full w-full select-none' />

        {words.map((w, i) => {
          const { x, y } = slotXY(i);
          const plan = plans[i];
          const cell = cells[i] || { ph: PH.NONE, idx: -1 };
          const up = cell.ph === PH.UP && cell.idx >= 0;
          const z = 12 + Math.round(y / 19);
          return (
            <React.Fragment key={w.id}>
              {/* 심는 자리 — PlantingScene 의 한 칸(구멍 · 낙하하는 씨앗 · 흙무덤) */}
              <div className='pointer-events-none absolute' style={{ width: SLOT, height: SLOT, left: x - GROUND_X, top: y - GROUND_Y, zIndex: z }}>
                <span
                  ref={(el) => { holeRefs.current[i] = el; }}
                  aria-hidden
                  className={`absolute ${cell.ph === PH.DUG || cell.ph === PH.SEEDED ? 'opacity-100' : 'opacity-0'}`}
                  style={{ left: GROUND_X - HOLE_W / 2, top: GROUND_Y - HOLE_H / 2 }}
                >
                  <SoilHole />
                </span>
                <span aria-hidden className='absolute inset-0' style={{ clipPath: SEED_CLIP }}>
                  <img
                    ref={(el) => { seedRefs.current[i] = el; }}
                    src={SEED_SRC}
                    alt=''
                    draggable={false}
                    className={`absolute max-w-none select-none ${cell.ph === PH.SEEDED ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                      width: SEED_BOX, height: SEED_BOX,
                      left: GROUND_X - SEED_BOX / 2, top: GROUND_Y - SEED_BOX * CROP_BASELINE,
                      transform: `translateY(${SEED_SINK}px)`, transformOrigin: `50% ${CROP_BASELINE * 100}%`,
                    }}
                  />
                </span>
                {/* 흙무덤 — 작물(심긴 씨앗 판)이 나오면 낮게 가라앉으며 사라진다 */}
                <span
                  aria-hidden
                  className={`absolute transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${up ? 'scale-x-110 scale-y-50 opacity-0' : ''}`}
                  style={{ left: GROUND_X - MOUND_GROUND_X, top: GROUND_Y - MOUND_GROUND_Y, transformOrigin: `50% ${((MOUND_GROUND_Y + 2) / MOUND_H) * 100}%` }}
                >
                  <span ref={(el) => { moundRefs.current[i] = el; }} className={`block ${cell.ph === PH.COVERED || up ? 'opacity-100' : 'opacity-0'}`}>
                    <SoilMound />
                  </span>
                </span>
              </div>

              {/* 진화 후광 — 작물 뒤에서 번쩍 차오르고 퍼지며 사라진다(평소 opacity 0) */}
              <span
                ref={(el) => { glowRefs.current[i] = el; }}
                aria-hidden
                data-keep='1'
                className='pointer-events-none absolute rounded-full opacity-0 bg-[radial-gradient(circle,rgba(255,246,196,0.95)_0%,rgba(255,226,120,0.55)_38%,rgba(255,226,120,0)_70%)]'
                style={{ width: 110, height: 110, left: x - 55, top: y - CROP_BOX * 0.42 - 55, zIndex: z }}
              />

              {/* 작물 — 지나갈 그림을 겹쳐 두고 opacity 로만 바꾼다 */}
              <div
                ref={(el) => { cropRefs.current[i] = el; }}
                onClick={onTapCrop(i)}
                className={`absolute origin-[50%_86%] ${up ? 'cursor-pointer' : 'pointer-events-none'}`}
                style={{ width: CROP_BOX, height: CROP_BOX, left: x - CROP_BOX / 2, top: y - CROP_BOX * CROP_BASELINE, zIndex: z }}
              >
                <div ref={(el) => { imgWrapRefs.current[i] = el; }} className='pointer-events-none absolute inset-0'>
                  {plan.path.map(([c, v], k) => (
                    <img
                      key={`${c}-${v}`}
                      src={cropAssetByVariant(c, v)}
                      alt={k === plan.path.length - 1 ? w.origin : ''}
                      draggable={false}
                      className={`absolute inset-0 h-full w-full select-none object-contain ${IMG_FADE} ${up && cell.idx === k ? 'opacity-100' : 'opacity-0'}`}
                    />
                  ))}
                </div>
                {/* 퇴화 그늘 — 작물 위로 어두운 먹구름이 잠깐 끼었다 걷힌다(평소 opacity 0) */}
                <span
                  ref={(el) => { gloomRefs.current[i] = el; }}
                  aria-hidden
                  data-keep='1'
                  className='pointer-events-none absolute inset-0 opacity-0'
                >
                  <span className='absolute inset-0 rounded-full bg-[radial-gradient(ellipse_at_50%_55%,rgba(28,22,36,0.42)_0%,rgba(28,22,36,0.18)_45%,rgba(28,22,36,0)_70%)]' />
                  <span className='absolute left-[18%] top-[2%] h-[26%] w-[64%] rounded-full bg-[radial-gradient(ellipse_at_50%_50%,rgba(58,52,68,0.75)_0%,rgba(58,52,68,0.4)_50%,rgba(58,52,68,0)_72%)]' />
                </span>
                <span ref={(el) => { labelRefs.current[i] = el; }} className={`${WORD_LABEL_CLASS} bottom-[78%]`}>
                  {w.origin}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default FarmStoryStage;
