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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import { haptic } from '../../lib/feel';
import { playSuccessSound } from '../../utils/audio';

const GUIDE_COLOR = '#B9B2A6';
const GUIDE_OPACITY = 0.3;
const ACTIVE_GUIDE_OPACITY = 0.55;
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

const StrokeTracer = ({ entries, compound = false, onDone }) => {
  "use memo";

  const primary = entries?.[0];
  const viewBox = primary?.viewBox || '0 0 109 109';
  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);

  const [phase, setPhase] = useState('demo'); // 'demo' | 'trace' | 'result' | 'compoundDone'
  const [activeStrokeIndex, setActiveStrokeIndex] = useState(0);
  const [currentPoints, setCurrentPoints] = useState([]); // 지금 그리고 있는 획 하나(렌더용)
  const [retryHint, setRetryHint] = useState(false);
  const [startPoint, setStartPoint] = useState(null); // 다음에 그을 획의 시작점(svg 좌표)

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

  // 방금 뗀 획을 판정 — 통과하면 그 획을 분홍으로 확정하고 다음 획으로, 실패하면 궤적만
  // 지우고 같은 획을 다시 그리게 한다. pointerup에서 항상 호출되어 currentPoints를 비운다
  // (예전 버그: pointerup에서 아무것도 안 지워서 미완성 궤적이 화면에 남았다).
  const finalizeStroke = () => {
    const points = pointsRef.current;
    pointsRef.current = [];
    setCurrentPoints([]);

    if (phase !== 'trace' || points.length < 2) return; // 실수로 살짝 스친 탭은 무시

    const guideEl = guidePathRefs.current[activeStrokeIndex];
    const { passed } = evaluateStroke(guideEl, points, vbW, vbH);

    if (passed) {
      haptic('success');
      if (activeStrokeIndex + 1 >= strokes.length) {
        playSuccessSound(); // 글자를 다 썼을 때 — 학습하기 정답과 같은 효과음
        setPhase('result');
      } else {
        setActiveStrokeIndex((i) => i + 1);
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
    onDone?.();
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

          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="absolute inset-0 w-full h-full"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* 윤곽 — 트레이싱 판정에도 쓰는 기준 path라 ref를 그대로 남긴다.
                통과한 획(index < activeStrokeIndex)은 분홍으로 확정 표시. */}
            {!compound && strokes.map((d, i) => {
              const done = phase === 'result' || i < activeStrokeIndex;
              const isActiveTarget = phase === 'trace' && i === activeStrokeIndex;
              return (
                <path
                  key={`guide-${i}`}
                  ref={(el) => { guidePathRefs.current[i] = el; }}
                  d={d}
                  fill="none"
                  stroke={done ? 'var(--primary-main-600)' : GUIDE_COLOR}
                  strokeWidth={vbW * (done ? 0.05 : 0.045)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
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

            {/* 다음에 그을 획의 시작점 — 작은 점 + 번호 */}
            {phase === 'trace' && startPoint && (
              <g pointerEvents="none">
                <circle cx={startPoint.x} cy={startPoint.y} r={startMarkerR} className="fill-primary-main-600" opacity={0.9} />
                <text
                  x={startPoint.x}
                  y={startPoint.y}
                  dy={startMarkerR * 0.35}
                  textAnchor="middle"
                  fontSize={startMarkerR * 1.5}
                  fontWeight="700"
                  fill="#fff"
                >
                  {activeStrokeIndex + 1}
                </text>
              </g>
            )}
          </svg>

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

      {/* 획 칩 줄 — 완료(분홍)/지금 그리는 중(강조)/대기(회색) */}
      {!compound && (phase === 'trace' || phase === 'result') && strokes.length > 0 && (
        <div className="flex flex-wrap justify-center gap-[6px] flex-shrink-0">
          {strokes.map((_, i) => {
            const done = phase === 'result' || i < activeStrokeIndex;
            const current = phase === 'trace' && i === activeStrokeIndex;
            return (
              <span
                key={`chip-${i}`}
                className={`
                  flex items-center gap-[3px] px-[10px] py-[5px] rounded-full
                  text-[12px] font-[700]
                  ${done ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600' : ''}
                  ${current ? 'bg-primary-main-600 text-layout-white' : ''}
                  ${!done && !current ? 'bg-layout-gray-100 dark:bg-layout-gray-dark text-layout-gray-300' : ''}
                `}
              >
                {done && <Check size={11} weight="bold" />}
                {i + 1}획{current ? ' 긋는 중' : ''}
              </span>
            );
          })}
        </div>
      )}

      {/* 팁 한 줄 — 글자별 팁 데이터가 없어 일반 팁 하나로 충분히 대체한다 */}
      {!compound && phase === 'trace' && (
        <p className="text-center text-[12px] font-[600] text-layout-gray-400 flex-shrink-0">
          표시된 점에서 시작해요
        </p>
      )}

      {phase === 'result' && (
        <div className="flex items-center justify-center gap-[6px] flex-shrink-0 text-[15px] font-[700] text-status-success-600">
          <Check size={17} weight="bold" />
          잘 썼어요
        </div>
      )}

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
