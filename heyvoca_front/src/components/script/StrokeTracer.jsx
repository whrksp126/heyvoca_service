// src/components/script/StrokeTracer.jsx
//
// 따라 쓰기(획순 트레이싱) — 글자 밭 학습 세션의 네 번째 단계.
// 1) 획순 애니메이션으로 한 번 보여준 뒤 2) 흐린 글자 윤곽 위에 손가락으로 한 획씩 따라
// 그리게 하고 3) 획 단위로 "대략적 판정"(참조 획 위의 표본점이 사용자가 그은 궤적과 충분히
// 가까운 비율)을 해서, 통과한 획만 분홍(primary-main-600)으로 채워 확정하고 다음 획으로
// 넘어간다(2026-09-29 — 예전엔 전체를 다 그은 뒤 한 번에 판정했다). 모든 획을 통과하면
// 글자 전체가 분홍으로 채워진 상태로 결과를 보여준다. 채점 결과는 서버로 보내지 않는다
// (참고용 연습).
//
// compound(요음, 예: きゃ)는 두 글자를 겹치지 않게 배치만 해서 애니메이션으로 보여주고
// 인터랙티브 트레이싱은 생략한다(단일 글자 좌표계가 아니라 정밀 판정이 의미 없다) —
// "다음" 버튼은 항상 눌러서 넘어갈 수 있다.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowClockwise, Check } from '@phosphor-icons/react';
import { haptic } from '../../lib/feel';

const GUIDE_COLOR = '#B9B2A6';
const GUIDE_OPACITY = 0.3;
const ACTIVE_GUIDE_OPACITY = 0.55;
const DRAW_DURATION = 0.5;
const DRAW_GAP = 0.18;
const PASS_RATIO = 0.5;

const pointsToPathD = (points) => {
  if (!points || points.length === 0) return '';
  return points.reduce((acc, p, i) => acc + (i === 0 ? `M${p.x},${p.y}` : ` L${p.x},${p.y}`), '');
};

/** 뷰포트 좌표 → 이 svg의 viewBox 좌표로 변환. */
const toSvgPoint = (svgEl, clientX, clientY) => {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
};

// 하단 고정 버튼 한 쌍(지우기/확인 · 다시 쓰기/다음) — 서비스 공용 2버튼 규격
// (h-52 rounded-12, 취소=아웃라인/확인=분홍 채움). LearningLangNewBottomSheet 취소/확인과 같다.
const ActionRow = ({ leftLabel, onLeft, rightLabel, onRight, rightDisabled = false }) => (
  <div className="flex items-center gap-[12px] w-full">
    <motion.button
      type="button"
      onClick={onLeft}
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
      <ArrowClockwise size={16} weight="bold" />
      {leftLabel}
    </motion.button>
    <motion.button
      type="button"
      onClick={onRight}
      disabled={rightDisabled}
      className={`
        flex-1 h-[52px] rounded-[12px]
        text-[15px] font-[700] tracking-[-0.03em]
        ${rightDisabled
          ? 'bg-layout-gray-200 dark:bg-[#2A2A2A] text-layout-gray-400 dark:text-layout-gray-300'
          : 'bg-primary-main-600 text-layout-white'}
      `}
      whileTap={rightDisabled ? undefined : { scale: 0.97 }}
    >
      {rightLabel}
    </motion.button>
  </div>
);

