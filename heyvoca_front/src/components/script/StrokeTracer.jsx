// src/components/script/StrokeTracer.jsx
//
// 따라 쓰기(획순 트레이싱) — 글자 밭 학습 세션의 네 번째 단계.
// 1) 획순 애니메이션으로 한 번 보여준 뒤 2) 흐린 글자 윤곽 위에 손가락으로 한 획씩 따라
// 그리게 하고 3) 손가락을 뗀 순간(pointerup) 자동으로 판정한다 — "확인" 버튼은 없다
// (2026-09-29: 예전엔 획마다 확인 버튼을 눌러야 판정했는데, 실기기에서 사용자가 그걸 모른 채
// 손을 떼고 다음 획으로 넘어가 버려 currentPoints가 판정도 소거도 안 된 상태로 다음
// pointerdown에 덮어써졌다 — 밑바탕 가이드가 "전혀 반응하지 않는" 것처럼 보인 진짜 원인이다.
// 게다가 마지막 미완성 궤적이 지워지지 않아 캔버스 경계 밖까지 그려진 점으로 남기도 했다).
// 통과한 획만 분홍(primary-main-600)으로 채워 확정하고 다음 획으로 넘어가며, 실패하면
// 궤적을 살짝 흔들어 지우고 같은 획을 다시 그리게 한다. 모든 획을 통과하면 글자 전체가
// 분홍으로 채워진 상태로 결과를 보여준다. 채점 결과는 서버로 보내지 않는다(참고용 연습).
//
// compound(요음, 예: きゃ)는 두 글자를 겹치지 않게 배치만 해서 애니메이션으로 보여주고
// 인터랙티브 트레이싱은 생략한다(단일 글자 좌표계가 아니라 정밀 판정이 의미 없다) —
// "다음" 버튼은 항상 눌러서 넘어갈 수 있다.
//
// 【2026-09-29 QA 4차 — 듀오링고 방식 가이드 + 연속 획 허용】
//   · 아직 안 그은 현재 획은 번호 대신 분홍 점선(화살촉 포함)으로 경로를 미리 보여주고,
//     시작점은 숫자 배지 대신 화살표(→) 배지로 바꿨다. 배경에는 아주 옅은 가로·세로
//     십자 가이드를 깔아 중심을 잡기 쉽게 한다.
//   · 필체에 따라 한 번의 손가락 제스처로 이어지는 획(예: B의 2·3획 곡선)을 그리면,
//     그 궤적 하나로 몇 번째 획까지 커버리지 기준을 통과하는지 앞으로 계속 확인해
//     통과하는 데까지 한꺼번에 분홍으로 확정한다(finalizeStroke 참고). 반대로 한 획을
//     두 번에 나눠 그으면(첫 조각이 기준 미달) 기존처럼 다시 긋게 한다 — 판정 기준
//     자체(PASS_RATIO/TOLERANCE_RATIO)는 그대로다.
//   · 알파벳은 대문자·소문자를 별도 스텝으로 받는다(caseVariant). 소문자일 때는 caseVariant
//     배지와 함께, 4선 중 가운데 2선(민줄·엑스하이트)에 해당하는 옅은 기준선을 깐다.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { haptic } from '../../lib/feel';
import { playSuccessSound } from '../../utils/audio';
import ResultMark from '../common/ResultMark';

const GUIDE_COLOR = '#B9B2A6';
const GUIDE_OPACITY = 0.3;
const ACTIVE_GUIDE_OPACITY = 0.85;
const CROSSHAIR_OPACITY = 0.16;
const BASELINE_OPACITY = 0.18;
// 소문자 기준선 위치 — viewBox 높이 대비 비율(strokes/alphabet.json 소문자 글자가 대략
// 이 범위 안에서 그려진다: 엑스하이트 ≈ 0.478, 베이스라인 ≈ 0.826).
const LOWER_MEAN_LINE_RATIO = 0.478;
const LOWER_BASE_LINE_RATIO = 0.826;
const DRAW_DURATION = 0.5;
const DRAW_GAP = 0.18;
// 판정 기준 — "너무 엄격하지 않게": 표본점의 45%만 궤적 근처를 지나가면 통과.
const PASS_RATIO = 0.45;
const TOLERANCE_RATIO = 0.16; // viewBox 최대 변 길이 대비 허용 반경
const SAMPLE_COUNT = 16;

