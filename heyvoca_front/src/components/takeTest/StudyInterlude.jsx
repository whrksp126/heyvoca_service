// src/components/takeTest/StudyInterlude.jsx
//
// 학습 중 전체 화면 연출(연출만 — 보상 지급·서버 호출 없음). 이미지·아이콘 없이 타이포그래피만 쓴다.
//   ComboInterlude  콤보 마일스톤(COMBO_MILESTONE_STEP 의 배수마다) 직후 문제 사이에 끼는 인터루드.
//   PhaseInterlude  학습 구간 경계 안내 — '실전 문장으로 학습해봐요' / '틀린 문제를 복습해봐요'.
//   CompleteCut     세션이 끝난 뒤 결과 화면으로 가기 전 '학습 완료' 한 컷.
// 셋은 같은 InterludeShell(은은한 배경 + 아래에서 떠오르는 큰 제목 + 작은 보조 한 줄 + 얇은 포인트 선)을
// 공유하고 tone 으로 배경·강조색만 구분한다. 탭하면 즉시 넘어간다.
// body 포털 + fixed 로 그려 조상 transform 의 영향을 받지 않는다. prefers-reduced-motion 이면 페이드만.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { feel } from '../../lib/feel';
import { COMBO_MILESTONE_STEP } from './ComboBar';

export const COMBO_INTERLUDE_MS = 1600;
export const PHASE_INTERLUDE_MS = 1500;
export const COMPLETE_CUT_MS = 1200;

// 구간 안내 문구 — Main.jsx 의 phaseStart 표식('sentence' | 'retry')과 1:1.
export const PHASE_COPY = {
  sentence: { title: '실전 문장으로 학습해봐요', sub: '배운 단어를 문장 속에서 써봐요' },
  retry: { title: '틀린 문제를 복습해봐요', sub: '다시 풀면 더 오래 기억해요' },
};

// 단계별 응원 문구 — 주기(step)로 나눈 단계가 높을수록 한 단계 힘이 실린 말. 같은 단계 안에서는 무작위.
const PHRASES = [
  ['계속 이어가요', '좋은 흐름이에요', '지금 아주 좋아요'],
  ['멈추지 않는 집중력이에요', '대단해요, 계속 가요', '정말 꾸준해요'],
  ['놀라운 몰입이에요', '이대로 쭉 가요', '거침없는 연속 정답이에요'],
];
const pickPhrase = (milestone) => {
  const tier = Math.min(PHRASES.length - 1, Math.max(0, Math.floor(milestone / COMBO_MILESTONE_STEP) - 1));
  const list = PHRASES[tier];
  return list[Math.floor(Math.random() * list.length)];
};