const StrokeTracer = ({ entries, compound = false, onDone }) => {
  "use memo";

  const primary = entries?.[0];
  const viewBox = primary?.viewBox || '0 0 109 109';
  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);

  const [phase, setPhase] = useState('demo'); // 'demo' | 'trace' | 'result'
  const [activeStrokeIndex, setActiveStrokeIndex] = useState(0);
  const [currentPoints, setCurrentPoints] = useState([]); // 지금 그리고 있는 획 하나
  const [drawing, setDrawing] = useState(false);
  const [retryHint, setRetryHint] = useState(false);

  const svgRef = useRef(null);
  const guidePathRefs = useRef([]);
  guidePathRefs.current = [];

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
    setRetryHint(false);
    const t = setTimeout(() => setPhase(compound ? 'compoundDone' : 'trace'), demoTotalMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const handlePointerDown = (e) => {
    if (phase !== 'trace' || !svgRef.current) return;
    e.preventDefault();
    const p = toSvgPoint(svgRef.current, e.clientX, e.clientY);
    setDrawing(true);
    setCurrentPoints([p]);
  };

  const handlePointerMove = (e) => {
    if (!drawing || phase !== 'trace' || !svgRef.current) return;
    const p = toSvgPoint(svgRef.current, e.clientX, e.clientY);
    setCurrentPoints((prev) => [...prev, p]);
  };

  const handlePointerUp = () => setDrawing(false);

  const clearAttempt = () => {
    haptic('light');
    setCurrentPoints([]);
  };

  // 지금 그은 획(activeStrokeIndex)만 판정 — 통과하면 그 획을 분홍으로 확정하고 다음 획으로,
  // 실패하면 궤적만 지우고 같은 획을 다시 그리게 한다.
  const confirmStroke = () => {
    const guideEl = guidePathRefs.current[activeStrokeIndex];
    if (!guideEl || currentPoints.length === 0) {
      haptic('light');
      return;
    }
    const len = guideEl.getTotalLength();
    const SAMPLES = 14;
    const checkpoints = [];
    for (let i = 0; i <= SAMPLES; i++) {
      checkpoints.push(guideEl.getPointAtLength((len * i) / SAMPLES));
    }
    const tolerance = Math.max(vbW, vbH) * 0.13;
    let covered = 0;
    for (const cp of checkpoints) {
      const near = currentPoints.some((up) => {
        const dx = up.x - cp.x;
        const dy = up.y - cp.y;
        return Math.sqrt(dx * dx + dy * dy) <= tolerance;
      });
      if (near) covered += 1;
    }
    const ratio = checkpoints.length > 0 ? covered / checkpoints.length : 0;
    const passed = ratio >= PASS_RATIO;

    if (passed) {
      haptic('success');
      setCurrentPoints([]);
      if (activeStrokeIndex + 1 >= strokes.length) {
        setPhase('result');
      } else {
        setActiveStrokeIndex((i) => i + 1);
      }
    } else {
      haptic('light');
      setCurrentPoints([]);
      setRetryHint(true);
      setTimeout(() => setRetryHint(false), 900);
    }
  };

  const restartAll = () => {
    haptic('light');
    setPhase('trace');
    setActiveStrokeIndex(0);
    setCurrentPoints([]);
  };

  return (
    <div className="flex flex-col gap-[14px] w-full h-full">
      <div className="flex flex-1 min-h-0 items-center justify-center">
        <div
          className="
            relative w-full max-w-[340px] aspect-square rounded-[16px]
            bg-layout-gray-50 dark:bg-layout-gray-dark
            overflow-hidden touch-none select-none
          "
        >
          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="absolute inset-0 w-full h-full"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
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
          </svg>

          {phase === 'demo' && (
            <span className="absolute bottom-[10px] left-0 right-0 text-center text-[12px] font-[600] text-layout-gray-300">
              획순을 잘 보세요
            </span>
          )}
          {phase === 'trace' && (
            <span className="absolute bottom-[10px] left-0 right-0 text-center text-[12px] font-[600] text-layout-gray-400">
              {retryHint ? '다시 그어보세요' : `${activeStrokeIndex + 1}/${strokes.length}획째`}
            </span>
          )}
        </div>
      </div>

      {phase === 'trace' && (
        <ActionRow
          leftLabel="지우기"
          onLeft={clearAttempt}
          rightLabel="확인"
          onRight={confirmStroke}
          rightDisabled={currentPoints.length === 0}
        />
      )}

      {phase === 'result' && (
        <div className="flex flex-col gap-[12px] flex-shrink-0">
          <div className="flex items-center justify-center gap-[6px] text-[15px] font-[700] text-status-success-600">
            <Check size={17} weight="bold" />
            잘 썼어요
          </div>
          <ActionRow
            leftLabel="다시 쓰기"
            onLeft={restartAll}
            rightLabel="다음"
            onRight={() => { haptic('light'); onDone?.(); }}
          />
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
