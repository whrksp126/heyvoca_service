// src/components/takeTest/StudyInterlude.jsx
//
// 학습 중 전체 화면 연출 두 가지(연출만 — 보상 지급·서버 호출 없음).
//   ComboInterlude  콤보 마일스톤(5의 배수마다) 직후 문제 사이에 끼는 1.6초 인터루드. 작물이 튀어 들어오고
//                   파편이 터지며 '콤보 N' pill 이 뜬다. 탭하면 즉시 건너뛴다.
//   CompleteCut     세션이 끝난 뒤 결과 화면으로 가기 전 1.1초 '학습 완료' 한 컷(사선 띠 배경).
// 둘 다 body 포털 + fixed 로 그려 조상 transform 의 영향을 받지 않는다.
// prefers-reduced-motion 이면 페이드만(소리·진동은 유지).
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Flame, Sparkle } from '@phosphor-icons/react';
import CropImage from '../farm/CropImage';
import { feel, Burst, SPRING } from '../../lib/feel';

export const COMBO_INTERLUDE_MS = 1600;
export const COMPLETE_CUT_MS = 1100;

// 콤보 단계에 맞는 작물 — 5 새싹, 10 이파리, 15 이상 당근(기존 에셋 범위 유지).
const cropForMilestone = (m) => (m >= 15 ? 'carrot' : m >= 10 ? 'leaf' : 'sprout');
// 단계별 문구 — 높을수록 한 단계 힘이 실린 말. 같은 단계 안에서는 무작위.
const PHRASES_LOW = ['계속 이어가요', '새싹이 돋았어요', '좋은 출발이에요'];
const PHRASES_MID = ['쑥쑥 자라고 있어요', '지금 아주 좋아요', '이파리가 무성해졌어요'];
const PHRASES_HIGH = ['당근이 탐스럽게 컸어요', '멈추지 않는 집중력이에요', '대단해요, 계속 가요'];
const pickPhrase = (m) => {
  const list = m >= 15 ? PHRASES_HIGH : m >= 10 ? PHRASES_MID : PHRASES_LOW;
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

/**
 * @param {number} n 콤보 값(표시용)
 * @param {number} milestone 5의 배수 — 작물 단계·문구 선택
 * @param {() => void} onDone 자동 종료/탭 건너뜀 시 한 번 호출
 */
export const ComboInterlude = ({ n, milestone = 5, onDone, durationMs = COMBO_INTERLUDE_MS }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const reducedMotion = useReducedMotion();
  const [phrase] = useState(() => pickPhrase(milestone));
  const finish = useOneShot({ cue: 'bonus', durationMs, onDone });

  // 입력 포커스(키보드)가 남아 있으면 인터루드 위에서 키보드가 올라와 있다 — 내린다.
  useEffect(() => {
    try { document.activeElement?.blur?.(); } catch (e) { /* noop */ }
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <motion.div
      role="presentation"
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-layout-white dark:bg-layout-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.12 } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      onClick={finish}
    >
      <div className="relative flex flex-col items-center">
        {/* 작물 — 스프링으로 튀어 들어온다 */}
        <motion.div
          className="relative flex items-center justify-center w-[200px] h-[200px]"
          initial={{ scale: reducedMotion ? 1 : 0, opacity: 0, y: reducedMotion ? 0 : 40 }}
          animate={reducedMotion
            ? { opacity: 1 }
            : { scale: 1, opacity: 1, y: 0, transition: { ...SPRING.bouncy, delay: 0.05 } }}
        >
          <CropImage stage={cropForMilestone(milestone)} size={200} align="center" alt="" />
          {!reducedMotion && <Burst play count={8} radius={120} delay={0.2} />}
        </motion.div>

        <motion.div
          className="
            mt-[16px] flex items-center gap-[8px]
            px-[20px] py-[10px] rounded-[20px]
            bg-primary-main-50 dark:bg-primary-main-dark
            text-primary-main-600 dark:text-primary-main-300
          "
          initial={{ scale: reducedMotion ? 1 : 0.7, opacity: 0 }}
          animate={reducedMotion
            ? { opacity: 1 }
            : { scale: 1, opacity: 1, transition: { ...SPRING.bouncy, delay: 0.3 } }}
        >
          <Flame weight="fill" className="text-[26px]" />
          <span className="text-[24px] font-[700] tracking-[-0.02em]">콤보 {n}</span>
        </motion.div>

        <motion.p
          className="mt-[12px] text-[15px] font-[600] text-layout-gray-400 dark:text-layout-gray-100"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.5, duration: 0.3 } }}
        >
          {phrase}
        </motion.p>
      </div>
    </motion.div>,
    document.body,
  );
};

/**
 * 학습 완료 한 컷 — 사선 띠 배경 + 큰 글자.
 * @param {string} label '학습 완료' | '심기 완료'
 * @param {() => void} onDone 자동 종료/탭 건너뜀 시 한 번 호출(호출부가 결과 이동을 앞당길 때 쓴다)
 */
export const CompleteCut = ({ label = '학습 완료', onDone, durationMs = COMPLETE_CUT_MS }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const reducedMotion = useReducedMotion();
  const finish = useOneShot({ cue: 'complete', durationMs, onDone });

  useEffect(() => {
    try { document.activeElement?.blur?.(); } catch (e) { /* noop */ }
  }, []);

  if (typeof document === 'undefined') return null;
  // 사선 띠 — 토큰 색만. 각 띠는 좌우에서 엇갈려 밀려 들어온다.
  const BANDS = [
    { color: 'top-[12%] bg-primary-main-100 dark:bg-primary-main-dark', from: '-110%' },
    { color: 'top-[34%] bg-secondary-yellow-100 dark:bg-secondary-yellow-dark', from: '110%' },
    { color: 'top-[56%] bg-primary-main-50 dark:bg-primary-main-dark', from: '-110%' },
    { color: 'top-[76%] bg-secondary-yellow-50 dark:bg-secondary-yellow-dark', from: '110%' },
  ];
  return createPortal(
    <motion.div
      role="presentation"
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-layout-white dark:bg-layout-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.12 } }}
      onClick={finish}
    >
      {!reducedMotion && BANDS.map((b, i) => (
        <motion.div
          key={i}
          aria-hidden
          className={`absolute left-[-20%] w-[140%] h-[18%] -rotate-[14deg] ${b.color}`}
          initial={{ x: b.from }}
          animate={{ x: 0, transition: { ...SPRING.soft, delay: 0.03 * i } }}
        />
      ))}

      <div className="relative flex flex-col items-center">
        <motion.div
          initial={{ scale: reducedMotion ? 1 : 0.3, opacity: 0 }}
          animate={reducedMotion
            ? { opacity: 1 }
            : { scale: 1, opacity: 1, transition: { ...SPRING.bouncy, delay: 0.08 } }}
          className="relative flex items-center gap-[10px] text-primary-main-600"
        >
          <Sparkle weight="fill" className="text-[40px] text-secondary-yellow-500" />
          <span className="text-[48px] font-[900] tracking-[-0.03em]">{label}</span>
          <Sparkle weight="fill" className="text-[40px] text-secondary-yellow-500" />
          {!reducedMotion && <Burst play count={8} radius={120} delay={0.25} />}
        </motion.div>
      </div>
    </motion.div>,
    document.body,
  );
};
