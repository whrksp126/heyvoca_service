import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Lightbulb } from '@phosphor-icons/react';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import StudyTimingTag from '../../../components/farm/StudyTimingTag';
import LiftAboveBar from '../../../components/common/LiftAboveBar';
import ResultMark from '../../../components/common/ResultMark';
import SpeakerArt from '../../../components/common/SpeakerArt';
import CardSpeakerButton from '../../../components/common/CardSpeakerButton';
import { buildDictMeaningView } from '../../../components/study/WordMeetCard';
import { feel, pickVariant, SPRING, ShineSweep, PerfectBadge } from '../../../lib/feel';
import { getTextSound } from '../../../utils/common';
import { getAdvanceDelay } from '../../../utils/studyTiming';
import { getDisplayMeanings } from '../../../utils/displayMeanings';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { wordLang, isJa } from '../../../utils/lang';
import { getReading } from '../../../utils/jaWord';
import {
  MAX_HINTS, toHiragana, buildSpellingCells, spellingAnswerOf,
  mapInputToCells, applyHint, gradeSpelling,
} from './spellingUtils';

/*
  단어 쓰기(spellingFill, 이슈 #21) — 뜻(위 카드)을 보고 단어 철자의 빈칸을 직접 입력한다.
  위 카드: 품사·뜻 + 뜻 듣기. 아래 카드: 철자 칸(앞 글자 일부 공개) + 힌트 알약 + 농장 상태 바
  (빈칸 고르기와 같은 배치, 2026-10-30).
  키보드는 OS 기본 가상 키보드 — 화면 밖 숨긴 input 하나에 입력받아 칸에 왼쪽부터 채운다.
  마지막 칸이 채워지는 순간 자동 채점(대소문자 무시, 오타 봐주기 없음) — 엔터·제출 버튼은 없다.
  Android 키보드는 영어도 조합(composition)으로 넣어서, 조합이 끝나기를 기다리면 칸이 다 찬 뒤
  다른 버튼(스피커)을 눌러 입력이 blur 될 때에야 채점됐다(2026-10-30 버그). 그래서 조합 중이어도
  라틴 문자는 바로 채점하고, 일본어는 조합 글자가 전부 가나로 확정된 모양일 때만 채점한다.
  스피커·힌트 버튼은 pointerdown 기본 동작을 막아 입력 포커스를 뺏지 않는다. 등장 시 뜻(한국어)을 자동으로 읽고
  (Main.jsx 공용 자동 재생은 origin 을 읽어 정답이 들리므로 쓰지 않는다 — 빈칸 쓰기처럼 컴포넌트가 직접 재생),
  채점 전에는 단어 소리를 내지 않는다(정답 노출). 진행은 빈칸 채우기와 같다 — 채점 즉시 onCardMatched, 넘기기는 공통 '다음' 버튼(advanceGate).
*/
const meaningTextOf = (m) => (m && typeof m === 'object' ? (m.meaning ?? m.text ?? '') : (m ?? ''));

// 품사 라벨 — 사전 상세(dictDetail)가 있으면 사용자 뜻과 겹치는 첫 품사, 없으면 표시하지 않는다.
const posLabelOf = (question) => {
  if (!question?.dictDetail) return null;
  const { groups } = buildDictMeaningView(question);
  const g = groups.find((x) => x.items.some((it) => it.hl)) ?? null;
  return g && g.pos !== '기타' ? g.pos : null;
};

const SpellingFillQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  const lang = wordLang(question);
  const ja = isJa(lang);
  const answer = spellingAnswerOf(question);
  const [cells] = useState(() => buildSpellingCells(answer));

  const [value, setValue] = useState('');
  const [hinted, setHinted] = useState(() => new Set());
  const [hintUsed, setHintUsed] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isPerfect, setIsPerfect] = useState(false);
  const [wrongCells, setWrongCells] = useState(() => new Set());
  const [focused, setFocused] = useState(false);
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'meaning' | 'answer' | null

  const inputRef = useRef(null);
  const composingRef = useRef(false);
  const gradedRef = useRef(false); // compositionend 와 change 가 같은 틱에 연달아 와도 한 번만 채점
  const startTimeRef = useRef(Date.now());
  const speakGenRef = useRef(0);
  const wordTtsActiveRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();
  const advanceGate = useStudyAdvanceGate();
  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const meanings = getDisplayMeanings((question.meanings || []).map(meaningTextOf).filter(Boolean));
  const meaningText = meanings.join(', ');
  const posLabel = posLabelOf(question);
  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  const { slots, filled } = mapInputToCells(cells, hinted, value);
  const currentCell = !isAnswered && focused ? slots.find((i) => filled[i] == null) ?? null : null;
  const hintsLeft = MAX_HINTS - hintUsed;
  const hintDisabled = isAnswered || hintsLeft <= 0 || slots.length <= 1;

  const speak = async (text, speakLang, target) => {
    if (!text) return;
    const gen = ++speakGenRef.current;
    if (wordTtsActiveRef.current) {
      wordTtsActiveRef.current = false;
      advanceGate.ttsEnd();
    }
    setSpeakingTarget(target);
    if (target === 'answer') {
      wordTtsActiveRef.current = true;
      advanceGate.ttsBegin();
    }
    try {
      await getTextSound(text, speakLang);
    } finally {
      if (gen === speakGenRef.current) setSpeakingTarget(null);
      if (target === 'answer' && gen === speakGenRef.current) {
        wordTtsActiveRef.current = false;
        advanceGate.ttsEnd();
      }
    }
  };
  const speakMeaning = () => speak(meaningText, 'ko', 'meaning');
  const speakWord = () => speak(question.origin || answer, lang, 'answer');

  useEffect(() => {
    speakMeaning();
    // 키보드가 등장 애니메이션과 겹치지 않게 조금 늦게 포커스(빈칸 입력과 같은 규칙)
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { speakGenRef.current += 1; }, []);

  const grade = (nextValue, nextHinted, usedHints) => {
    if (gradedRef.current) return;
    gradedRef.current = true;
    const g = gradeSpelling(cells, nextHinted, nextValue);
    const timeTakenMs = Date.now() - startTimeRef.current;
    const perfect = g.isCorrect && usedHints === 0 && !question.isRetry;
    feel(perfect ? 'perfect' : (g.isCorrect ? 'correct' : 'wrong'));
    setIsPerfect(perfect);

    question.isCorrect = g.isCorrect;
    question.prevMemoryStateKey = question.prevMemoryStateKey ?? prevStateKeyRef.current;
    question.nextMemoryStateKey = getMemoryStateKeyByStability(g.isCorrect ? 3.13 : 0.5, 'learning');

    setWrongCells(g.wrong);
    setIsCorrect(g.isCorrect);
    setIsAnswered(true);
    inputRef.current?.blur(); // 키보드를 내려 결과와 '다음' 버튼이 보이게

    const result = {
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: g.isCorrect,
      timeTakenMs,
      updateData: { fsrs: question.fsrs, isCorrect: g.isCorrect, updatedAt: new Date().toISOString() },
      // 정답 + 힌트 사용 → /study/log hint_used(백엔드가 FSRS Hard 로 처리). processCardWord 가 실어 보낸다.
      hintUsed: usedHints,
    };
    const processedNow = typeof onCardMatched === 'function';
    if (processedNow) onCardMatched(result);

    speakWord(); // 채점 후에만 단어 소리
    advanceGate.arm({
      minDelayMs: getAdvanceDelay(g.isCorrect),
      onAdvance: () => onCompleteRef.current?.([result], { processed: processedNow }),
    });
  };

  // 입력값 정리 + 칸이 다 차면 채점. 일본어 IME 조합 중에는 가나로 다 확정된 모양이 아니면
  // 채점·자르기를 하지 않는다(로마자 'n' 처럼 아직 변환 전 글자가 남아 있을 수 있다).
  const commitValue = (raw, nextHinted = hinted, usedHints = hintUsed) => {
    if (isAnswered || gradedRef.current) return;
    if (composingRef.current && ja) {
      const cap = mapInputToCells(cells, nextHinted, '').slots.length;
      const chars = Array.from(String(raw ?? '')).filter((ch) => /[\p{L}\p{N}ー]/u.test(ch));
      const allKana = chars.every((ch) => /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(ch));
      if (!(allKana && chars.length >= cap && cap > 0)) { setValue(raw); return; }
    }
    let v = Array.from(String(raw ?? '')).filter((ch) => /[\p{L}\p{N}ー]/u.test(ch));
    if (ja) v = v.map(toHiragana);
    else v = v.map((ch) => ch.toLowerCase());
    const cap = mapInputToCells(cells, nextHinted, '').slots.length;
    const next = v.slice(0, cap).join('');
    if (Array.from(next).length !== Array.from(value).length) feel('tap');
    setValue(next);
    if (Array.from(next).length === cap && cap > 0) grade(next, nextHinted, usedHints);
  };

  const handleHint = (e) => {
    e.stopPropagation();
    if (hintDisabled) return;
    const res = applyHint(cells, hinted, value);
    if (!res) return;
    feel('tap');
    const used = hintUsed + 1;
    setHinted(res.hinted);
    setHintUsed(used);
    commitValue(res.value, res.hinted, used);
    inputRef.current?.focus();
  };

  const focusInput = () => {
    if (isAnswered) return;
    inputRef.current?.focus();
  };

  const cellClass = (i, c) => {
    if (c.kind === 'fixed') return 'border-transparent text-layout-gray-400';
    if (isAnswered) {
      if (c.kind === 'given') return 'border-transparent text-layout-gray-400';
      if (hinted.has(i)) return 'border-transparent text-primary-main-600';
      return wrongCells.has(i)
        ? 'border-status-error-500 text-status-error-600 dark:text-status-error-300'
        : 'border-status-success-500 text-status-success-600 dark:text-status-success-300';
    }
    if (c.kind === 'given') return 'border-transparent text-layout-gray-400';
    if (hinted.has(i)) return 'border-transparent text-primary-main-600';
    if (i === currentCell) return 'border-primary-main-600 text-layout-black dark:text-layout-white';
    return 'border-layout-gray-300 dark:border-[#555555] text-layout-black dark:text-layout-white';
  };
  const cellText = (i, c) => {
    if (c.kind === 'fixed') return c.ch === ' ' ? '' : c.ch;
    if (c.kind === 'given' || hinted.has(i)) return c.ch;
    return filled[i] ?? '';
  };

  const showMeaningSpeaking = speakingTarget === 'meaning';
  const reading = ja ? getReading(question) : '';

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 위 카드 — 품사 + 뜻(빈칸 고르기의 보여 주는 예문 카드와 같은 자리·색). 스피커는 뜻(한국어)만 읽는다 */}
      <motion.div
        className="
          relative flex-shrink-0
          w-full px-[20px] py-[18px]
          rounded-[12px] text-left
          bg-primary-main-50 dark:bg-primary-main-dark
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
      >
        <div className="flex items-start gap-[12px]">
          <div className="flex-1 min-w-0">
            {posLabel && (
              <p className="mb-[4px] text-[12px] font-[700] text-layout-gray-400 dark:text-layout-gray-100">{posLabel}</p>
            )}
            <p className="text-[19px] font-[700] leading-[1.5] text-layout-black dark:text-layout-white break-keep">
              {meaningText}
            </p>
          </div>
          <motion.button
            type="button"
            aria-label="뜻 듣기"
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="relative flex-shrink-0 mt-[3px]"
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); feel('tap'); speakMeaning(); }}
          >
            <motion.span
              className={`relative z-[1] transition-colors duration-200 ${showMeaningSpeaking ? 'text-primary-main-600' : 'text-layout-gray-300'}`}
              animate={showMeaningSpeaking && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={showMeaningSpeaking && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              <SpeakerArt size={22} playing={showMeaningSpeaking} />
            </motion.span>
          </motion.button>
        </div>
      </motion.div>
      {/* 아래 카드 — 철자 칸 + 힌트 + 농장 상태 바(빈칸 고르기의 빈칸 카드와 같은 자리·색). 카드 탭 = 입력 포커스(키보드 올리기). */}
      <motion.div
        data-lift-card=""
        className="
          relative overflow-hidden
          flex flex-col flex-1 min-h-0
          w-full rounded-[12px]
          bg-layout-gray-50 dark:bg-layout-gray-dark
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
        onClick={focusInput}
      >
        <StudyTimingTag
          answered={isAnswered}
          fsrs={question.fsrs}
          stage={question.farmStage}
          farm={farm}
          wasCorrect={isCorrect}
          isRetry={!!question.isRetry}
        />
        <div className="relative z-[1] flex items-center justify-center flex-1 min-h-0 px-[16px] py-[45px]">
          <LiftAboveBar active={!!farm} topReserve={28} className="w-full">
            <div className="relative flex flex-col items-center gap-[16px]">
              <PerfectBadge show={isPerfect && isAnswered} />
              <motion.div
                lang={ja ? 'ja' : undefined}
                animate={isAnswered ? pickVariant(isCorrect ? 'correctPop' : 'shake', reducedMotion).animate : undefined}
                className="relative flex flex-wrap justify-center gap-x-[4px] gap-y-[10px]"
                aria-label="단어 철자 입력 칸"
              >
                <ShineSweep play={isAnswered && isCorrect === true} />
                {cells.map((c, i) => (c.ch === ' '
                  ? <span key={i} className="w-[12px]" aria-hidden="true" />
                  : (
                    <span
                      key={i}
                      className={`
                        flex items-end justify-center
                        ${ja ? 'w-[30px]' : 'w-[22px]'} h-[36px] pb-[2px]
                        border-b-[2.5px]
                        text-[24px] font-[700] leading-none
                        transition-colors duration-150
                        ${cellClass(i, c)}
                      `}
                    >
                      {cellText(i, c)}
                    </span>
                  )))}
              </motion.div>

              {!isAnswered && (
                <button
                  type="button"
                  disabled={hintDisabled}
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleHint}
                  aria-label={`힌트, ${hintsLeft}번 남음`}
                  className={`
                    inline-flex items-center gap-[6px]
                    px-[12px] py-[6px] rounded-full
                    border-[1px] border-layout-gray-200 dark:border-[#444444]
                    bg-layout-white dark:bg-layout-black
                    text-[13px] font-[700] text-layout-gray-500 dark:text-layout-gray-100
                    transition-opacity duration-150
                    ${hintDisabled ? 'opacity-40' : ''}
                  `}
                >
                  <Lightbulb size={15} weight="bold" aria-hidden="true" />
                  힌트
                  <span className="inline-flex gap-[3px] ml-[2px]" aria-hidden="true">
                    {Array.from({ length: MAX_HINTS }).map((_, k) => (
                      <span
                        key={k}
                        className={`w-[5px] h-[5px] rounded-full ${k < hintsLeft ? 'bg-primary-main-600' : 'bg-layout-gray-300 dark:bg-[#555555]'}`}
                      />
                    ))}
                  </span>
                </button>
              )}

              {isAnswered && !isCorrect && (
                <motion.div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-[8px]"
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reducedMotion ? { duration: 0.15 } : SPRING.soft}
                >
                  <span className="flex-shrink-0 text-[13px] font-[700] text-layout-gray-400 dark:text-layout-gray-100">정답 단어</span>
                  <span
                    lang={ja ? 'ja' : undefined}
                    className="
                      inline-flex items-center gap-[4px]
                      min-h-[34px] px-[12px] rounded-[8px] border-[1px]
                      text-[18px] font-[800] leading-[1.2]
                      border-status-success-500
                      text-status-success-600 dark:text-status-success-300
                      bg-status-success-100 dark:bg-status-success-dark
                    "
                  >
                    <Check size={15} weight="bold" aria-hidden="true" className="flex-shrink-0" />
                    {question.origin}
                    {ja && reading && reading !== question.origin && (
                      <span className="text-[13px] font-[700] opacity-80">{reading}</span>
                    )}
                  </span>
                </motion.div>
              )}
            </div>
          </LiftAboveBar>
        </div>

        {/* OS 기본 키보드를 띄우는 숨긴 입력 — 화면에는 칸만 보인다 */}
        <input
          ref={inputRef}
          type="text"
          lang={ja ? 'ja' : 'en'}
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="철자 입력"
          disabled={isAnswered}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(e) => { composingRef.current = false; commitValue(e.currentTarget.value); }}
          onChange={(e) => commitValue(e.target.value)}
          className="absolute left-0 bottom-0 w-[1px] h-[1px] opacity-0 text-[16px] pointer-events-none"
        />

        <ResultMark
          result={isCorrect}
          replayKey={resumeReplayKey}
          className="absolute inset-0 z-[3] flex items-center justify-center pointer-events-none"
        />

        <FarmResultBar
          farm={farm}
          replayKey={resumeReplayKey}
          onAnimStart={advanceGate.farmStarted}
          onSettled={advanceGate.farmSettled}
          trailing={
            <CardSpeakerButton
              playing={speakingTarget === 'answer'}
              onPress={speakWord}
            />
          }
        />
      </motion.div>

    </div>
  );
};

export default SpellingFillQuestion;
