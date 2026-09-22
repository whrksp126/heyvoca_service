import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle, X, SpeakerHigh } from '@phosphor-icons/react';
import FarmStatusBar from '../../../components/farm/FarmStatusBar';
import TtsRipple from '../../../components/common/TtsRipple';
import { haptic, pickVariant } from '../../../lib/feel';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';
import { getTextSound, stopCurrentSound, stripHtmlTags } from '../../../utils/common';
import { resolveTtsWithAlignment, findMuteSpan, playWithMutedSpan } from '../../../utils/blankTts';
import { getAdvanceDelay, ADVANCE_DELAY_GROW } from '../../../utils/studyTiming';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';

/*
  빈칸 채우기 — 두 방향이 같은 화면을 쓴다.
  - fillInTheBlank(ko2en):        위 = 한국어 예문(강조), 아래 = 영어 예문의 빈칸 → 선택지는 영어 단어(기본형)
  - fillInTheBlankReverse(en2ko): 위 = 영어 예문(강조),  아래 = 한국어 예문의 빈칸 → 선택지는 뜻

  카드가 둘로 나뉜다.
  - 위 카드(primary 틴트, 스피커 아이콘): 보여 주는 예문. 카드 전체 탭 = 이 예문 읽기(TTS).
    읽는 동안 스피커가 사지선다 듣기 모드처럼 맥동한다.
  - 아래 카드(회색, 스피커 아이콘): 빈칸 예문. 카드 전체 탭 = 이 예문 읽기.
    채점 전에는 빈칸 구간만 무음으로 읽고(utils/blankTts — 정답이 새지 않게), 채점 후에는
    빈칸이 채워진 문장을 그대로 읽는다. 자동 재생은 없다. O/X 와 농장 상태 바는 이 카드 안에 뜬다.
  - 선택지 탭: 탭한 선택지 텍스트를 읽는다(ko2en=영어 단어, en2ko=한국어 뜻).
  선택지·O/X·농장 상태 바 규격은 사지선다(takeTest/Main.jsx)와 같다 — 유형이 바뀔 때
  화면 문법이 달라 보이지 않게.
*/

const TARGET_WORD_RE = /<strong\b[^>]*\btarget-word\b[^>]*>([\s\S]*?)<\/strong\s*>/gi;
const stripTags = (html) => String(html ?? '').replace(/<[^>]*>/g, '');

// 강조 마커 부분만 primary 로 칠하고 나머지 태그는 벗겨 평문으로 그린다.
const renderHighlightedText = (html) => {
  if (!html) return null;
  const parts = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(TARGET_WORD_RE.source, 'gi');
  while ((match = re.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{stripTags(html.slice(lastIndex, match.index))}</span>);
    }
    parts.push(
      <span key={`h-${match.index}`} className="text-primary-main-600 font-[700]">
        {stripTags(match[1])}
      </span>
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < html.length) {
    parts.push(<span key={`t-${lastIndex}`}>{stripTags(html.slice(lastIndex))}</span>);
  }
  return parts;
};

// 빈칸 문장을 (앞 / 뒤) 평문으로 나눈다. 공백은 그대로 둔다(빈칸 pill 앞뒤 간격).
const splitAtBlank = (html) => {
  if (!html) return { before: '', after: '' };
  const re = new RegExp(TARGET_WORD_RE.source, 'i');
  const match = html.match(re);
  if (!match) return { before: stripTags(html), after: '' };
  return {
    before: stripTags(html.slice(0, match.index)),
    after: stripTags(html.slice(match.index + match[0].length)),
  };
};

