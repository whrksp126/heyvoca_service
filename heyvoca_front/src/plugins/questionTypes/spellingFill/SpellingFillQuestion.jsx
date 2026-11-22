import { useState, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Lightbulb } from '@phosphor-icons/react';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import StudyTimingTag from '../../../components/farm/StudyTimingTag';
import LiftAboveBar from '../../../components/common/LiftAboveBar';
import ResultMark from '../../../components/common/ResultMark';
import GiveUpButton from '../../../components/common/GiveUpButton';
import SpeakerArt from '../../../components/common/SpeakerArt';
import CardSpeakerButton from '../../../components/common/CardSpeakerButton';
import { buildDictMeaningView } from '../../../components/study/WordMeetCard';
import { feel, pickVariant, SPRING, ShineSweep } from '../../../lib/feel';
import { getTextSound } from '../../../utils/common';
import { getAdvanceDelay } from '../../../utils/studyTiming';
import { getDisplayMeanings } from '../../../utils/displayMeanings';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { useManualAdvancePending } from '../../../hooks/useStudyAdvanceGate';
import { wordLang, isJa } from '../../../utils/lang';
import { getReading } from '../../../utils/jaWord';
import {
  MAX_HINTS, toHiragana, buildSpellingCells, spellingAnswerOf,
  mapInputToCells, applyHint, gradeSpelling, splitInput, normChar,
} from './spellingUtils';

