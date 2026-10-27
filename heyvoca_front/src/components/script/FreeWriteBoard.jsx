// src/components/script/FreeWriteBoard.jsx
//
// 글자 복습 "듣고 쓰기"(scriptListenWrite, 2026-10) — 판 안 우측 하단 스피커 버튼(등장 시 자동
// 재생)으로 소리만 듣고, 빈 판에 가이드 획 없이 직접 쓴다. 정답 글자의 획 수만큼 쓰면 손을 뗀 순간
// 자동 채점한다(utils/scriptWriteGrader.js — 위치·크기 정규화 후 획 짝 커버리지·정밀도·끝점·방향).
// 획 수를 넘길 수는 없어서 "확인" 버튼이 없다 — 따라 쓰기(StrokeTracer)와 같은 원칙.
// 틀리면 쓴 글씨 위에 정답 글자를 획순대로 겹쳐 그려 보여 준다. 맞으면 쓴 글씨 대신 정답 글자
// 모양만 (애니메이션 없이) 보여 준다.
// 2026-10-24(이슈 #15): 스피커를 판 위 영역에서 판 안 우측 하단으로 옮겼다(위 영역 아래로 음파가
// 가려졌다). 채점 후 자동으로 넘어가지 않고 아래 "다음" 버튼을 눌러야 onDone 이 불린다.
// 같은 날 2차: "모르겠어요" 버튼 제거, "지우기"는 판 안 우측 상단 아이콘으로(소문자/대문자 표시는
// 위 가운데로), 판 안 "들은 글자를 직접 써 보세요" 안내는 헤더와 겹쳐 제거.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import ScriptNextButton from './ScriptNextButton';
import { feel } from '../../lib/feel';
import ResultMark from '../common/ResultMark';
import { gradeFreeWrite } from '../../utils/scriptWriteGrader';
import { speakScriptItem, stopScriptSpeech } from '../../utils/scriptData';
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
 * onGraded(correct) — 채점 순간(정답/오답) 한 번
 * onDone() — 채점 후 사용자가 "다음"을 눌렀을 때
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
  const svgRef = useRef(null);
  const pointsRef = useRef([]);
  const strokesRef = useRef([]);
  const pointerRef = useRef(null);
  const doneRef = useRef(false);
  const shake = useAnimationControls();
  const ownerRef = useRef({}); // 이 판이 건 소리 — 넘어가면 자기 소리만 끊는다(utils/scriptData.js)
  useEffect(() => () => stopScriptSpeech(ownerRef.current), []);

  const play = async () => {
    setSpeaking(true);
    try {
      await speakScriptItem(script, item, undefined, ownerRef.current);
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

  const answerPaths = useMemo(() => entry?.strokes || [], [entry]);

  return (
    <div className="flex flex-col gap-[14px] w-full h-full">
      <div className="flex flex-1 min-h-0 items-center justify-center">
        <motion.div
          animate={shake}
          className="relative w-full max-w-[340px] aspect-square rounded-[16px] bg-layout-gray-50 dark:bg-layout-gray-dark overflow-hidden touch-none select-none"
        >
          {caseVariant && (
            <div aria-hidden className="absolute top-[8px] left-[50%] translate-x-[-50%] z-[1] h-[22px] px-[9px] rounded-full flex items-center bg-layout-white/90 dark:bg-layout-black/80 border border-border dark:border-border-dark pointer-events-none">
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

            {/* 정답 — 쓴 글씨 대신 정답 글자 모양만, 애니메이션 없이 */}
            {result === true && answerPaths.map((d, i) => (
              <path
                key={`ok-${i}`}
                d={d}
                fill="none"
                stroke={INK_COLOR}
                strokeWidth={vbW * 0.05}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {result !== true && strokes.map((pts, i) => (
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

          {/* 스피커 — 다시 듣기. 판 안 우측 하단(음파가 판 안에서 보이도록). 판보다 위에 떠 있어
              누르는 동안 획이 시작되지 않는다. */}
          <motion.button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => { feel('tap'); play(); }}
            whileTap={{ scale: 0.94 }}
            aria-label="소리 다시 듣기"
            className="absolute right-[12px] bottom-[12px] z-[3] flex items-center justify-center w-[48px] h-[48px] rounded-full bg-layout-white dark:bg-layout-black border border-border dark:border-border-dark"
          >
            <SpeakerArt size={28} playing={speaking} />
          </motion.button>

          {/* 지우기 — 판 안 우측 상단. 판보다 위에 떠 있어 누르는 동안 획이 시작되지 않는다. */}
          {result === null && (
            <motion.button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={clearAll}
              whileTap={{ scale: 0.94 }}
              aria-label="지우기"
              disabled={strokes.length === 0}
              className="absolute right-[12px] top-[12px] z-[3] flex items-center justify-center w-[40px] h-[40px] rounded-full bg-layout-white dark:bg-layout-black border border-border dark:border-border-dark text-layout-gray-400 dark:text-layout-gray-100 disabled:opacity-40"
            >
              <ArrowCounterClockwise size={18} weight="bold" />
            </motion.button>
          )}
          {showAnswer && (
            <span className="absolute bottom-[10px] left-0 right-0 text-center text-[12px] font-[700] text-status-success-600 pointer-events-none">
              정답은 {caseVariant === 'lower' ? (item.lower || item.char) : item.char}
            </span>
          )}
        </motion.div>
      </div>

      <ScriptNextButton show={result !== null} onNext={() => onDone?.(result)} />

    </div>
  );
};

export default FreeWriteBoard;
