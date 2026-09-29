// src/components/script/StrokeTracer.jsx
//
// 따라 쓰기(획순 트레이싱) — 글자 밭 학습 세션의 네 번째 단계.
// 1) 획순 애니메이션으로 한 번 보여준 뒤 2) 흐린 글자 윤곽 위에 손가락으로 따라 그리게 하고
// 3) "대략적 판정"(참조 획 위의 표본점이 사용자가 그은 궤적과 충분히 가까운 비율)으로
// 잘 썼는지만 느슨하게 알려준다 — 채점 결과는 서버로 보내지 않는다(참고용 연습).
//
// compound(요음, 예: きゃ)는 두 글자를 겹치지 않게 배치만 해서 애니메이션으로 보여주고
// 인터랙티브 트레이싱은 생략한다(단일 글자 좌표계가 아니라 정밀 판정이 의미 없다) —
// "다음" 버튼은 항상 눌러서 넘어갈 수 있다.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowClockwise, Check } from '@phosphor-icons/react';
import { haptic } from '../../lib/feel';

const STROKE_COLOR = '#B9B2A6';
const GUIDE_OPACITY = 0.32;
const DRAW_DURATION = 0.5;
const DRAW_GAP = 0.18;

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

const StrokeTracer = ({ entries, compound = false, onDone }) => {
  "use memo";

  const primary = entries?.[0];
  const viewBox = primary?.viewBox || '0 0 109 109';
  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);

  const [phase, setPhase] = useState('demo'); // 'demo' | 'trace' | 'result'
  const [userStrokes, setUserStrokes] = useState([]); // [[{x,y}, ...], ...]
  const [drawing, setDrawing] = useState(false);
  const [coverage, setCoverage] = useState(null);

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
    setUserStrokes([]);
    setCoverage(null);
    const t = setTimeout(() => setPhase(compound ? 'compoundDone' : 'trace'), demoTotalMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const handlePointerDown = (e) => {
    if (phase !== 'trace' || !svgRef.current) return;
    e.preventDefault();
    const p = toSvgPoint(svgRef.current, e.clientX, e.clientY);
    setDrawing(true);
    setUserStrokes((prev) => [...prev, [p]]);
  };

  const handlePointerMove = (e) => {
    if (!drawing || phase !== 'trace' || !svgRef.current) return;
    const p = toSvgPoint(svgRef.current, e.clientX, e.clientY);
    setUserStrokes((prev) => {
      const next = [...prev];
      next[next.length - 1] = [...next[next.length - 1], p];
      return next;
    });
  };

  const handlePointerUp = () => setDrawing(false);

  const clearTrace = () => {
    haptic('light');
    setUserStrokes([]);
    setCoverage(null);
  };

  const evaluate = () => {
    const guidePaths = guidePathRefs.current.filter(Boolean);
    const userPoints = userStrokes.flat();
    if (guidePaths.length === 0 || userPoints.length === 0) {
      setCoverage(0);
      setPhase('result');
      return;
    }
    const checkpoints = [];
    const SAMPLES_PER_STROKE = 14;
    guidePaths.forEach((el) => {
      const len = el.getTotalLength();
      for (let i = 0; i <= SAMPLES_PER_STROKE; i++) {
        checkpoints.push(el.getPointAtLength((len * i) / SAMPLES_PER_STROKE));
      }
    });
    const tolerance = Math.max(vbW, vbH) * 0.13;
    let covered = 0;
    for (const cp of checkpoints) {
      const near = userPoints.some((up) => {
        const dx = up.x - cp.x;
        const dy = up.y - cp.y;
        return Math.sqrt(dx * dx + dy * dy) <= tolerance;
      });
      if (near) covered += 1;
    }
    const ratio = checkpoints.length > 0 ? covered / checkpoints.length : 0;
    setCoverage(ratio);
    setPhase('result');
    haptic(ratio >= 0.5 ? 'success' : 'light');
  };

  const passed = coverage !== null && coverage >= 0.5;

  return (
    <div className="flex flex-col items-center gap-[14px] w-full">
      <div
        className="
          relative w-[220px] h-[220px] rounded-[16px]
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
          {/* 윤곽 — 트레이싱 판정에도 쓰는 기준 path라 ref를 그대로 남긴다 */}
          {!compound && strokes.map((d, i) => (
            <path
              key={`guide-${i}`}
              ref={(el) => { guidePathRefs.current[i] = el; }}
              d={d}
              fill="none"
              stroke={STROKE_COLOR}
              strokeWidth={vbW * 0.045}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={GUIDE_OPACITY}
            />
          ))}

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

          {/* 사용자가 그은 궤적 */}
          {phase === 'trace' && userStrokes.map((pts, i) => (
            <path
              key={`user-${i}`}
              d={pointsToPathD(pts)}
              fill="none"
              className="stroke-primary-main-600"
              strokeWidth={vbW * 0.05}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {phase === 'demo' && (
          <span className="absolute bottom-[8px] left-0 right-0 text-center text-[11px] font-[600] text-layout-gray-300">
            획순을 잘 보세요
          </span>
        )}
      </div>

      {phase === 'trace' && (
        <div className="flex items-center gap-[10px]">
          <button
            type="button"
            onClick={clearTrace}
            className="
              flex items-center gap-[4px] h-[36px] px-[14px] rounded-full
              bg-layout-gray-50 dark:bg-layout-gray-dark
              text-[13px] font-[700] text-layout-gray-400 dark:text-layout-gray-200
            "
          >
            <ArrowClockwise size={14} weight="bold" />
            지우기
          </button>
          <button
            type="button"
            onClick={evaluate}
            className="
              h-[36px] px-[18px] rounded-full
              bg-primary-main-600 text-layout-white
              text-[13px] font-[700]
            "
          >
            확인
          </button>
        </div>
      )}

      {phase === 'result' && (
        <div className="flex flex-col items-center gap-[10px]">
          <div className={`flex items-center gap-[6px] text-[14px] font-[700] ${passed ? 'text-status-success-600' : 'text-layout-gray-400'}`}>
            {passed && <Check size={16} weight="bold" />}
            {passed ? '잘 썼어요' : '조금 더 연습해봐요'}
          </div>
          <div className="flex items-center gap-[10px]">
            <button
              type="button"
              onClick={() => { setPhase('trace'); setUserStrokes([]); setCoverage(null); }}
              className="
                h-[36px] px-[14px] rounded-full
                bg-layout-gray-50 dark:bg-layout-gray-dark
                text-[13px] font-[700] text-layout-gray-400 dark:text-layout-gray-200
              "
            >
              다시 쓰기
            </button>
            <button
              type="button"
              onClick={() => { haptic('light'); onDone?.(); }}
              className="h-[36px] px-[18px] rounded-full bg-primary-main-600 text-layout-white text-[13px] font-[700]"
            >
              다음
            </button>
          </div>
        </div>
      )}

      {phase === 'compoundDone' && (
        <button
          type="button"
          onClick={() => { haptic('light'); onDone?.(); }}
          className="h-[36px] px-[18px] rounded-full bg-primary-main-600 text-layout-white text-[13px] font-[700]"
        >
          다음
        </button>
      )}
    </div>
  );
};

export default StrokeTracer;
