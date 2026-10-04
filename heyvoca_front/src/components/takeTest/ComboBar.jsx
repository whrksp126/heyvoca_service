import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flame } from '@phosphor-icons/react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { feel, pickVariant, SPRING } from '../../lib/feel';

/**
 * 콤보 마일스톤 단계 — 진행바 색을 단계별로 바꾼다(기존 토큰 안에서 primary → secondary-yellow).
 *   0~4: primary(기본) / 5~9: yellow-400 / 10+: yellow-600
 * Main.jsx 가 진행바 채움 색을 고를 때 쓴다(진단 모드의 crop-carrot 가 우선).
 */
export const COMBO_MILESTONE_STEP = 5;
export const getComboFillClass = (current = 0) => {
  if (current >= 10) return 'bg-secondary-yellow-600';
  if (current >= COMBO_MILESTONE_STEP) return 'bg-secondary-yellow-400';
  return 'bg-primary-main-600';
};

const MILESTONE_SHOW_MS = 900;

/**
 * 콤보 팝업 — AI 추천 테스트에서 콤보가 "오를 때"만 프로그래스 바 위에 텍스트로 잠깐 달렸다 사라짐.
 * - 진입 시 초기 콤보값으로는 표시하지 않음(초기 노출 버그 방지).
 * - 다음 문제 슬라이드 전환(정답 ~1s) 전에 사라지도록 800ms 후 숨김.
 * - 레이아웃을 차지하지 않도록 0높이 relative 컨테이너 + absolute.
 *
 * 【손맛】 콤보가 오르는 순간 feel('combo', {n}) — 음이 반음씩 올라가고 진동이 강해진다.
 *  feel() 이 돌려주는 startInMs(정답 큐가 아직 울리는 중이면 그 뒤로 밀린 시작 시각)만큼 팝업
 *  연출도 늦춰 소리·진동·글자가 같은 순간에 뜬다.
 *  5의 배수(5·10·15…)에서는 화면 중앙에 큰 '콤보 xN' 글자가 짧게(900ms) 뜬다 — pointer-events-none 이라
 *  다음 문제 진입·터치를 막지 않는다. (body 포털: 조상의 transform 이 fixed 기준을 바꾸지 않게)
 *
 * @param {boolean} isRecord — 이번 판이 기존 최고 기록을 갱신 중인지(Main.jsx
 *   comboRunIsRecordRef 와 같은 값). 현재는 표시에 쓰지 않는다(예전에는 진동 종류를 갈랐다).
 */
// eslint-disable-next-line no-unused-vars
const ComboBar = ({ combo, isRecord = false }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const reducedMotion = useReducedMotion();
  const current = combo?.current ?? 0;
  const [show, setShow] = useState(false);
  const [startDelay, setStartDelay] = useState(0);
  const [milestone, setMilestone] = useState(null);
  const prevRef = useRef(null); // null = 아직 초기화 전(첫 값은 트리거하지 않음)
  const timerRef = useRef(null);
  const milestoneTimerRef = useRef(null);

  useEffect(() => {
    if (prevRef.current === null) {
      // 진입 직후 최초 콤보값 — 표시하지 않고 기준값만 세팅
      prevRef.current = current;
      return;
    }
    if (current >= 2 && current > prevRef.current) {
      const { startInMs } = feel('combo', { n: current });
      setStartDelay(startInMs / 1000);
      setShow(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShow(false), 800 + startInMs);

      if (current % COMBO_MILESTONE_STEP === 0) {
        setMilestone(current);
        if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current);
        milestoneTimerRef.current = setTimeout(() => setMilestone(null), MILESTONE_SHOW_MS + startInMs);
      }
    } else if (current < prevRef.current) {
      setShow(false); // 콤보 깨짐
      setMilestone(null);
    }
    prevRef.current = current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (milestoneTimerRef.current) clearTimeout(milestoneTimerRef.current);
  }, []);

  const popIn = pickVariant('popIn', reducedMotion);

  return (
    <div className="relative w-full">
      <AnimatePresence>
        {show && (
          <motion.div
            key={current}
            initial={popIn.initial}
            animate={{ ...popIn.animate, transition: { ...(popIn.animate.transition || {}), delay: startDelay } }}
            exit={popIn.exit}
            className="absolute bottom-[2px] right-[2px] z-[6] flex items-center gap-[3px] text-primary-main-600 whitespace-nowrap"
          >
            <Flame weight="fill" className="text-[14px]" />
            <span className="text-[13px] font-[800]">{current}콤보!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {milestone !== null && (
            <motion.div
              key={`milestone-${milestone}`}
              aria-hidden
              className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: startDelay, duration: 0.08 } }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              <motion.div
                className="flex items-center gap-[8px] text-secondary-yellow-500 dark:text-secondary-yellow-400"
                initial={{ scale: reducedMotion ? 1 : 0.4 }}
                animate={reducedMotion
                  ? { scale: 1 }
                  : { scale: 1, transition: { ...SPRING.bouncy, delay: startDelay } }}
              >
                <Flame weight="fill" className="text-[52px]" />
                <span className="text-[44px] font-[900] tracking-[-0.02em]">콤보 x{milestone}</span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
};

export default ComboBar;
