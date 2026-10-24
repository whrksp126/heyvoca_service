// src/components/script/FreeWriteBoard.jsx
//
// 글자 복습 "듣고 쓰기"(scriptListenWrite, 2026-10) — 위 스피커 버튼(등장 시 자동 재생)으로
// 소리만 듣고, 아래 빈 판에 가이드 획 없이 직접 쓴다. 정답 글자의 획 수만큼 쓰면 손을 뗀 순간
// 자동 채점한다(utils/scriptWriteGrader.js — 위치·크기 정규화 후 획 짝 커버리지·정밀도·끝점·방향).
// 획 수를 넘길 수는 없어서 "확인" 버튼이 없다 — 따라 쓰기(StrokeTracer)와 같은 원칙.
// 틀리면 쓴 글씨 위에 정답 글자를 획순대로 겹쳐 그려 보여 준 뒤 넘어간다.
// "모르겠어요"는 오답으로 처리하고 정답을 보여 준다.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { feel } from '../../lib/feel';
import ResultMark from '../common/ResultMark';
import TtsRipple from '../common/TtsRipple';
import { gradeFreeWrite } from '../../utils/scriptWriteGrader';
import { speakScriptItem } from '../../utils/scriptData';
import SpeakerArt from '../common/SpeakerArt';

const INK_COLOR = 'var(--primary-main-600)';
const GUIDE_COLOR = '#B9B2A6';
const DRAW_DURATION = 0.45;
const DRAW_GAP = 0.12;

const toSvgPoint = (svgEl, clientX, clientY) => {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const t = pt.matrixTransform(ctm.inverse());
  return { x: t.x, y: t.y };
};

const pointsToD = (points) => points.reduce((acc, p, i) => acc + (i === 0 ? `M${p.x},${p.y}` : ` L${p.x},${p.y}`), '');

/**
 * entry  — 정답 글자 획 데이터 { viewBox, strokes: [d...] }
 * onGraded(correct) — 채점 순간(정답/오답/모르겠어요) 한 번
 * onDone() — 결과 연출(오답이면 정답 획 보여주기)까지 끝난 뒤
 */
