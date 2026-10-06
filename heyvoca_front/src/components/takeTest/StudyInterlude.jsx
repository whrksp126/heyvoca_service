// src/components/takeTest/StudyInterlude.jsx
//
// 학습 중 전체 화면 연출(연출만 — 보상 지급·서버 호출 없음). 콤보만 아이콘(번개 당근)을 얹고 나머지는 타이포그래피만 쓴다.
//   ComboInterlude  콤보 마일스톤(COMBO_MILESTONE_STEP 의 배수마다) 직후 문제 사이에 끼는 인터루드.
//   PhaseInterlude  학습 구간 경계 안내 — '실전 문장으로 학습해봐요' / '틀린 문제를 복습해봐요'.
//   CompleteCut     세션이 끝난 뒤 결과 화면으로 가기 전 '학습 완료' 한 컷. 사선 띠 4개가 완료 효과음의
//                   네 음 시작 시각에 맞춰 좌우에서 번갈아 들어오고, 마지막 음에서 제목이 떠오른다.
// 셋은 같은 InterludeShell(은은한 배경 + 아래에서 떠오르는 큰 제목 + 작은 보조 한 줄 + 얇은 포인트 선)을
// 공유하고 tone 으로 배경·강조색만 구분한다. 탭하면 즉시 넘어간다.
// body 포털 + fixed 로 그려 조상 transform 의 영향을 받지 않는다. prefers-reduced-motion 이면 페이드만.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { feel } from '../../lib/feel';
import { SFX_NOTE_STARTS_MS } from '../../lib/feel/sfx';
import { COMBO_MILESTONE_STEP } from './ComboBar';
import ComboIcon from './ComboIcon';

export const COMBO_INTERLUDE_MS = 1600;
export const PHASE_INTERLUDE_MS = 1500;
export const COMPLETE_CUT_MS = 1200;

// 구간 안내 문구 — Main.jsx 의 phaseStart 표식('sentence' | 'retry')과 1:1.
export const PHASE_COPY = {
  sentence: { title: '실전 문장으로 학습해봐요', sub: '배운 단어를 문장 속에서 써봐요' },
  retry: { title: '틀린 문제를 복습해봐요', sub: '다시 풀면 더 오래 기억해요' },
};

// 완료 컷의 사선 띠 4개 — 완료 효과음 네 음(SFX_NOTE_STARTS_MS.complete) 시작 시각에 하나씩, 좌우 번갈아 들어온다.
// 색은 primary 계열 토큰만, 은은하게(opacity).
const COMPLETE_BANDS = {
  noteStartsMs: SFX_NOTE_STARTS_MS.complete,
  items: [
    { cls: 'top-[14%] bg-primary-main-100 dark:bg-primary-main-dark opacity-80', from: '-110%' },
    { cls: 'top-[36%] bg-primary-main-200 dark:bg-primary-main-dark opacity-50', from: '110%' },
    { cls: 'top-[58%] bg-primary-main-100 dark:bg-primary-main-dark opacity-80', from: '-110%' },
    { cls: 'top-[78%] bg-primary-main-200 dark:bg-primary-main-dark opacity-50', from: '110%' },
  ],
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
// leadMs = feel() 호출 시점부터 소리(=진동)가 시작되기까지(ms). 소리와 화면을 맞추려는 연출이 쓴다(첫 렌더엔 null).
const useOneShot = ({ cue, cueOpts, durationMs, onDone }) => {
  const [leadMs, setLeadMs] = useState(null);
  const doneRef = useRef(onDone);
  const firedRef = useRef(false);
  useEffect(() => { doneRef.current = onDone; });
  const finish = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    doneRef.current?.();
  };
  useEffect(() => {
    const r = feel(cue, cueOpts);
    setLeadMs(r?.fired ? r.startInMs : 0);
    const t = setTimeout(finish, durationMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { finish, leadMs };
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
 * icon 을 주면 선 자리에 그림이 통 튀어 들어온다(콤보).
 */
const InterludeShell = ({ tone, title, sub, hero = false, icon = null, bands = null, cue, cueOpts, durationMs, onDone }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const reducedMotion = useReducedMotion();
  const { finish, leadMs } = useOneShot({ cue, cueOpts, durationMs, onDone });
  // 띠 연출: 소리가 실제로 시작되는 시각(leadMs)을 알기 전엔 요소를 그리지 않는다(첫 렌더 직후 곧 채워짐).
  const ready = !bands || leadMs !== null;
  const lead = (leadMs ?? 0) / 1000;
  // 띠 연출이면 제목·선은 마지막 음(네 번째) 시각에 맞춘다. 아니면 기존 지연.
  const titleAt = bands ? lead + (bands.noteStartsMs[bands.noteStartsMs.length - 1] ?? 0) / 1000 : 0.1;
  const lineAt = bands ? Math.max(0, titleAt - 0.05) : 0.05;
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
  const contentDelay = bands ? titleAt : 0.1;
  return createPortal(
    <motion.div
      role="presentation"
      className={`fixed inset-0 z-[80] flex flex-col items-center justify-center px-[24px] ${bands ? 'overflow-hidden' : ''} ${t.bg}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.15 } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      onClick={finish}
    >
      {ready && bands && !reducedMotion && bands.items.map((b, i) => (
        <motion.div
          key={i}
          aria-hidden
          className={`absolute left-[-20%] w-[140%] h-[16%] -rotate-[14deg] ${b.cls}`}
          initial={{ x: b.from }}
          animate={{ x: 0, transition: { delay: lead + (bands.noteStartsMs[i] ?? 0) / 1000, duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
        />
      ))}
      {ready && (
      <>
      {icon ? (
        <motion.div
          aria-hidden
          className="relative h-[132px] w-[132px]"
          initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.4, rotate: reducedMotion ? 0 : -14 }}
          animate={{ opacity: 1, scale: 1, rotate: 0, transition: { delay: lineAt, duration: 0.42, ease: [0.34, 1.56, 0.64, 1] } }}
        >
          {icon}
        </motion.div>
      ) : (
        <motion.div
          aria-hidden
          className={`relative h-[3px] w-[40px] rounded-full origin-center ${t.line}`}
          initial={{ opacity: 0, scaleX: reducedMotion ? 1 : 0 }}
          animate={{ opacity: 1, scaleX: 1, transition: { delay: lineAt, duration: 0.4, ease: 'easeOut' } }}
        />
      )}
      <motion.h1
        {...rise(contentDelay)}
        className={`relative ${icon ? 'mt-[10px]' : 'mt-[20px]'} text-center tracking-[-0.03em] ${t.title} ${hero ? 'text-[56px] font-[900] leading-[1.1]' : 'text-[24px] font-[800] leading-[1.35]'}`}
      >
        {title}
      </motion.h1>
      {sub && (
        <motion.p
          {...rise(bands ? titleAt + 0.2 : 0.3)}
          className="relative mt-[12px] text-center text-[15px] font-[600] text-layout-gray-400 dark:text-layout-gray-100"
        >
          {sub}
        </motion.p>
      )}
      </>
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
      icon={<ComboIcon n={milestone} className="h-full w-full" />}
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
      bands={COMPLETE_BANDS}
      title={label}
      cue="complete"
      durationMs={durationMs}
      onDone={onDone}
    />
  );
};