/*
  단어 쓰기(spellingFill, 이슈 #21) — 뜻(위 카드)을 보고 단어 철자의 빈칸을 직접 입력한다.
  위 카드: 품사·뜻 + 뜻 듣기. 아래 카드: 철자 칸(앞 글자 일부 공개) + 힌트 알약 + 농장 상태 바
  (빈칸 고르기와 같은 배치, 2026-10-30).
  키보드는 OS 기본 가상 키보드 — 화면 밖 숨긴 input 하나에 입력받아 칸에 왼쪽부터 채운다.
  칸이 다 차도 자동 채점하지 않는다(2026-11-22) — 하단 '확인' 버튼(또는 키보드 엔터/완료)을 눌러야 채점한다
  (대소문자 무시, 오타 봐주기 없음). 일본어 IME 는 칸이 찼을 때도 아직 조합·변환 중일 수 있어 자동 채점이
  오답을 만들었다. 입력 state(value)는 IME 가 쓰는 원본을 그대로 두고, 화면·채점은 sanitize() 한 값(정답
  글자셋 밖 문장부호 제거·가나 정규화·칸 수 자르기)을 쓴다. 확인을 누르는 순간엔 DOM 값을 다시 읽어 조합 중
  글자까지 반영한다.
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

  const [value, setValue] = useState(() => splitInput(cells, new Set(), '', ja).full); // IME 원본 — 화면·채점은 sanitize(value)
  const [hinted, setHinted] = useState(() => new Set());
  const [hintUsed, setHintUsed] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [wrongCells, setWrongCells] = useState(() => new Set());
  const [gaveUp, setGaveUp] = useState(false); // '모르겠어요'로 채점됐는지 — 빈 칸을 정답 글자(오답색)로 채워 보인다
  const [focused, setFocused] = useState(false);
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'meaning' | 'answer' | null

  const inputRef = useRef(null);
  const composingRef = useRef(false);
  const gradedRef = useRef(false); // 엔터·버튼이 연달아 와도 한 번만 채점
  const startTimeRef = useRef(Date.now());
  const speakGenRef = useRef(0);
  const wordTtsActiveRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();
  const advanceGate = useStudyAdvanceGate();
  const manualAdvance = useManualAdvancePending();
  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const meanings = getDisplayMeanings((question.meanings || []).map(meaningTextOf).filter(Boolean));
  const meaningText = meanings.join(', ');
  const posLabel = posLabelOf(question);
  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  // 원본 입력 → 칸에 들어갈 값(앞쪽 공개 글자 prefix 는 빼고, 글자·숫자·장음만, 칸 수 상한).
  const sanitize = (raw, nextHinted = hinted) => splitInput(cells, nextHinted, raw, ja).typed;
  // 숨은 input 에 실제로 넣을 값 = prefix + 입력 칸 글자(상한 적용)
  const fullOf = (raw, nextHinted = hinted) => splitInput(cells, nextHinted, raw, ja).full;
  const inputCap = splitInput(cells, hinted, '', ja).prefix.length + mapInputToCells(cells, hinted, '').slots.length;
  const forceEnd = (el) => {
    if (!el) return;
    const n = el.value.length;
    try { el.setSelectionRange(n, n); } catch { /* 일부 브라우저는 무시 */ }
  };
  const clean = sanitize(value);
  const capNow = mapInputToCells(cells, hinted, '').slots.length;
  const canSubmit = !isAnswered && capNow > 0 && Array.from(clean).length >= capNow;

  const { slots, filled } = mapInputToCells(cells, hinted, clean);
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

  // giveUp — '모르겠어요'(2026-11-19 QA). 칸을 다 채우지 않았어도 지금 입력 그대로 오답 채점한다.
  // 이후 흐름(정답 공개·다음 버튼·오답 재출제·/study/log·사전 테스트 모름 분류)은 일반 오답과 같은 경로다.
  const grade = (rawValue, nextHinted, usedHints, { giveUp = false } = {}) => {
    if (gradedRef.current) return;
    gradedRef.current = true;
    const nextValue = sanitize(rawValue, nextHinted);
    const graded = gradeSpelling(cells, nextHinted, nextValue);
    const g = giveUp ? { ...graded, isCorrect: false } : graded;
    const timeTakenMs = Date.now() - startTimeRef.current;
    // 다른 단어 유형과 같은 O/X 채점만 쓴다 — '완벽해요' 배지는 띄우지 않는다(이슈 #25 6차 QA).
    feel(g.isCorrect ? 'correct' : 'wrong');

    question.isCorrect = g.isCorrect;
    question.prevMemoryStateKey = question.prevMemoryStateKey ?? prevStateKeyRef.current;
    question.nextMemoryStateKey = getMemoryStateKeyByStability(g.isCorrect ? 3.13 : 0.5, 'learning');

    setWrongCells(g.wrong);
    if (giveUp) setGaveUp(true);
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

  // 입력 변경 — 어느 순간에도 input 의 실제 값이 (앞 공개 글자 + 칸 수) 이하이고 허용 글자만이도록 즉시 바로잡는다.
  // 조합(IME) 중이라도 허용되지 않는 글자(영어의 숫자·기호, 일본어의 가나 아닌 글자)와 상한 초과분은 즉시 잘라 DOM 에 다시 쓰고
  // 조합을 끝낸다(삼성 키보드는 영어도 예측 때문에 조합 중 입력하므로 '조합 끝나면 자른다'를 기다리면 영영 안 온다).
  // 조합 중 정상 값(가나 조합 중, 로마자 중간 상태)은 건드리지 않는다. 채점은 하지 않는다 — 확인 버튼/엔터로만.
  const endCompositionSoon = (el) => {
    // 값을 다시 쓰면 대부분 조합이 풀린다. 그래도 조합 상태로 남아 있으면 재포커스로 끝낸다.
    requestAnimationFrame(() => {
      if (!composingRef.current || !el.isConnected) return;
      composingRef.current = false;
      el.blur();
      el.focus();
      forceEnd(el);
    });
  };
  const handleChange = (e) => {
    if (isAnswered || gradedRef.current) return;
    const el = e.target;
    const raw = el.value;
    const isComp = composingRef.current || !!e.nativeEvent?.isComposing;
    if (isComp) {
      const fit = splitInput(cells, hinted, raw, ja, true).full;
      if (fit !== raw) {
        el.value = fit;
        forceEnd(el);
        setValue(fit);
        feel('tap');
        endCompositionSoon(el);
        return;
      }
      setValue(raw);
      return;
    }
    const full = fullOf(raw);
    if (Array.from(sanitize(raw)).length !== Array.from(clean).length) feel('tap');
    if (el.value !== full) el.value = full;
    forceEnd(el);
    setValue(full);
  };

  // 글자가 들어오기 직전 — 취소할 수 있으면(대부분의 직접 입력) 허용되지 않는 글자·상한 초과를 여기서 막는다.
  // Android WebView 의 조합 중 beforeinput 은 취소가 안 되는 경우가 있어, 그때는 handleChange 가 잘라 쓴다.
  const handleBeforeInput = (e) => {
    const ne = e.nativeEvent;
    const data = ne?.data;
    if (!data || !ne.cancelable || isAnswered || gradedRef.current) return;
    if (ne.inputType !== 'insertText' && ne.inputType !== 'insertCompositionText' && ne.inputType !== 'insertFromPaste') return;
    const el = e.currentTarget;
    const hasSel = el.selectionStart !== el.selectionEnd;
    const next = hasSel
      ? el.value.slice(0, el.selectionStart) + data + el.value.slice(el.selectionEnd)
      : el.value.slice(0, el.selectionStart ?? el.value.length) + data + el.value.slice(el.selectionEnd ?? el.value.length);
    const isComp = ne.inputType === 'insertCompositionText';
    // 일본어 조합 중 로마자 중간 상태는 허용 — 조합 입력은 handleChange 에서만 판정한다
    if (isComp && ja) return;
    const fit = splitInput(cells, hinted, next, ja, isComp).full;
    if (Array.from(fit).length < Array.from(next).length || (!isComp && normChar(fit) !== normChar(next))) {
      e.preventDefault();
      feel('tap');
    }
  };

  // 확인 — 지금 DOM 값(조합 중 글자 포함)을 기준으로 채점. 칸이 덜 찼으면 무시.
  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (isAnswered || gradedRef.current) return;
    const raw = inputRef.current?.value ?? value;
    if (Array.from(sanitize(raw)).length < capNow || capNow <= 0) return;
    composingRef.current = false;
    grade(raw, hinted, hintUsed);
  };

  const handleGiveUp = () => {
    if (isAnswered || gradedRef.current) return;
    composingRef.current = false;
    grade(inputRef.current?.value ?? value, hinted, hintUsed, { giveUp: true });
  };

  const handleHint = (e) => {
    e.stopPropagation();
    if (hintDisabled) return;
    const res = applyHint(cells, hinted, clean);
    if (!res) return;
    feel('tap');
    const used = hintUsed + 1;
    setHinted(res.hinted);
    setHintUsed(used);
    setValue(fullOf(res.value, res.hinted));
    inputRef.current?.focus();
  };

  const focusInput = () => {
    if (isAnswered) return;
    inputRef.current?.focus();
  };

  const cellClass = (i, c) => {
    if (c.kind === 'fixed') return 'border-transparent text-layout-gray-400';
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

  // 채점 후 표시용 — 칸별 글자(공백·기호·공개·힌트·입력)를 이어 붙이고, 틀린 칸이 연속된 구간끼리 묶는다.
  const writtenRuns = [];
  if (isAnswered) {
    cells.forEach((c, i) => {
      // '모르겠어요'(2026-11-19 2차) — 비워 둔 입력 칸도 정답 글자로 채운다. gradeSpelling 이 빈 칸을
      // 이미 틀린 칸으로 세므로 오답색으로 칠해져, 전부 틀리게 입력해 낸 오답과 같은 모습이 된다.
      const typed = filled[i] ?? (gaveUp ? c.ch : '');
      const ch = c.kind === 'fixed' ? c.ch : (c.kind === 'given' || hinted.has(i) ? c.ch : typed);
      if (!ch) return;
      const wrong = wrongCells.has(i);
      const last = writtenRuns[writtenRuns.length - 1];
      if (last && last.wrong === wrong) last.text += ch;
      else writtenRuns.push({ text: ch, wrong });
    });
  }

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
        <div className="relative z-[1] flex flex-col flex-1 min-h-0 overflow-y-auto px-[16px] py-[45px]">
          <LiftAboveBar active={!!farm} topReserve={28} className="w-full my-auto">
            <div className="relative flex flex-col items-center gap-[16px]">
              <motion.div
                lang={ja ? 'ja' : undefined}
                animate={isAnswered ? pickVariant(isCorrect ? 'correctPop' : 'shake', reducedMotion).animate : undefined}
                className={isAnswered
                  ? 'relative max-w-full text-center break-words'
                  : 'relative flex flex-wrap justify-center gap-x-[4px] gap-y-[10px]'}
                aria-label={isAnswered ? `내가 쓴 철자 ${writtenRuns.map((r) => r.text).join('')}` : '단어 철자 입력 칸'}
              >
                <ShineSweep play={isAnswered && isCorrect === true} />
                {isAnswered ? (
                  // 채점 후 — 칸을 걷고 내가 쓴 철자를 한 단어로 이어 쓴다(구는 단어 사이 공백만).
                  // 틀린 글자 구간만 빨간색, 나머지는 일반 텍스트. O/X 는 공용 ResultMark 가 띄운다.
                  <span className="whitespace-pre-wrap text-[28px] font-[800] leading-[1.25] tracking-[-0.01em] text-layout-black dark:text-layout-white">
                    {writtenRuns.map((r, k) => (r.wrong
                      ? <span key={k} className="text-status-error-600 dark:text-status-error-300">{r.text}</span>
                      : <span key={k}>{r.text}</span>))}
                  </span>
                ) : cells.map((c, i) => (c.ch === ' '
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
                <div className="flex items-center gap-[14px]">
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
                </div>
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

        {/* 모르겠어요 — 칸을 다 채우지 않아도 바로 오답 처리(2026-11-19 QA). 2차: 힌트 옆 → 카드 안 중앙 하단,
            과하지 않은 텍스트 버튼. 채점 뒤에는 숨겨 농장 상태 바 자리와 겹치지 않는다 */}
        <GiveUpButton visible={!isAnswered} onClick={handleGiveUp} />

        {/* OS 기본 키보드를 띄우는 숨긴 입력 — 화면에는 칸만 보인다 */}
        <input
          ref={inputRef}
          type="text"
          lang={ja ? 'ja' : 'en'}
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-label="철자 입력"
          disabled={isAnswered}
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          data-keep-chrome=""
          data-no-autoscroll=""
          onBeforeInput={handleBeforeInput}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            if (isAnswered || gradedRef.current) return;
            const el = e.currentTarget;
            const full = fullOf(el.value);
            if (el.value !== full) el.value = full; // DOM 값도 상한으로 되돌린다
            forceEnd(el);
            setValue(full);
          }}
          onSelect={(e) => {
            const el = e.currentTarget;
            if (composingRef.current || el.selectionStart === el.value.length && el.selectionEnd === el.value.length) return;
            forceEnd(el); // 커서는 항상 끝
          }}
          maxLength={ja ? undefined : inputCap}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (e.nativeEvent?.isComposing || composingRef.current) return; // 변환 확정용 엔터는 IME 가 처리
            handleSubmit();
          }}
          onChange={handleChange}
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

      {/* 확인 — 칸이 다 차야 활성(빈칸 입력과 같은 primary CTA). 채점 뒤엔 Main 의 공용 '다음' 버튼이 이어받고,
          그 버튼이 뜨기 전 짧은 사이엔 같은 자리에 비활성 '다음' 으로 자리를 지켜 레이아웃이 튀지 않게 한다. */}
      {(!isAnswered || !manualAdvance) && (
        <motion.button
          type="button"
          disabled={isAnswered || !canSubmit}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSubmit}
          whileTap={canSubmit ? { scale: 0.97 } : undefined}
          animate={canSubmit ? pickVariant('correctPop', reducedMotion).animate : undefined}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          className={`
            flex-shrink-0 mt-[-1px]
            h-[50px] rounded-[12px]
            text-[16px] font-[700] tracking-[-0.03em]
            transition-colors duration-150
            ${canSubmit
              ? 'bg-primary-main-600 text-layout-white'
              : 'bg-layout-gray-200 dark:bg-[#2A2A2A] text-layout-gray-400 dark:text-layout-gray-300 pointer-events-none'}
          `}
        >
          {isAnswered ? '다음' : '확인'}
        </motion.button>
      )}
    </div>
  );
};

export default SpellingFillQuestion;