// Main.jsx 는 testType 도 넘기지만 이 화면은 모드에 따라 달라지는 것이 없어 받지 않는다.
const FillInTheBlankQuestion = ({ question, onComplete, farmByWordId }) => {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 재생 길이(초) — TtsRipple을 실제 재생 시간에 동기화(Main.jsx의 speakDuration과 동일한 용도).
  const [speakDuration, setSpeakDuration] = useState(null);
  // 지금 재생 중인 게 "보여 주는 예문"(shown)인지 "빈칸 예문"(blank)인지 "탭한 선택지"(word)인지 —
  // 사지선다 reverseMultipleChoice의 speakingTarget('meaning'/'word')과 같은 역할.
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'shown' | 'blank' | 'word' | null
  const startTimeRef = useRef(Date.now());
  // 백그라운드 복귀 시 정답 링/성장 게이지가 최종 상태로 정적으로 스냅되는 것을 막기 위한
  // 재마운트용 키 (이유는 useResumeReplayKey 주석 참고)
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();

  const advanceTimerRef = useRef(null);
  const gradedAtRef = useRef(0);
  const advanceActionRef = useRef(null);
  // TTS 재생 세대 가드 — getTextSound 는 새 재생 시작 시 이전 재생을 강제 resolve 하므로
  // 연타 시 이전 재생의 finally 가 isSpeaking 을 false 로 덮지 않게 한다(Main.jsx 와 같은 방식).
  const speakGenRef = useRef(0);

  const scheduleAdvance = (totalMs) => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    const elapsed = Date.now() - gradedAtRef.current;
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null;
      advanceActionRef.current?.();
    }, Math.max(0, totalMs - elapsed));
  };

  // 채점 전 현재 암기 상태 캡처 — 판정은 MemoryStateChangeBadge 의 공용 함수를 쓴다.
  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const { shownText, blankText, blankFill, options = [], resultIndex } = question;
  const direction = question.direction ?? (question.questionType === 'fillInTheBlankReverse' ? 'en2ko' : 'ko2en');
  // 위 예문 언어 — ko2en 은 한국어 예문을 보여 주고, en2ko 는 영어 예문을 보여 준다.
  const shownLang = direction === 'ko2en' ? 'ko' : 'en';
  // 아래(빈칸) 예문 언어 — 위와 반대. 선택지 언어도 이와 같다(ko2en=영어 단어, en2ko=한국어 뜻).
  const blankLang = direction === 'ko2en' ? 'en' : 'ko';
  const { before, after } = splitAtBlank(blankText);

  // 농장 상태 바 — 카드 맞추기와 같은 경로(Main.processCardWord → cardFarmByWordId[wordId]).
  // 채점 전에는 절대 띄우지 않는다(문제 전환 직후 이전 문제 값이 한 프레임 남아 있을 수 있음).
  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  // 공용 재생 함수 — Main.jsx의 speakText와 동일한 세대 가드 방식(gen).
  // getTextSound는 새 재생 시작 시 이전 재생을 강제 resolve하므로, 빠르게 다음 문제로
  // 넘어가거나 카드를 연타해도 먼저 시작된 재생의 finally가 최신 상태를 덮어쓰지 않는다.
  const speak = async (text, lang, target = null) => {
    if (!text) return;
    const gen = ++speakGenRef.current;
    setIsSpeaking(true);
    setSpeakDuration(null);
    setSpeakingTarget(target);
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); });
    } finally {
      if (gen === speakGenRef.current) setIsSpeaking(false);
    }
  };

  const speakShown = () => {
    const text = stripHtmlTags(shownText);
    speak(text, shownLang, 'shown');
  };

  const handleCardClick = () => {
    haptic('light');
    speakShown();
  };

  /*
    아래 카드(빈칸 예문) 탭.
    - 채점 후: 빈칸이 채워졌으므로 문장을 그대로 읽는다(공용 getTextSound).
    - 채점 전: 정답이 새지 않게 빈칸 구간만 무음으로 읽는다(Web Audio, utils/blankTts).
      타이밍(alignment)이 없거나 빈칸 단어를 못 찾으면 아무것도 하지 않는다(소리도 파동도 없음).
      Web Audio 경로도 같은 세대 가드(speakGenRef)를 탄다 — resolve 를 기다리는 사이 다른
      재생이 시작되면 이 재생은 버린다.
  */
  const speakBlank = async () => {
    if (isAnswered) {
      speak(stripHtmlTags(blankText), blankLang, 'blank');
      return;
    }
    const text = stripHtmlTags(blankText);
    if (!text) return;
    const gen = ++speakGenRef.current;
    // 다른 카드가 읽는 중이면 먼저 끊는다 — getTextSound 가 호출 즉시 이전 재생을 끊는 것과 같은 규칙.
    // (이전 speak 의 finally 는 세대가 바뀌어 상태를 건드리지 못하므로 여기서 직접 내린다)
    stopCurrentSound();
    setIsSpeaking(false);
    setSpeakingTarget(null);

    const resolved = await resolveTtsWithAlignment(text, blankLang);
    if (gen !== speakGenRef.current) return;
    const span = resolved ? findMuteSpan(resolved.alignment, blankFill, blankLang) : null;
    if (!resolved?.url || !span) return; // alignment 없음/빈칸 미검출 → 아무것도 하지 않음

    // 소리가 날 것이 확정된 시점부터 파동/맥동 표시(mp3 다운로드·디코드 동안도 응답 중으로 보이게)
    setIsSpeaking(true);
    setSpeakDuration(null);
    setSpeakingTarget('blank');
    const handle = await playWithMutedSpan(resolved.url, span, {
      onMeta: (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); },
      onEnd: () => { if (gen === speakGenRef.current) setIsSpeaking(false); },
    });
    // 시작 실패(다운로드 실패·컨텍스트 없음) — onEnd 가 안 올 수 있으니 직접 내린다
    if (!handle && gen === speakGenRef.current) setIsSpeaking(false);
  };

  const handleBlankCardClick = () => {
    haptic('light');
    speakBlank();
  };

  // 문제 등장 시 자동 재생 — Main.jsx가 사지선다 등에서 하는 등장 자동재생과 같은 자리.
  // Main.jsx는 fillInTheBlank/fillInTheBlankReverse를 자기 자동재생 대상에서 뺀다(단어를
  // 읽으면 빈칸 정답이 드러남) — 대신 이 컴포넌트가 "보여 주는 예문" 쪽을 직접 읽는다.
  // 이 컴포넌트는 Main.jsx가 progressIndex를 key로 문제마다 새로 마운트하므로,
  // 마운트 시 1회 재생이 "문제가 바뀔 때마다 자동재생"과 동일하다.
  useEffect(() => {
    speakShown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOptionClick = (index) => {
    if (isAnswered) return;
    setSelectedIndex(index);

    const correct = index === resultIndex;
    const timeTakenMs = Date.now() - startTimeRef.current;

    if (correct) {
      haptic('success');
      playSuccessSound();
    } else {
      haptic('error');
      playErrorSound();
    }

    // FSRS 업데이트는 백엔드 /study/log 에서 처리(Main.processCardWord)
    question.isCorrect = correct;
    question.userResultIndex = index;

    // 결과 화면 '암기 상태 변화' 리스트용 낙관값 — 백엔드 응답 도착 시 확정값으로 덮임
    {
      const optimisticStability = correct ? 3.13 : 0.5;
      question.prevMemoryStateKey = question.prevMemoryStateKey ?? prevStateKeyRef.current;
      question.nextMemoryStateKey = getMemoryStateKeyByStability(optimisticStability, 'learning');
    }

    setIsCorrect(correct);
    setIsAnswered(true);

    /*
      선택지 탭 시 "탭한 선택지" 읽기 — 사지선다(Main.jsx)는 정답 단어만 읽지만, 이 화면은
      사용자가 고른 선택지를 그 언어로 읽어 준다(오답을 골랐으면 오답이 들린다 — 정답 표시는
      선택지 색으로 보인다). ko2en(fillInTheBlank)=영어 단어, en2ko(fillInTheBlankReverse)=한국어 뜻.
      채점 효과음이 시작된 직후 같은 타이밍에 재생한다.
    */
    const tapped = stripHtmlTags(options[index]);
    if (tapped) {
      speak(tapped, blankLang, 'word');
    }

    // 오답일 때는 더 천천히 다음 문제로 전환 (정답 1초 / 오답 2.5초).
    // 단계가 오른 정답은 아래 useEffect 가 2.2초로 다시 건다 — 진화 연출이 1초라 여기서 넘기면 잘린다.
    gradedAtRef.current = Date.now();
    advanceActionRef.current = () => onComplete([{
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: correct,
      timeTakenMs,
      updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
    }]);
    scheduleAdvance(getAdvanceDelay(correct));
  };

  /*
    전환 타이머 — 단계가 올랐으면 2.2초로 다시 건다.
    grew 는 /study/log 응답과 함께 farmByWordId 로 들어오는데, 그때는 이미 1초짜리
    타이머가 돌고 있다. 채점 시각 기준 절대 시간으로 다시 걸어, 응답이 늦게 왔더라도
    전체 지연이 2.2초가 되게 한다. 이미 넘어간 문제의 뒤늦은 응답은 대기 타이머가 없어 무시된다.
  */
  useEffect(() => {
    if (!farm?.grew) return;
    if (!advanceTimerRef.current) return;
    scheduleAdvance(ADVANCE_DELAY_GROW);
  }, [farm]);

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    speakGenRef.current += 1; // 언마운트 뒤 늦게 끝나는 재생이 상태를 건드리지 않게
  }, []);

  // 위 카드(예문) TtsRipple 노출 — 사지선다 카드와 같은 자리, "보여 주는 예문"을 읽는 동안만.
  const showTtsRipple = isSpeaking && speakingTarget === 'shown';
  // 아래 카드(빈칸 예문) TtsRipple 노출 — 빈칸 예문을 읽는 동안만. 둘이 동시에 켜지지 않는다.
  const showBlankRipple = isSpeaking && speakingTarget === 'blank';
  // 탭한 선택지에 스피커 표시 — 채점 후 탭한 선택지를 읽는 동안만.
  const wordSpeakerVisible = isAnswered && isSpeaking && speakingTarget === 'word';

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 위 카드 — 보여 주는 예문. 카드 전체 탭 = 읽기(TTS) */}
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
        <p className="relative z-[1] text-[19px] font-[600] leading-[1.6] text-layout-black dark:text-layout-white break-keep">
          {renderHighlightedText(shownText)}
        </p>

        {/* 워터마크 스피커 — 카드 정중앙, 텍스트 뒤에 깔린다. 평소엔 옅게, 읽는 동안 primary + 맥동.
            ripple 은 이 아이콘과 같은 앵커(카드 정중앙)에 겹쳐 그려 파동 중심이 아이콘과 일치하게 한다. */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none">
          {showTtsRipple && (
            <TtsRipple size={160} duration={speakDuration} className="z-[0]" />
          )}
          <motion.span
            className={`
              relative z-[1] transition-colors duration-200
              ${showTtsRipple ? 'text-primary-main-600 opacity-60' : 'text-layout-gray-300 opacity-30 dark:opacity-20'}
            `}
            animate={showTtsRipple && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={showTtsRipple && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
          >
            <SpeakerHigh size={60} weight="fill" />
          </motion.span>
        </div>
      </motion.button>

      {/* 아래 카드 — 빈칸 예문. 카드 전체 탭 = 읽기(채점 전엔 빈칸 구간 무음).
          <button> 이 아니라 role=button div 인 이유: 안에 <p>·농장 상태 바(블록 요소)가 들어가
          button 의 phrasing-content 제약을 어긴다. O/X 는 pointer-events-none 이라 탭을 막지 않는다. */}
      <motion.div
        role="button"
        tabIndex={0}
        aria-label="빈칸 예문 듣기"
        className="
          relative
          flex flex-col flex-1
          w-full
          rounded-[12px] text-left
          bg-layout-gray-50 dark:bg-layout-gray-dark
          overflow-hidden
          cursor-pointer select-none
          focus:outline-none
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        whileTap={{ scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
        onClick={handleBlankCardClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBlankCardClick(); }
        }}
      >
        <div className="relative z-[1] flex items-center flex-1 px-[20px] pt-[20px] pb-[60px]">
          {/* 빈칸 예문 — pill 은 채점 전후 모두 중립색, 채점 후 활용형이 들어간다 */}
          <p className="w-full text-[22px] font-[700] leading-[1.8] text-layout-black dark:text-layout-white break-keep">
            {before}
            <span
              className="
                inline-flex items-center justify-center align-middle
                min-w-[84px] h-[34px] px-[14px]
                rounded-[8px] border-[1px] border-layout-gray-200 dark:border-[#444444]
                bg-layout-white dark:bg-layout-black
                text-[17px] font-[700] text-layout-black dark:text-layout-white
              "
            >
              {isAnswered ? blankFill : ''}
            </span>
            {after}
          </p>
        </div>

        {/* 워터마크 스피커 — 위 카드와 같은 처리, 카드 정중앙에 텍스트 뒤로 깔린다.
            농장 상태 바는 하단에 뜨므로 중앙 워터마크와 겹치지 않아 숨길 필요가 없다. */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none">
          {showBlankRipple && (
            <TtsRipple size={160} duration={speakDuration} className="z-[0]" />
          )}
          <motion.span
            className={`
              relative z-[1] transition-colors duration-200
              ${showBlankRipple ? 'text-primary-main-600 opacity-60' : 'text-layout-gray-300 opacity-30 dark:opacity-20'}
            `}
            animate={showBlankRipple && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
            transition={showBlankRipple && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
          >
            <SpeakerHigh size={60} weight="fill" />
          </motion.span>
        </div>

        {/* O/X — 카드 중앙 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[3] pointer-events-none">
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

        {/* 하단 - 채점 후: 농장 상태 바 (작물·성장 막대·다음 복습일) */}
        {farm && (
          <motion.div
            key={`farmbar-${resumeReplayKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="absolute bottom-[14px] left-[14px] right-[14px] z-[2]"
          >
            <FarmStatusBar
              crop={farm.crop}
              stage={farm.stage}
              crop_from={farm.crop_from}
              stage_from={farm.stage_from}
              grew={!!farm.grew}
              pct_from={farm.pct_from}
              pct_to={farm.pct_to}
              health={farm.health}
              days_to_review={farm.days_to_review}
              wasCorrect={farm.wasCorrect}
              pending={!!farm.pending}
              sameDayElapsedHours={farm.sameDayElapsedHours ?? null}
            />
          </motion.div>
        )}
      </motion.div>

      {/* 선택지 4개 — 사지선다 버튼과 동일 */}
      <div className="flex flex-col gap-[10px]">
        {options.map((option, index) => {
          let btnStyle = 'border-layout-gray-200 text-layout-black dark:text-layout-white';
          const isWrongSelected = isCorrect === false && selectedIndex === index;
          if (isCorrect !== null && resultIndex === index) {
            btnStyle = 'border-status-success-500 text-status-success-600 bg-status-success-100';
          } else if (isWrongSelected) {
            btnStyle = 'border-status-error-500 text-status-error-600 bg-status-error-100 dark:bg-status-error-dark';
          }

          return (
            <motion.button
              key={index}
              whileTap={{ scale: 0.92, transition: { type: 'spring', stiffness: 400, damping: 17 } }}
              // 오답으로 확정되는 순간에만 흔들린다 — 매 렌더 재생되지 않도록 animate 값 자체를 조건부로 둔다.
              animate={isWrongSelected ? pickVariant('shake', reducedMotion).animate : undefined}
              onClick={() => {
                haptic('light');
                handleOptionClick(index);
              }}
              disabled={isAnswered}
              style={{ willChange: 'transform' }}
              className={`
                relative
                flex items-center justify-center
                w-full h-[50px]
                px-[20px]
                border-[1px] rounded-[10px]
                text-[14px] font-[700]
                text-center
                overflow-hidden
                whitespace-pre-line
                break-keep
                [display:-webkit-box]
                [-webkit-line-clamp:2]
                [-webkit-box-orient:vertical]
                ${btnStyle}
              `}
            >
              {option}
              {/* 채점 후 "탭한 선택지"를 읽는 동안만 그 선택지에 스피커 표시 —
                  사지선다 reverseMultipleChoice의 wordSpeakerVisible과 같은 표시(색은 선택지 상태를 따른다). */}
              {wordSpeakerVisible && index === selectedIndex && (
                <motion.span
                  className={`absolute right-[14px] top-1/2 -translate-y-1/2 ${isWrongSelected ? 'text-status-error-600' : 'text-status-success-600'}`}
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <SpeakerHigh size={14} weight="fill" />
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default FillInTheBlankQuestion;