const pointsToPathD = (points) => {
  if (!points || points.length === 0) return '';
  return points.reduce((acc, p, i) => acc + (i === 0 ? `M${p.x},${p.y}` : ` L${p.x},${p.y}`), '');
};

/** 뷰포트 좌표(clientX/clientY) → 이 svg의 viewBox 좌표로 변환. */
const toSvgPoint = (svgEl, clientX, clientY) => {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
};

/** viewBox 밖으로 튀는 좌표를 잘라낸다 — 캔버스 바깥에 점이 남는 현상 방지. */
const clampPoint = (p, vbW, vbH) => ({
  x: Math.min(Math.max(p.x, 0), vbW),
  y: Math.min(Math.max(p.y, 0), vbH),
});

/** 사용자가 그은 점들이 가이드 획(guideEl) 위의 표본점을 얼마나 덮었는지 채점한다.
 *  실기기 손가락 드로잉의 오차를 감안해 tolerance/PASS_RATIO를 넉넉히 잡는다. */
const evaluateStroke = (guideEl, points, vbW, vbH) => {
  if (!guideEl || !points || points.length < 2) return { passed: false, ratio: 0 };
  const len = guideEl.getTotalLength();
  if (!len) return { passed: false, ratio: 0 };
  const tolerance = Math.max(vbW, vbH) * TOLERANCE_RATIO;
  let covered = 0;
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const cp = guideEl.getPointAtLength((len * i) / SAMPLE_COUNT);
    const near = points.some((p) => Math.hypot(p.x - cp.x, p.y - cp.y) <= tolerance);
    if (near) covered += 1;
  }
  const ratio = covered / (SAMPLE_COUNT + 1);
  return { passed: ratio >= PASS_RATIO, ratio };
};

