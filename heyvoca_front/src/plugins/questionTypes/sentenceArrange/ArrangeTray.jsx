import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle, X } from '@phosphor-icons/react';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import StudyTimingTag from '../../../components/farm/StudyTimingTag';
import LiftAboveBar from '../../../components/common/LiftAboveBar';
import { haptic } from '../../../lib/feel';

/*
  문장 조립형 3종(sentenceArrangePartial/sentenceArrange/listenArrange) 공용 "아래 화면" —
  기존 빈칸 채우기(FillInTheBlankQuestion)의 아래 카드 + 선택지 영역과 같은 자리를 대신한다.

  구성(위→아래):
    1) 트레이 카드(회색) — 고정 텍스트(prefix/suffix) + 사용자가 놓은 조각이 문장처럼 줄바꿈.
       O/X · 시점 문구 · 농장 상태 바는 이 카드 안에서 사지선다/빈칸 채우기와 같은 자리에 뜬다.
       틀렸으면 카드 안에 정답 문장을 이어서 보여준다.
    2) 조각 은행 — 흰 바탕 칩. 탭하면 트레이 끝으로 이동(자리는 invisible로 비워 두어
       레이아웃이 흔들리지 않는다). 트레이의 조각을 탭하면 다시 은행으로 돌아간다.
    3) 확인 버튼(50px) — 조각 1개 이상 놓였을 때만 활성. 브랜드색은 시작 CTA·스위치 전용
       규칙이라 여기서는 중립색(검정/흰색 채움, dictionary/Main.jsx의 칩 토큰과 동일)을 쓴다.

  카드 자체에는 탭 인터랙션이 없다(정답 유출 방지) — FillInTheBlankQuestion의 빈칸 카드와 같다.
*/
const ArrangeTray = ({
  bank,
  prefix,
  suffix,
  // 채점 후 트레이 카드 하단에 덧붙일 내용 — 유형마다 다르다:
  //   문장 만들기: 틀렸을 때만 정답 문장(강조 포함)
  //   듣고 받아쓰기: 정오답과 무관하게 한국어 해석
  // 호출부가 조립해서 넘긴다(이 컴포넌트는 순수 레이아웃만 담당).
  postAnswerNode,
  isAnswered,
  isCorrect,
  question,
  farm,
  resumeReplayKey,
  advanceGate,
  onSubmit,
}) => {
  const reducedMotion = useReducedMotion();
  const [bankUsed, setBankUsed] = useState(() => bank.map(() => false));
  const [trayOrder, setTrayOrder] = useState([]); // bank 인덱스 배열 — 순서가 곧 사용자가 배열한 순서

  const disabled = isAnswered;

  const tapBank = (i) => {
    if (disabled || bankUsed[i]) return;
    haptic('light');
    setBankUsed((prev) => {
      const next = [...prev];
      next[i] = true;
      return next;
    });
    setTrayOrder((prev) => [...prev, i]);
  };

  const tapTray = (pos) => {
    if (disabled) return;
    haptic('light');
    const bankIdx = trayOrder[pos];
    setTrayOrder((prev) => prev.filter((_, idx) => idx !== pos));
    setBankUsed((prev) => {
      const next = [...prev];
      next[bankIdx] = false;
      return next;
    });
  };

  const handleConfirm = () => {
    if (disabled || trayOrder.length === 0) return;
    haptic('light');
    onSubmit(trayOrder.map((i) => bank[i]));
  };

  return (
    <div className="flex flex-col gap-[15px] flex-1 min-h-0">
      {/* 트레이 카드 */}
      <motion.div
        data-lift-card=""
        className="
          relative
          flex flex-col flex-1 min-h-0
          w-full
          rounded-[12px] text-left
          bg-layout-gray-50 dark:bg-layout-gray-dark
          overflow-hidden
          select-none
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
      >
        <StudyTimingTag
          answered={isAnswered}
          fsrs={question.fsrs}
          stage={question.farmStage}
          farm={farm}
          wasCorrect={isCorrect}
        />
        <div className="relative z-[1] flex-1 min-h-0 overflow-y-auto px-[20px] py-[26px] flex items-center">
          <LiftAboveBar active={!!farm} topReserve={28} className="w-full">
            <p className="w-full text-[19px] font-[700] leading-[1.9] text-layout-black dark:text-layout-white break-keep">
              {prefix && (
                <span className="text-layout-gray-300 dark:text-layout-gray-100 font-[600]">{prefix} </span>
              )}
              {trayOrder.map((bankIdx, pos) => (
                <button
                  key={pos}
                  type="button"
                  disabled={disabled}
                  onClick={() => tapTray(pos)}
                  className="
                    inline-flex items-center align-middle mx-[3px] my-[2px]
                    px-[9px] py-[2px]
                    bg-layout-white dark:bg-layout-black
                    border-[1px] border-layout-gray-200 dark:border-[#3A3A3A]
                    rounded-[6px]
                    text-layout-black dark:text-layout-white
                  "
                >
                  {bank[bankIdx]}
                </button>
              ))}
              {suffix && (
                <span className="text-layout-gray-300 dark:text-layout-gray-100 font-[600]"> {suffix}</span>
              )}
            </p>
            {isAnswered && postAnswerNode}
          </LiftAboveBar>
        </div>

        {/* O/X — 카드 정중앙 */}
        <div className="absolute inset-0 z-[3] flex items-center justify-center pointer-events-none">
          <AnimatePresence>
            {isCorrect === true && (
              <motion.div
                key={`correct-${resumeReplayKey}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 25, duration: 0.3 }}
                style={{ willChange: 'transform, opacity' }}
              >
                <Circle size={150} weight="bold" className="text-status-success-500" />
              </motion.div>
            )}
            {isCorrect === false && (
              <motion.div
                key={`wrong-${resumeReplayKey}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 25, duration: 0.3 }}
                style={{ willChange: 'transform, opacity' }}
              >
                <X size={150} weight="bold" className="text-status-error-500" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <FarmResultBar
          farm={farm}
          replayKey={resumeReplayKey}
          onAnimStart={advanceGate.farmStarted}
          onSettled={advanceGate.farmSettled}
        />
      </motion.div>

      {/* 조각 은행 + 확인 */}
      <div className="flex-shrink-0 flex flex-col gap-[10px]">
        <div className="flex flex-wrap justify-center gap-[8px]">
          {bank.map((token, i) => (
            <motion.button
              key={i}
              type="button"
              disabled={disabled || bankUsed[i]}
              onClick={() => tapBank(i)}
              whileTap={!bankUsed[i] ? { scale: 0.92 } : undefined}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className={`
                min-h-[46px] px-[16px]
                flex items-center justify-center
                bg-layout-white dark:bg-layout-black
                border-[1px] border-b-[3px] border-layout-gray-200 dark:border-[#3A3A3A]
                rounded-[10px]
                text-[16px] font-[700] text-layout-black dark:text-layout-white
                ${bankUsed[i] ? 'invisible' : ''}
              `}
            >
              {token}
            </motion.button>
          ))}
        </div>
        <motion.button
          type="button"
          disabled={disabled || trayOrder.length === 0}
          whileTap={!disabled && trayOrder.length > 0 ? { scale: 0.97 } : undefined}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          onClick={handleConfirm}
          className={`
            h-[50px] rounded-[12px]
            text-[16px] font-[700]
            ${disabled || trayOrder.length === 0
              ? 'bg-layout-gray-200 dark:bg-[#2A2A2A] text-layout-gray-400 dark:text-layout-gray-300'
              : 'bg-layout-black text-layout-white dark:bg-layout-white dark:text-layout-black'}
          `}
        >
          확인
        </motion.button>
      </div>
    </div>
  );
};

export default ArrangeTray;