// 한 번만 불리는 종료 콜백 + 타이머 + 소리/진동 발사를 묶은 훅
const useOneShot = ({ cue, cueOpts, durationMs, onDone }) => {
  const doneRef = useRef(onDone);
  const firedRef = useRef(false);
  useEffect(() => { doneRef.current = onDone; });
  const finish = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    doneRef.current?.();
  };
  useEffect(() => {
    feel(cue, cueOpts);
    const t = setTimeout(finish, durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return finish;
};

// tone 별 배경·제목·선 색(토큰만)
const TONES = {
  combo: {
    bg: 'bg-primary-main-50 dark:bg-layout-black',
    title: 'text-primary-main-600 dark:text-primary-main-300',
    line: 'bg-primary-main-300 dark:bg-primary-main-600',
  },
  phase: {
    bg: 'bg-layout-white dark:bg-layout-black',
    title: 'text-layout-black dark:text-layout-white',
    line: 'bg-primary-main-600',
  },
  retry: {
    bg: 'bg-layout-white dark:bg-layout-black',
    title: 'text-layout-black dark:text-layout-white',
    line: 'bg-secondary-yellow-500',
  },
  complete: {
    bg: 'bg-primary-main-50 dark:bg-layout-black',
    title: 'text-primary-main-600 dark:text-primary-main-300',
    line: 'bg-secondary-yellow-500',
  },
};

/**
 * 공통 셸 — 제목은 size 로 키운다(콤보·완료는 hero, 구간 안내는 보통).
 * 등장 순서: 선(0.05s) → 제목(0.1s) → 보조(0.3s). 모두 tween(스프링·3키프레임 없음).
 */
const InterludeShell = ({ tone, title, sub, hero = false, cue, cueOpts, durationMs, onDone }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const reducedMotion = useReducedMotion();
  const finish = useOneShot({ cue, cueOpts, durationMs, onDone });
  const t = TONES[tone] ?? TONES.phase;

  // 입력 포커스(키보드)가 남아 있으면 인터루드 위에서 키보드가 올라와 있다 — 내린다.
  useEffect(() => {
    try { document.activeElement?.blur?.(); } catch (e) { /* noop */ }
  }, []);

  if (typeof document === 'undefined') return null;
  const rise = (delay) => ({
    initial: { opacity: 0, y: reducedMotion ? 0 : 16 },
    animate: { opacity: 1, y: 0, transition: { delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
  });
  return createPortal(
    <motion.div
      role="presentation"
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-center px-[24px] ${t.bg}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.15 } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      onClick={finish}
    >
      <motion.div
        aria-hidden
        className={`h-[3px] w-[40px] rounded-full origin-center ${t.line}`}
        initial={{ opacity: 0, scaleX: reducedMotion ? 1 : 0 }}
        animate={{ opacity: 1, scaleX: 1, transition: { delay: 0.05, duration: 0.4, ease: 'easeOut' } }}
      />
      <motion.h1
        {...rise(0.1)}
        className={`mt-[20px] text-center tracking-[-0.03em] ${t.title} ${hero ? 'text-[56px] font-[900] leading-[1.1]' : 'text-[24px] font-[800] leading-[1.35]'}`}
      >
        {title}
      </motion.h1>
      {sub && (
        <motion.p
          {...rise(0.3)}
          className="mt-[12px] text-center text-[15px] font-[600] text-layout-gray-400 dark:text-layout-gray-100"
        >
          {sub}
        </motion.p>
      )}
    </motion.div>,
    document.body,
  );
};

/**
 * @param {number} n 콤보 값(표시용)
 * @param {number} milestone COMBO_MILESTONE_STEP 의 배수 — 응원 문구 단계 선택
 */
export const ComboInterlude = ({ n, milestone = COMBO_MILESTONE_STEP, onDone, durationMs = COMBO_INTERLUDE_MS }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [phrase] = useState(() => pickPhrase(milestone));
  return (
    <InterludeShell
      tone="combo"
      hero
      title={`${n} 콤보`}
      sub={phrase}
      cue="bonus"
      durationMs={durationMs}
      onDone={onDone}
    />
  );
};

/** @param {'sentence'|'retry'} kind 구간 종류 — 가벼운 큐('select') 사용 */
export const PhaseInterlude = ({ kind = 'sentence', onDone, durationMs = PHASE_INTERLUDE_MS }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const copy = PHASE_COPY[kind] ?? PHASE_COPY.sentence;
  return (
    <InterludeShell
      tone={kind === 'retry' ? 'retry' : 'phase'}
      title={copy.title}
      sub={copy.sub}
      cue="select"
      durationMs={durationMs}
      onDone={onDone}
    />
  );
};

/**
 * 학습 완료 한 컷.
 * @param {string} label '학습 완료' | '심기 완료'
 * @param {() => void} onDone 자동 종료/탭 건너뜀 시 한 번 호출(호출부가 결과 이동을 앞당길 때 쓴다)
 */
export const CompleteCut = ({ label = '학습 완료', onDone, durationMs = COMPLETE_CUT_MS }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  return (
    <InterludeShell
      tone="complete"
      hero
      title={label}
      cue="complete"
      durationMs={durationMs}
      onDone={onDone}
    />
  );
};