const StrokeTracer = ({ entries, compound = false, caseVariant = null, replayKey, onDone }) => {
  "use memo";

  const primary = entries?.[0];
  const viewBox = primary?.viewBox || '0 0 109 109';
  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);
  // 화살촉 마커 id — 이 컴포넌트 인스턴스마다 고유해야 한다(같은 페이지에 다른 인스턴스가
  // 남아 있을 때 id 충돌로 화살표가 안 그려지는 걸 방지).
  const arrowMarkerId = useMemo(() => `stroke-arrow-${Math.random().toString(36).slice(2)}`, []);

  const [phase, setPhase] = useState('demo'); // 'demo' | 'trace' | 'result' | 'compoundDone'
  const [activeStrokeIndex, setActiveStrokeIndex] = useState(0);
  const [currentPoints, setCurrentPoints] = useState([]); // 지금 그리고 있는 획 하나(렌더용)
  const [retryHint, setRetryHint] = useState(false);
  const [startPoint, setStartPoint] = useState(null); // 다음에 그을 획의 시작점(svg 좌표)
  // "다음"을 눌러 세션이 이 스텝을 떠나기 시작했음을 표시 — ChoiceCard와 같은 이유로
  // ResultMark가 퇴장 애니메이션 도중 다시 뜨는 걸 막는다(handleNext 참고).
  const [advancing, setAdvancing] = useState(false);

  const svgRef = useRef(null);
  const guidePathRefs = useRef([]);
  guidePathRefs.current = [];

  const pointsRef = useRef([]); // pointerup 시점에 최신 값을 동기적으로 읽기 위한 ref(state는 비동기)
  const activePointerIdRef = useRef(null);
  const shakeControls = useAnimationControls();

  const strokes = compound ? [] : (primary?.strokes || []);
  const totalStrokeCount = compound
    ? (entries || []).reduce((sum, e) => sum + (e?.strokes?.length || 0), 0)
    : strokes.length;
  const demoTotalMs = useMemo(
    () => totalStrokeCount * (DRAW_DURATION + DRAW_GAP) * 1000 + 250,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries]
  );

  useEffect(() => {
    setPhase('demo');
    setActiveStrokeIndex(0);
    setCurrentPoints([]);
    pointsRef.current = [];
    activePointerIdRef.current = null;
    setRetryHint(false);
    setAdvancing(false);
    const t = setTimeout(() => setPhase(compound ? 'compoundDone' : 'trace'), demoTotalMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // 다음에 그을 획의 시작점 — ref는 커밋 이후에 채워지므로 effect에서 읽는다.
  useEffect(() => {
    if (phase !== 'trace') {
      setStartPoint(null);
      return;
    }
    const el = guidePathRefs.current[activeStrokeIndex];
    if (!el) {
      setStartPoint(null);
      return;
    }
    try {
      setStartPoint(el.getPointAtLength(0));
    } catch {
      setStartPoint(null);
    }
  }, [phase, activeStrokeIndex, strokes.length]);

  // 좌표계 self-check(2026-09-29 무반응 버그 재발 방지, dev 전용) — ① 가이드 path 자신의
  // 표본점을 그대로 궤적으로 흘려 넣으면 evaluateStroke가 통과시키는지 ② 화면좌표→svg좌표
  // 왕복 변환(toSvgPoint ↔ getScreenCTM)이 어긋나지 않는지를 실제 마운트된 DOM으로 확인한다.
  useEffect(() => {
    if (!import.meta.env?.DEV || compound || phase !== 'trace') return;
    const svgEl = svgRef.current;
    const guideEl = guidePathRefs.current[activeStrokeIndex];
    if (!svgEl || !guideEl) return;
    const len = guideEl.getTotalLength();
    if (!len) return;

    const guideSamplePoints = Array.from({ length: 9 }, (_, i) => guideEl.getPointAtLength((len * i) / 8));
    const { passed, ratio } = evaluateStroke(guideEl, guideSamplePoints, vbW, vbH);
    if (!passed) {
      // eslint-disable-next-line no-console
      console.warn('[StrokeTracer] self-check 실패: 가이드 표본점 자체가 판정을 통과하지 못함', { activeStrokeIndex, ratio });
    }

    const ctm = svgEl.getScreenCTM();
    if (ctm) {
      const mid = guideEl.getPointAtLength(len / 2);
      const svgPt = svgEl.createSVGPoint();
      svgPt.x = mid.x;
      svgPt.y = mid.y;
      const screenPt = svgPt.matrixTransform(ctm);
      const roundTrip = toSvgPoint(svgEl, screenPt.x, screenPt.y);
      const drift = Math.hypot(roundTrip.x - mid.x, roundTrip.y - mid.y);
      if (drift > 0.5) {
        // eslint-disable-next-line no-console
        console.warn('[StrokeTracer] self-check 실패: 화면↔SVG 좌표 왕복 변환 오차', { drift, mid, roundTrip });
      }
    }
  }, [phase, activeStrokeIndex, compound, vbW, vbH]);

  const triggerShakeHint = () => {
    setRetryHint(true);
    shakeControls.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.4 } });
    setTimeout(() => setRetryHint(false), 900);
  };

  // 방금 뗀 획(들)을 판정 — 통과하면 그 획을 분홍으로 확정하고 다음 획으로, 실패하면 궤적만
  // 지우고 같은 획을 다시 그리게 한다. pointerup에서 항상 호출되어 currentPoints를 비운다
  // (예전 버그: pointerup에서 아무것도 안 지워서 미완성 궤적이 화면에 남았다).
  //
  // 연속 획 허용(2026-09-29 QA 4차) — 방금 그은 궤적 하나로 지금 획부터 시작해 몇 번째
  // 획까지 커버리지 기준(evaluateStroke)을 통과하는지 앞으로 계속 확인한다. 필체상 두 획을
  // 한 번에 이어 그은 경우 같은 궤적이 다음 획의 표본점도 자연스레 덮으므로, 통과하는 데까지
  // 한꺼번에 다음 획으로 넘긴다. 반대로 한 획을 두 번에 나눠 그은 경우는 첫 조각 자체가
  // 지금 획 하나도 통과 못 해 consumedCount가 0인 기존 재시도 분기 그대로다.
  const finalizeStroke = () => {
    const points = pointsRef.current;
    pointsRef.current = [];
    setCurrentPoints([]);

    if (phase !== 'trace' || points.length < 2) return; // 실수로 살짝 스친 탭은 무시

    let consumedCount = 0;
    for (let i = activeStrokeIndex; i < strokes.length; i++) {
      const guideEl = guidePathRefs.current[i];
      const { passed } = evaluateStroke(guideEl, points, vbW, vbH);
      if (!passed) break;
      consumedCount += 1;
    }

    if (consumedCount > 0) {
      haptic('success');
      const nextIndex = activeStrokeIndex + consumedCount;
      if (nextIndex >= strokes.length) {
        playSuccessSound(); // 글자를 다 썼을 때 — 학습하기 정답과 같은 효과음
        setPhase('result');
      } else {
        setActiveStrokeIndex(nextIndex);
      }
    } else {
      haptic('light');
      triggerShakeHint();
    }
  };

  const handlePointerDown = (e) => {
    if (phase !== 'trace' || !svgRef.current) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // 일부 브라우저는 pointer capture 미지원 — 무시하고 진행
    }
    activePointerIdRef.current = e.pointerId;
    const p = clampPoint(toSvgPoint(svgRef.current, e.clientX, e.clientY), vbW, vbH);
    pointsRef.current = [p];
    setCurrentPoints([p]);
  };

  const handlePointerMove = (e) => {
    if (activePointerIdRef.current !== e.pointerId || phase !== 'trace' || !svgRef.current) return;
    const p = clampPoint(toSvgPoint(svgRef.current, e.clientX, e.clientY), vbW, vbH);
    pointsRef.current = [...pointsRef.current, p];
    setCurrentPoints(pointsRef.current);
  };

  const handlePointerUp = (e) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    activePointerIdRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
    finalizeStroke();
  };

  // 처음부터 다시 — 지금 획만이 아니라 전체 시도를 리셋한다.
  const resetAll = () => {
    haptic('light');
    activePointerIdRef.current = null;
    pointsRef.current = [];
    setCurrentPoints([]);
    setActiveStrokeIndex(0);
    setRetryHint(false);
    setPhase('trace');
  };

  const handleNext = () => {
    if (phase !== 'result') return;
    haptic('light');
    // ResultMark 계산을 먼저 꺼서(별도 렌더 커밋) 세션이 다음 스텝으로 넘어가며 이 카드를
    // 퇴장시킬 때 "마지막 props"가 이미 결과 없음 상태이게 한다 — ChoiceCard의 O/X 깜빡임
    // 버그와 같은 원인(퇴장 애니메이션 중 리렌더/리마운트)에 대한 방어.
    setAdvancing(true);
    requestAnimationFrame(() => onDone?.());
  };

  const startMarkerR = vbW * 0.032;

  return (
    <div className="flex flex-col gap-[14px] w-full h-full">
      <div className="flex flex-1 min-h-0 items-center justify-center">
        <motion.div
          animate={shakeControls}
          className="
            relative w-full max-w-[340px] aspect-square rounded-[16px]
            bg-layout-gray-50 dark:bg-layout-gray-dark
            overflow-hidden touch-none select-none
          "
        >
          {/* 획순 미리보기 썸네일 — 캔버스 좌상단. 전체 글자 가이드 위에 지금 획만 강조해
              보여준다(진행 중인 획을 잊었을 때 다시 훑어볼 참고용, 큰 데모 애니메이션과는 별개). */}
          {!compound && (phase === 'trace' || phase === 'result') && strokes.length > 0 && (
            <div
              aria-hidden
              className="
                absolute top-[8px] left-[8px] z-[1]
                w-[42px] h-[42px] p-[5px] rounded-[8px]
                bg-layout-white/90 dark:bg-layout-black/80
                border border-border dark:border-border-dark
                pointer-events-none
              "
            >
              <svg viewBox={viewBox} className="w-full h-full">
                {strokes.map((d, i) => {
                  const done = phase === 'result' || i < activeStrokeIndex;
                  const isActive = phase === 'trace' && i === activeStrokeIndex;
                  return (
                    <path
                      key={`thumb-${i}`}
                      d={d}
                      fill="none"
                      stroke={done || isActive ? 'var(--primary-main-600)' : GUIDE_COLOR}
                      strokeWidth={vbW * (isActive ? 0.09 : 0.07)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={done ? 0.55 : (isActive ? 1 : 0.4)}
                    />
                  );
                })}
              </svg>
            </div>
          )}

          {/* 대문자/소문자 구분 배지 — 썸네일 반대쪽(우상단). 알파벳 따라 쓰기에서만 뜬다
              (2026-09-29 QA 4차 — 대/소문자가 이제 서로 다른 스텝이라 지금 뭘 쓰는지 보여준다). */}
          {caseVariant && (
            <div
              aria-hidden
              className="
                absolute top-[8px] right-[8px] z-[1]
                h-[22px] px-[9px] rounded-full
                flex items-center
                bg-layout-white/90 dark:bg-layout-black/80
                border border-border dark:border-border-dark
                pointer-events-none
              "
            >
              <span className="text-[11px] font-[700] text-layout-gray-400 dark:text-layout-gray-100">
                {caseVariant === 'lower' ? '소문자' : '대문자'}
              </span>
            </div>
          )}

          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="absolute inset-0 w-full h-full"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <defs>
              {/* 현재 획 가이드 끝에 붙는 화살촉 — 경로 진행 방향으로 자동 정렬된다. */}
              <marker
                id={arrowMarkerId}
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" fill="var(--primary-main-600)" />
              </marker>
            </defs>

            {/* 배경 십자 가이드 — 아주 옅게, 중심 잡기용. 판정과는 무관(장식). */}
            <g aria-hidden pointerEvents="none" opacity={CROSSHAIR_OPACITY}>
              <line x1={vbW / 2} y1={0} x2={vbW / 2} y2={vbH} stroke={GUIDE_COLOR} strokeWidth={vbW * 0.006} strokeDasharray={`${vbW * 0.014} ${vbW * 0.02}`} />
              <line x1={0} y1={vbH / 2} x2={vbW} y2={vbH / 2} stroke={GUIDE_COLOR} strokeWidth={vbW * 0.006} strokeDasharray={`${vbW * 0.014} ${vbW * 0.02}`} />
            </g>

            {/* 소문자 기준선(민줄·엑스하이트) — 알파벳 소문자일 때만, 아주 옅게. */}
            {caseVariant === 'lower' && (
              <g aria-hidden pointerEvents="none" opacity={BASELINE_OPACITY}>
                <line x1={0} y1={vbH * LOWER_MEAN_LINE_RATIO} x2={vbW} y2={vbH * LOWER_MEAN_LINE_RATIO} stroke={GUIDE_COLOR} strokeWidth={vbW * 0.006} />
                <line x1={0} y1={vbH * LOWER_BASE_LINE_RATIO} x2={vbW} y2={vbH * LOWER_BASE_LINE_RATIO} stroke={GUIDE_COLOR} strokeWidth={vbW * 0.006} />
              </g>
            )}

            {/* 윤곽 — 트레이싱 판정에도 쓰는 기준 path라 ref를 그대로 남긴다.
                통과한 획(index < activeStrokeIndex)은 분홍으로 확정 표시. 아직 안 그은
                현재 획(isActiveTarget)은 듀오링고 방식 점선 화살표로 경로를 미리 보여준다. */}
            {!compound && strokes.map((d, i) => {
              const done = phase === 'result' || i < activeStrokeIndex;
              const isActiveTarget = phase === 'trace' && i === activeStrokeIndex;
              return (
                <path
                  key={`guide-${i}`}
                  ref={(el) => { guidePathRefs.current[i] = el; }}
                  d={d}
                  fill="none"
                  stroke={done || isActiveTarget ? 'var(--primary-main-600)' : GUIDE_COLOR}
                  strokeWidth={vbW * (done ? 0.05 : 0.045)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={isActiveTarget ? `${vbW * 0.018} ${vbW * 0.032}` : undefined}
                  markerEnd={isActiveTarget ? `url(#${arrowMarkerId})` : undefined}
                  opacity={done ? 1 : (isActiveTarget ? ACTIVE_GUIDE_OPACITY : GUIDE_OPACITY)}
                />
              );
            })}

            {/* 획순 애니메이션 — demo 단계에서만 재생 */}
            {!compound && phase === 'demo' && strokes.map((d, i) => (
              <motion.path
                key={`demo-${i}`}
                d={d}
                fill="none"
                className="stroke-primary-main-600"
                strokeWidth={vbW * 0.045}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 1 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: DRAW_DURATION, delay: i * (DRAW_DURATION + DRAW_GAP), ease: 'easeInOut' }}
              />
            ))}

            {/* 조합(요음) — 두 글자를 겹치지 않게 배치해 순서대로만 보여준다(인터랙션 없음) */}
            {compound && entries.map((entry, gi) => {
              const gTransform = gi === 0
                ? 'translate(-6,-4) scale(0.8)'
                : `translate(${vbW * 0.46},${vbH * 0.42}) scale(0.52)`;
              return (
                <g key={`compound-${gi}`} transform={gTransform}>
                  {entry.strokes.map((d, i) => (
                    <motion.path
                      key={`c-${gi}-${i}`}
                      d={d}
                      fill="none"
                      className="stroke-primary-main-600"
                      strokeWidth={vbW * 0.05}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{
                        duration: DRAW_DURATION,
                        delay: (gi * entry.strokes.length + i) * (DRAW_DURATION + DRAW_GAP),
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </g>
              );
            })}

            {/* 지금 그리고 있는 획(판정 전) */}
            {phase === 'trace' && currentPoints.length > 0 && (
              <path
                d={pointsToPathD(currentPoints)}
                fill="none"
                className="stroke-primary-main-600"
                strokeWidth={vbW * 0.05}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* 다음에 그을 획의 시작점 — 듀오링고 방식 동그란 화살표 배지(숫자 대신 → 아이콘). */}
            {phase === 'trace' && startPoint && (
              <g pointerEvents="none">
                <circle cx={startPoint.x} cy={startPoint.y} r={startMarkerR} className="fill-primary-main-600" opacity={0.9} />
                <text
                  x={startPoint.x}
                  y={startPoint.y}
                  dy={startMarkerR * 0.35}
                  textAnchor="middle"
                  fontSize={startMarkerR * 1.4}
                  fontWeight="700"
                  fill="#fff"
                >
                  →
                </text>
              </g>
            )}
          </svg>

          {/* 채점 표현 — 다른 학습 문제 유형과 같은 공용 ResultMark(O)를 캔버스 중앙에
              잠깐 띄운다(2026-09-29: 고정 텍스트 '✓ 잘 썼어요' 대신). advancing이 true면
              이 스텝을 떠나는 중이라는 뜻이라 result를 null로 눌러 재생을 막는다
              (handleNext 주석 — ChoiceCard의 O/X 깜빡임 버그와 같은 방어). */}
          <ResultMark
            result={phase === 'result' && !advancing ? true : null}
            replayKey={replayKey}
            className="
              pointer-events-none absolute top-[50%] left-[50%] z-[2]
              translate-x-[-50%] translate-y-[-50%]
            "
          />

          {phase === 'demo' && (
            <span className="absolute bottom-[10px] left-0 right-0 text-center text-[12px] font-[600] text-layout-gray-300">
              획순을 잘 보세요
            </span>
          )}
          {phase === 'trace' && retryHint && (
            <motion.span
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-[10px] left-0 right-0 text-center text-[12px] font-[700] text-status-error-600"
            >
              다시 그어 보세요
            </motion.span>
          )}
        </motion.div>
      </div>

      {/* 획 칩 줄·팁 줄·"잘 썼어요" 문구는 제거했다(2026-09-29 실기기 QA) — 캔버스 안의
          번호 시작점 + 좌상단 획순 썸네일로 충분하고, 채점 표현은 위 ResultMark(O) 하나로
          다른 문제 유형과 통일한다. */}

      {(phase === 'trace' || phase === 'result') && (
        <div className="flex items-center gap-[12px] w-full flex-shrink-0">
          <motion.button
            type="button"
            onClick={resetAll}
            className="
              flex-1 h-[52px] rounded-[12px]
              flex items-center justify-center gap-[6px]
              border-[2px] border-border dark:border-border-dark
              bg-layout-white dark:bg-layout-black
              text-layout-gray-400 dark:text-layout-gray-100
              text-[15px] font-[700] tracking-[-0.03em]
            "
            whileTap={{ scale: 0.97 }}
          >
            처음부터
          </motion.button>
          <motion.button
            type="button"
            onClick={handleNext}
            disabled={phase !== 'result'}
            className={`
              flex-1 h-[52px] rounded-[12px]
              text-[15px] font-[700] tracking-[-0.03em]
              ${phase !== 'result'
                ? 'bg-layout-gray-200 dark:bg-[#2A2A2A] text-layout-gray-400 dark:text-layout-gray-300'
                : 'bg-primary-main-600 text-layout-white'}
            `}
            whileTap={phase === 'result' ? { scale: 0.97 } : undefined}
          >
            다음
          </motion.button>
        </div>
      )}

      {phase === 'compoundDone' && (
        <motion.button
          type="button"
          onClick={() => { haptic('light'); onDone?.(); }}
          className="flex-shrink-0 h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em] bg-primary-main-600 text-layout-white"
          whileTap={{ scale: 0.97 }}
        >
          다음
        </motion.button>
      )}
    </div>
  );
};

export default StrokeTracer;