const FreeWriteBoard = ({ script, item, entry, caseVariant = null, replayKey, onGraded, onDone }) => {
  "use memo";

  const viewBox = entry?.viewBox || '0 0 109 109';
  const [, , vbW, vbH] = viewBox.split(/\s+/).map(Number);
  const strokeCount = entry?.strokes?.length || 0;

  const [strokes, setStrokes] = useState([]); // 확정된 획들
  const [current, setCurrent] = useState([]);
  const [result, setResult] = useState(null); // null | true | false
  const [showAnswer, setShowAnswer] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [duration, setDuration] = useState(null);
  const svgRef = useRef(null);
  const pointsRef = useRef([]);
  const strokesRef = useRef([]);
  const pointerRef = useRef(null);
  const doneRef = useRef(false);
  const shake = useAnimationControls();

  const play = async () => {
    setSpeaking(true);
    setDuration(null);
    try {
      await speakScriptItem(script, item, setDuration);
    } finally {
      setSpeaking(false);
    }
  };

  // 등장 시 자동 재생
  useEffect(() => {
    play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey]);

  const finish = (correct) => {
    if (doneRef.current) return;
    doneRef.current = true;
    feel(correct ? 'correct' : 'wrong');
    setResult(correct);
    onGraded?.(correct);
    if (!correct) {
      shake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.4 } });
      setTimeout(() => setShowAnswer(true), 700);
    }
    const answerMs = correct ? 0 : 700 + strokeCount * (DRAW_DURATION + DRAW_GAP) * 1000 + 700;
    setTimeout(() => onDone?.(correct), Math.max(1200, answerMs));
  };

  const handleDown = (e) => {
    if (result !== null || !svgRef.current) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 미지원 브라우저 */ }
    pointerRef.current = e.pointerId;
    const p = toSvgPoint(svgRef.current, e.clientX, e.clientY);
    pointsRef.current = [p];
    setCurrent([p]);
  };

  const handleMove = (e) => {
    if (pointerRef.current !== e.pointerId || result !== null || !svgRef.current) return;
    const p = toSvgPoint(svgRef.current, e.clientX, e.clientY);
    pointsRef.current = [...pointsRef.current, p];
    setCurrent(pointsRef.current);
  };

  const handleUp = (e) => {
    if (pointerRef.current !== e.pointerId) return;
    pointerRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* no-op */ }
    const pts = pointsRef.current;
    pointsRef.current = [];
    setCurrent([]);
    if (result !== null || pts.length < 2) return; // 살짝 스친 탭은 무시
    const next = [...strokesRef.current, pts];
    strokesRef.current = next;
    setStrokes(next);
    feel('tap');
    if (next.length >= strokeCount) {
      const g = gradeFreeWrite(next, entry.strokes, { w: vbW, h: vbH });
      if (import.meta.env?.DEV) console.log('[FreeWriteBoard] grade', item?.char, g);
      finish(g.passed);
    }
  };

  const clearAll = () => {
    if (result !== null) return;
    feel('tap');
    strokesRef.current = [];
    setStrokes([]);
  };

  const giveUp = () => {
    if (result !== null) return;
    finish(false);
  };

  const answerPaths = useMemo(() => entry?.strokes || [], [entry]);

  return (
    <div className="flex flex-col gap-[14px] w-full h-full">
      {/* 스피커 — 다시 듣기 */}
      <div className="flex items-center justify-center flex-shrink-0">
        <motion.button
          type="button"
          onClick={() => { feel('tap'); play(); }}
          whileTap={{ scale: 0.94 }}
          aria-label="소리 다시 듣기"
          className="relative flex items-center justify-center w-[76px] h-[76px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark"
        >
          {speaking && (
            <span aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <TtsRipple size={96} duration={duration} />
            </span>
          )}
          <SpeakerArt size={40} playing={speaking} />
        </motion.button>
      </div>

      <div className="flex flex-1 min-h-0 items-center justify-center">
        <motion.div
          animate={shake}
          className="relative w-full max-w-[340px] aspect-square rounded-[16px] bg-layout-gray-50 dark:bg-layout-gray-dark overflow-hidden touch-none select-none"
        >
          {caseVariant && (
            <div aria-hidden className="absolute top-[8px] right-[8px] z-[1] h-[22px] px-[9px] rounded-full flex items-center bg-layout-white/90 dark:bg-layout-black/80 border border-border dark:border-border-dark pointer-events-none">
              <span className="text-[11px] font-[700] text-layout-gray-400 dark:text-layout-gray-100">
                {caseVariant === 'lower' ? '소문자' : '대문자'}
              </span>
            </div>
          )}
          <div aria-hidden className="absolute top-[10px] left-[12px] z-[1] text-[12px] font-[700] text-layout-gray-300 pointer-events-none">
            {Math.min(strokes.length, strokeCount)} / {strokeCount}획
          </div>

          <svg
            ref={svgRef}
            viewBox={viewBox}
            className="absolute inset-0 w-full h-full"
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
          >
            <g aria-hidden pointerEvents="none" opacity={0.16}>
              <line x1={vbW / 2} y1={0} x2={vbW / 2} y2={vbH} stroke={GUIDE_COLOR} strokeWidth={vbW * 0.006} strokeDasharray={`${vbW * 0.014} ${vbW * 0.02}`} />
              <line x1={0} y1={vbH / 2} x2={vbW} y2={vbH / 2} stroke={GUIDE_COLOR} strokeWidth={vbW * 0.006} strokeDasharray={`${vbW * 0.014} ${vbW * 0.02}`} />
            </g>

            {strokes.map((pts, i) => (
              <path
                key={`ink-${i}`}
                d={pointsToD(pts)}
                fill="none"
                stroke={result === false ? GUIDE_COLOR : INK_COLOR}
                strokeWidth={vbW * 0.05}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={result === false ? 0.5 : 1}
              />
            ))}
            {current.length > 0 && (
              <path d={pointsToD(current)} fill="none" stroke={INK_COLOR} strokeWidth={vbW * 0.05} strokeLinecap="round" strokeLinejoin="round" />
            )}

            {/* 오답 — 정답 글자를 획순대로 겹쳐 그린다 */}
            {showAnswer && answerPaths.map((d, i) => (
              <motion.path
                key={`ans-${i}`}
                d={d}
                fill="none"
                className="stroke-status-success-500"
                strokeWidth={vbW * 0.045}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{
                  pathLength: { duration: DRAW_DURATION, delay: i * (DRAW_DURATION + DRAW_GAP), ease: 'easeInOut' },
                  opacity: { duration: 0.01, delay: i * (DRAW_DURATION + DRAW_GAP) },
                }}
              />
            ))}
          </svg>

          {!showAnswer && (
            <ResultMark
              result={result}
              replayKey={replayKey}
              className="pointer-events-none absolute top-[50%] left-[50%] z-[2] translate-x-[-50%] translate-y-[-50%]"
            />
          )}

          {strokes.length === 0 && result === null && current.length === 0 && (
            <span className="absolute bottom-[10px] left-0 right-0 text-center text-[12px] font-[600] text-layout-gray-300 pointer-events-none">
              들은 글자를 직접 써 보세요
            </span>
          )}
          {showAnswer && (
            <span className="absolute bottom-[10px] left-0 right-0 text-center text-[12px] font-[700] text-status-success-600 pointer-events-none">
              정답은 {caseVariant === 'lower' ? (item.lower || item.char) : item.char}
            </span>
          )}
        </motion.div>
      </div>

      {result === null && (
        <div className="flex items-center gap-[10px] w-full flex-shrink-0">
          <motion.button
            type="button"
            onClick={clearAll}
            whileTap={{ scale: 0.97 }}
            className="flex-1 h-[52px] rounded-[12px] flex items-center justify-center gap-[6px] border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100 text-[15px] font-[700] tracking-[-0.03em]"
          >
            <ArrowCounterClockwise size={17} weight="bold" />
            지우기
          </motion.button>
          <motion.button
            type="button"
            onClick={giveUp}
            whileTap={{ scale: 0.97 }}
            className="flex-1 h-[52px] rounded-[12px] flex items-center justify-center border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100 text-[15px] font-[700] tracking-[-0.03em]"
          >
            모르겠어요
          </motion.button>
        </div>
      )}
    </div>
  );
};

export default FreeWriteBoard;
