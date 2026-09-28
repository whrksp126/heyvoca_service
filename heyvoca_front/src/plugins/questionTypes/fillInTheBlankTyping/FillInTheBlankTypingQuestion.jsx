import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle, X, SpeakerHigh } from '@phosphor-icons/react';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import StudyTimingTag from '../../../components/farm/StudyTimingTag';
import TtsRipple from '../../../components/common/TtsRipple';
import LiftAboveBar from '../../../components/common/LiftAboveBar';
import { haptic } from '../../../lib/feel';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';
import { getTextSound, stripHtmlTags } from '../../../utils/common';
import { getAdvanceDelay } from '../../../utils/studyTiming';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { wordLang } from '../../../utils/lang';
import { renderHighlightedText } from '../highlightMarker';
import { gradeTypingAnswer } from './typoTolerance';

/*
  빈칸 직접 입력(fillInTheBlankTyping) — 계약: SENTENCE_QUESTIONS_CONTRACT.md 3-2절.
  화면 규격은 기존 빈칸 채우기(fillInTheBlank)와 같다 — 위 한국어 카드, 아래 영어 빈칸 카드.
  다른 점은 선택지 4개 대신 빈칸 pill 자리가 직접 입력 칸이 되고, 확인 버튼으로 채점한다.

  blank_text는 fillInTheBlank(<strong>)와 달리 이미 태그 없는 평문 + "____"(밑줄 2개 이상)
  마커다 — 서버가 정답을 감추기 위해 미리 지운 자리라 별도 파싱이 필요 없다.
*/
const BLANK_MARKER_RE = /_{2,}/;
const splitAtBlankMarker = (text) => {
  if (!text) return { before: '', after: '' };
  const m = text.match(BLANK_MARKER_RE);
  if (!m) return { before: text, after: '' };
  return { before: text.slice(0, m.index), after: text.slice(m.index + m[0].length) };
};

const FillInTheBlankTypingQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  const [value, setValue] = useState('');
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [gradeInfo, setGradeInfo] = useState(null); // { typo, reason }
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'shown' | 'answer' | null

  const inputRef = useRef(null);
  // 입력 칸 폭을 실제 입력 글자 폭에 맞추기 위한 숨김 미러 span 측정값(px).
  // size 속성(문자 수 기반 근사치)은 한글/볼드 폰트에서 실제 폭과 크게 어긋나
  // 칸이 글자보다 훨씬 넓어 보이는 문제가 있었다(2026-09-29).
  const measureRef = useRef(null);
  const [inputWidth, setInputWidth] = useState(null);
  const startTimeRef = useRef(Date.now());
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();
  const advanceGate = useStudyAdvanceGate();
  const wordTtsActiveRef = useRef(false);
  const speakGenRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const typing = question.typing ?? {};
  const {
    blank_text: blankText = '',
    answer_text: answerText = '',
    base_form: baseForm = '',
    ko = '',
    blocked_typos: blockedTypos = [],
  } = typing;
  const blankLang = wordLang(question);
  const { before, after } = splitAtBlankMarker(blankText);

  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  const speak = async (text, lang, target = null) => {
    if (!text) return;
    const gen = ++speakGenRef.current;
    if (wordTtsActiveRef.current) {
      wordTtsActiveRef.current = false;
      advanceGate.ttsEnd();
    }
    setIsSpeaking(true);
    setSpeakDuration(null);
    setSpeakingTarget(target);
    if (target === 'answer') {
      wordTtsActiveRef.current = true;
      advanceGate.ttsBegin();
    }
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); });
    } finally {
      if (gen === speakGenRef.current) setIsSpeaking(false);
      if (target === 'answer' && gen === speakGenRef.current) {
        wordTtsActiveRef.current = false;
        advanceGate.ttsEnd();
      }
    }
  };

  const speakShown = () => speak(stripHtmlTags(ko), 'ko', 'shown');

  useEffect(() => {
    speakShown();
    // 입력 화면이 뜨자마자 키보드가 바로 올라오면 스크롤/레이아웃이 급변해 등장 애니메이션이
    // 튀어 보인다 — 다음 프레임에 포커스한다(FillInTheBlankTyping 전용, 다른 유형엔 없음).
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    speakGenRef.current += 1;
  }, []);

  // 값이 바뀔 때마다(IME 조합 중 포함) 미러 span의 실제 렌더 폭을 읽어 입력 칸 폭에 반영.
  // 좌우 패딩 약 12px을 더한다 — 최소 폭은 아래 pill(min-w-[84px])이, 최대 폭은
  // input의 max-w-[50vw]가 각각 그대로 보장한다.
  useLayoutEffect(() => {
    if (measureRef.current) {
      setInputWidth(measureRef.current.offsetWidth + 12);
    }
  }, [value]);

  const handleCardClick = () => {
    haptic('light');
    speakShown();
  };

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (isAnswered || !value.trim()) return;

    const grade = gradeTypingAnswer(value, { answerText, baseForm, blockedTypos });
    const timeTakenMs = Date.now() - startTimeRef.current;

    if (grade.isCorrect) {
      haptic('success');
      playSuccessSound();
    } else {
      haptic('error');
      playErrorSound();
    }

    question.isCorrect = grade.isCorrect;

    {
      const optimisticStability = grade.isCorrect ? 3.13 : 0.5;
      question.prevMemoryStateKey = question.prevMemoryStateKey ?? prevStateKeyRef.current;
      question.nextMemoryStateKey = getMemoryStateKeyByStability(optimisticStability, 'learning');
    }

    setIsCorrect(grade.isCorrect);
    setGradeInfo(grade);
    setIsAnswered(true);

    const result = {
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: grade.isCorrect,
      timeTakenMs,
      updateData: { fsrs: question.fsrs, isCorrect: grade.isCorrect, updatedAt: new Date().toISOString() },
      // 계약 4절 — 오타 허용으로 정답 처리했으면 typo:true. processCardWord가 /study/log로 그대로 실어 보낸다.
      typo: !!grade.typo,
    };
    const processedNow = typeof onCardMatched === 'function';
    if (processedNow) onCardMatched(result);

    speak(answerText, blankLang, 'answer');

    advanceGate.arm({
      minDelayMs: getAdvanceDelay(grade.isCorrect),
      onAdvance: () => onCompleteRef.current?.([result], { processed: processedNow }),
    });
  };

  const showTtsRipple = isSpeaking && speakingTarget === 'shown';

  const pillStyle = !isAnswered
    ? 'border-layout-gray-200 dark:border-[#444444] bg-layout-white dark:bg-layout-black'
    : isCorrect
      ? 'border-status-success-500 text-status-success-600 bg-status-success-100'
      : 'border-status-error-500 text-status-error-600 bg-status-error-100 dark:bg-status-error-dark';

  const caption = isAnswered && gradeInfo?.reason === 'typo'
    ? { text: `오타가 있어요 · 정확한 철자 ${answerText}`, cls: 'text-layout-gray-400 dark:text-layout-gray-100' }
    : isAnswered && gradeInfo?.reason === 'baseForm'
      ? { text: `형태가 달라요 · 정답 ${answerText}`, cls: 'text-status-error-600' }
      : isAnswered && !isCorrect
        ? { text: `정답 ${answerText}`, cls: 'text-status-error-600' }
        : null;

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 위 카드 — 한국어 예문(강조). 카드 전체 탭 = 읽기(TTS) */}
      <motion.button
        type="button"
        aria-label="예문 듣기"
        className="
          relative overflow-hidden
          w-full px-[20px] py-[18px]
          rounded-[12px] text-left
          bg-primary-main-50 dark:bg-primary-main-dark
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
        onClick={handleCardClick}
      >
        <div className="relative z-[1] flex items-start gap-[12px]">
          <span className="relative flex-shrink-0 mt-[3px]">
            {showTtsRipple && (
              <TtsRipple
                size={90}
                duration={speakDuration}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
              />
            )}
            <motion.span
              className={`relative z-[1] transition-colors duration-200 ${showTtsRipple ? 'text-primary-main-600' : 'text-layout-gray-300'}`}
              animate={showTtsRipple && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={showTtsRipple && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              <SpeakerHigh size={22} weight="fill" />
            </motion.span>
          </span>
          <p className="text-[19px] font-[600] leading-[1.6] text-layout-black dark:text-layout-white break-keep">
            {(renderHighlightedText(ko) ?? []).map((p) => (
              <span key={p.key} className={p.hl ? 'text-primary-main-600 font-[700]' : undefined}>
                {p.text}
              </span>
            ))}
          </p>
        </div>
      </motion.button>

      {/* 아래 카드 — 빈칸 예문 + 직접 입력 */}
      <motion.div
        data-lift-card=""
        className="
          relative
          flex flex-col flex-1 min-h-0
          w-full
          rounded-[12px] text-left
          bg-layout-gray-50 dark:bg-layout-gray-dark
          overflow-hidden
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
        <div className="relative z-[1] flex items-center flex-1 min-h-0 px-[20px] py-[45px]">
          <LiftAboveBar active={!!farm} topReserve={28} className="w-full">
            <form onSubmit={handleSubmit}>
              <p className="w-full text-[22px] font-[700] leading-[1.8] text-layout-black dark:text-layout-white break-keep">
                <span>{before}</span>
                <span
                  className={`
                    relative
                    inline-flex items-center justify-center align-middle
                    min-w-[84px] px-[10px] mx-[2px]
                    rounded-[8px] border-[1px]
                    h-[40px] text-[17px] font-[700]
                    ${pillStyle}
                  `}
                >
                  {isAnswered ? (
                    value
                  ) : (
                    <>
                      {/* 실제 입력 글자 폭 측정용 숨김 미러 — input과 같은 폰트를 상속받는다. */}
                      <span
                        ref={measureRef}
                        aria-hidden="true"
                        className="absolute invisible whitespace-pre pointer-events-none"
                      >
                        {value}
                      </span>
                      <input
                        ref={inputRef}
                        type="text"
                        inputMode="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        autoComplete="off"
                        spellCheck={false}
                        enterKeyHint="done"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        style={inputWidth != null ? { width: `${inputWidth}px` } : undefined}
                        className="
                          bg-transparent outline-none text-center
                          text-layout-black dark:text-layout-white
                          max-w-[50vw]
                        "
                      />
                    </>
                  )}
                </span>
                <span>{after}</span>
              </p>
              {caption && (
                <p className={`mt-[14px] text-[14px] font-[600] break-keep ${caption.cls}`}>{caption.text}</p>
              )}
            </form>
          </LiftAboveBar>
        </div>

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

      {/* 확인 — 서비스 공용 primary CTA 규칙(분홍 bg-primary-main-600 활성 / 회색 비활성). */}
      <motion.button
        type="button"
        disabled={isAnswered || !value.trim()}
        whileTap={!isAnswered && value.trim() ? { scale: 0.97 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        onClick={handleSubmit}
        className={`
          flex-shrink-0
          h-[50px] rounded-[12px]
          text-[16px] font-[700]
          ${isAnswered || !value.trim()
            ? 'bg-layout-gray-200 dark:bg-[#2A2A2A] text-layout-gray-400 dark:text-layout-gray-300'
            : 'bg-primary-main-600 text-layout-white dark:text-layout-black'}
        `}
      >
        확인
      </motion.button>
    </div>
  );
};

export default FillInTheBlankTypingQuestion;
