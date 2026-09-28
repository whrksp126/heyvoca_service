import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle, X, SpeakerHigh } from '@phosphor-icons/react';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import StudyTimingTag from '../../../components/farm/StudyTimingTag';
import TtsRipple from '../../../components/common/TtsRipple';
import LiftAboveBar from '../../../components/common/LiftAboveBar';
import WordInfoBubble from '../../../components/common/WordInfoBubble';
import { getWordInfoApi } from '../../../api/search';
import { haptic } from '../../../lib/feel';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';
import { getTextSound, stripHtmlTags } from '../../../utils/common';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { useKoreanWordLookup } from '../../../hooks/useKoreanWordLookup';
import { tokenizeKoreanParts } from '../../../utils/koreanTokenize';
import { wordLang, isJa } from '../../../utils/lang';
import { renderHighlightedText } from '../highlightMarker';
import { gradeTypingAnswer } from './typoTolerance';

/*
  빈칸 예문(before/after) 탭 가능한 단어 토큰화 — en/ja 공통. fillInTheBlank의 tokenizeWords와
  달리 이 문제 유형은 reading_tokens(후리가나)가 payload에 없어 띄어쓰기 대신 유니코드 문자
  범주(letter/number)로 단어 조각을 묶는다 — 가나·한자도 그대로 한 토큰으로 잡혀 en/ja 모두
  별도 분기 없이 동작한다. 공백·구두점은 'text'로 그대로 보존해 원문 줄바꿈이 그대로다.
*/
const WORD_RUN_RE = /[\p{L}\p{N}''']+/gu;
const tokenizeBlankWords = (text) => {
  if (!text) return [];
  const tokens = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RUN_RE)) {
    if (m.index > last) tokens.push({ type: 'text', text: text.slice(last, m.index) });
    tokens.push({ type: 'word', text: m[0], clean: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', text: text.slice(last) });
  return tokens;
};

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
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'shown' | 'answer' | 'lookup' | null
  /*
    단어 말풍선(사전 조회) 상태 — fillInTheBlank와 동일 패턴. 아래 카드(영어/일본어 빈칸 예문)
    단어 탭 전용. 위 카드(한국어) 어절 탭은 useKoreanWordLookup(koLookup)이 별도로 맡는다.
  */
  const [lookup, setLookup] = useState(null);
  const lookupReqRef = useRef(0);
  const koLookup = useKoreanWordLookup();

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
  // 채점 후 "다음" 버튼을 누를 때 진행할 콜백(2026-09-29) — 출력형 문제는 자동으로 안 넘어가고
  // 사용자가 직접 눌러야 진행한다.
  const nextRef = useRef(null);

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
  const jaBlank = isJa(blankLang);
  const { before, after } = splitAtBlankMarker(blankText);
  const beforeTokens = tokenizeBlankWords(before);
  const afterTokens = tokenizeBlankWords(after);
  // 정답 칸(입력/결과 pill)도 채점 후에는 탭 가능하다 — 입력값을 그대로 조회 대상으로 쓴다.
  const answerClean = value.trim();

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

  const closeLookup = () => {
    lookupReqRef.current += 1;
    setLookup((prev) => (prev ? null : prev));
  };

  /*
    아래 카드(영어/일본어 빈칸 예문) 단어 탭 — fillInTheBlank의 handleWordTap과 동일 패턴.
    입력 칸(빈칸 자리)·문장부호는 tokenizeBlankWords가 애초에 'word' 토큰으로 만들지 않으므로
    여기서는 별도 제외 처리가 필요 없다. 채점 후에는 정답 pill(answer-*)도 같은 핸들러를 탄다.
  */
  const handleWordTap = (e, key, cleanWord) => {
    e.stopPropagation();
    if (!cleanWord) return;
    if (lookup?.key === key) {
      closeLookup();
      return;
    }
    const wordEl = e.currentTarget;
    if (!wordEl) return;
    const wordRect = wordEl.getBoundingClientRect();
    const anchor = {
      top: wordRect.top,
      left: wordRect.left,
      width: wordRect.width,
      height: wordRect.height,
    };

    haptic('light');
    speak(cleanWord, blankLang, 'lookup');

    const reqId = ++lookupReqRef.current;
    setLookup({ key, word: cleanWord, anchor, status: 'loading', info: null });
    getWordInfoApi(cleanWord)
      .then((info) => {
        if (reqId !== lookupReqRef.current) return;
        setLookup((prev) => (prev && prev.key === key
          ? { ...prev, status: info ? 'found' : 'notFound', info }
          : prev));
      })
      .catch(() => {
        if (reqId !== lookupReqRef.current) return;
        setLookup((prev) => (prev && prev.key === key ? { ...prev, status: 'error' } : prev));
      });
  };

  // 말풍선 닫기 — 바깥 탭·스크롤(fillInTheBlank와 동일 규칙).
  useEffect(() => {
    if (!lookup) return undefined;
    const onPointerDown = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) { closeLookup(); return; }
      if (t.closest('[data-word-info-bubble]')) return;
      if (t.closest('[data-lookup-word]')) return;
      closeLookup();
    };
    const onScroll = () => closeLookup();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup?.key]);

  /*
    탭 가능한 단어 토큰 렌더 — 공백/구두점은 평문, 단어는 인라인 버튼(fillInTheBlank와 동일 규격).
  */
  const renderWordTokens = (tokens, area) => tokens.map((tok, i) => {
    const key = `${area}-${i}`;
    if (tok.type !== 'word') return <span key={key}>{tok.text}</span>;
    const active = lookup?.key === key;
    return (
      <button
        key={key}
        type="button"
        data-lookup-word
        aria-label={`${tok.clean} 뜻 보기`}
        aria-expanded={active}
        className={`
          inline font-[inherit] text-[inherit] leading-[inherit] text-left align-baseline
          rounded-[4px] px-[1px]
          focus:outline-none
          transition-colors duration-150
          ${active
            ? 'underline decoration-dotted decoration-2 underline-offset-[6px] decoration-layout-gray-300 bg-primary-main-50 dark:bg-primary-main-dark'
            : ''}
        `}
        onClick={(e) => handleWordTap(e, key, tok.clean)}
      >
        {tok.text}
      </button>
    );
  });

  /*
    위 카드(한국어 예문) 어절 탭 렌더 — fillInTheBlank와 동일 패턴 + 정답 유출 방지 규칙 추가:
    강조된 목표 어절(tok.hl)은 **채점 전에는 탭 비활성**(정답을 알려주는 셈이 되므로) — 채점 후엔
    다른 어절과 동일하게 조회 가능해진다.
  */
  const shownKoTokens = tokenizeKoreanParts(renderHighlightedText(ko) ?? []);
  const renderShownKoreanTokens = () => shownKoTokens.map((tok, i) => {
    if (tok.type !== 'word' || (tok.hl && !isAnswered)) {
      return <span key={i} className={tok.hl ? 'text-primary-main-600 font-[700]' : undefined}>{tok.text}</span>;
    }
    const key = `ko-${i}`;
    const active = koLookup.lookup?.key === key;
    return (
      <span
        key={i}
        role="button"
        tabIndex={0}
        data-ko-lookup-word
        aria-label={`${tok.clean} 뜻 보기`}
        aria-expanded={active}
        className={`
          inline cursor-pointer rounded-[4px] px-[1px]
          transition-colors duration-150
          ${tok.hl ? 'text-primary-main-600 font-[700]' : ''}
          ${active ? 'underline decoration-dotted decoration-2 underline-offset-[6px] decoration-layout-gray-300 bg-layout-white/70 dark:bg-layout-black/25' : ''}
        `}
        onClick={(e) => koLookup.handleTap(e, key, tok.clean)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); koLookup.handleTap(e, key, tok.clean); }
        }}
      >
        {tok.text}
      </span>
    );
  });

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

    closeLookup(); // 채점 순간 말풍선은 닫힌다(O/X 와 겹치지 않게, fillInTheBlank와 동일 규칙)
    koLookup.closeLookup();

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

    // 자동으로 넘어가지 않는다(2026-09-29) — 결과를 보여준 채로 대기하다가 사용자가 "다음"을
    // 눌러야 진행한다. onCardMatched는 이미 채점 즉시 처리했다(로그 전송·재출제 타이밍 동일).
    nextRef.current = () => onCompleteRef.current?.([result], { processed: processedNow });
  };

  const handleNext = () => {
    haptic('light');
    nextRef.current?.();
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
      {/* 위 카드 — 한국어 예문(강조). 카드 자체는 탭 동작 없음 — 왼쪽 스피커 아이콘을 눌러야
          읽는다(2026-09-29, 예전엔 카드 전체 탭 = TTS 였다). */}
      <motion.div
        className="
          relative overflow-hidden
          w-full px-[20px] py-[18px]
          rounded-[12px] text-left
          bg-primary-main-50 dark:bg-primary-main-dark
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
      >
        <div className="relative z-[1] flex items-start gap-[12px]">
          <motion.button
            type="button"
            aria-label="예문 듣기"
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="relative flex-shrink-0 mt-[3px]"
            onClick={handleCardClick}
          >
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
          </motion.button>
          <p className="text-[19px] font-[600] leading-[1.6] text-layout-black dark:text-layout-white break-keep">
            {renderShownKoreanTokens()}
          </p>
        </div>

        {/* 어절 사전 말풍선 — document.body 포털(WordInfoBubble)이라 카드가 짧아도 잘리지 않는다. */}
        <AnimatePresence>
          {koLookup.lookup && (
            <WordInfoBubble
              key={koLookup.lookup.key}
              anchor={koLookup.lookup.anchor}
              status={koLookup.lookup.status}
              results={koLookup.lookup.results}
              notFoundMessage="사전에서 찾지 못했어요"
            />
          )}
        </AnimatePresence>
      </motion.div>

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
              <p lang={jaBlank ? 'ja' : undefined} className={`w-full text-[22px] font-[700] leading-[1.8] text-layout-black dark:text-layout-white ${jaBlank ? 'break-normal' : 'break-keep'}`}>
                {renderWordTokens(beforeTokens, 'b')}
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
                    // 채점 후 — 정답 자리도 탭하면 사전 말풍선이 뜬다(입력값을 그대로 조회한다).
                    <button
                      type="button"
                      data-lookup-word
                      aria-label={`${answerClean} 뜻 보기`}
                      aria-expanded={lookup?.key === 'answer'}
                      className={`
                        inline font-[inherit] text-[inherit] leading-[inherit]
                        focus:outline-none
                      `}
                      onClick={(e) => handleWordTap(e, 'answer', answerClean)}
                    >
                      {value}
                    </button>
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
                        lang={jaBlank ? 'ja' : 'en'}
                        inputMode="text"
                        autoCapitalize="off"
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
                {renderWordTokens(afterTokens, 'a')}
              </p>
              {caption && (
                <p className={`mt-[14px] text-[14px] font-[600] break-keep ${caption.cls}`}>{caption.text}</p>
              )}
            </form>
          </LiftAboveBar>
        </div>

        {/* 단어 뜻 말풍선 — O/X(z-3) 위(z-4). 채점 시 닫히므로 실제로 겹치는 일은 거의 없다. */}
        <AnimatePresence>
          {lookup && (
            <WordInfoBubble
              key={lookup.key}
              anchor={lookup.anchor}
              status={lookup.status}
              info={lookup.info}
              speaking={isSpeaking && speakingTarget === 'lookup'}
              onReplay={() => {
                haptic('light');
                speak(lookup.word, blankLang, 'lookup');
              }}
            />
          )}
        </AnimatePresence>

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

      {/* 확인/다음 — 서비스 공용 primary CTA 규칙(분홍 bg-primary-main-600 활성 / 회색 비활성).
          채점 후에는 자동으로 넘어가지 않고 "다음"으로 바뀐다(2026-09-29) — 사용자가 결과를
          직접 확인하고 눌러야 진행한다. */}
      <motion.button
        type="button"
        disabled={!isAnswered && !value.trim()}
        whileTap={isAnswered || value.trim() ? { scale: 0.97 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        onClick={isAnswered ? handleNext : handleSubmit}
        className={`
          flex-shrink-0
          h-[50px] rounded-[12px]
          text-[16px] font-[700]
          ${!isAnswered && !value.trim()
            ? 'bg-layout-gray-200 dark:bg-[#2A2A2A] text-layout-gray-400 dark:text-layout-gray-300'
            : 'bg-primary-main-600 text-layout-white'}
        `}
      >
        {isAnswered ? '다음' : '확인'}
      </motion.button>
    </div>
  );
};

export default FillInTheBlankTypingQuestion;
