import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle, X, SpeakerHigh } from '@phosphor-icons/react';
import FarmStatusBar from '../../../components/farm/FarmStatusBar';
import TtsRipple from '../../../components/common/TtsRipple';
import WordInfoBubble from '../../../components/common/WordInfoBubble';
import { getWordInfoApi } from '../../../api/search';
import { haptic, pickVariant } from '../../../lib/feel';
import { playSuccessSound, playErrorSound } from '../../../utils/audio';
import { getTextSound, stripHtmlTags } from '../../../utils/common';
import { getAdvanceDelay, ADVANCE_DELAY_GROW } from '../../../utils/studyTiming';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { wordLang, isJa } from '../../../utils/lang';
import { getReading, shouldShowReading } from '../../../utils/jaWord';
import { useShowFurigana } from '../../../context/ExampleSettingsContext';

/*
  빈칸 채우기(fillInTheBlank) — 한 방향뿐이다.
  위 = 한국어 예문(강조), 아래 = 영어 예문의 빈칸 → 선택지는 영어 단어(기본형)

  카드가 둘로 나뉜다.
  - 위 카드(primary 틴트, 스피커 아이콘): 한국어 예문. 카드 전체 탭 = 이 예문 읽기(TTS).
    읽는 동안 스피커가 사지선다 듣기 모드처럼 맥동한다. 마운트 시 1회 자동 재생.
  - 아래 카드(회색): 영어 빈칸 예문. 카드 자체에는 탭 인터랙션이 없다(누름 효과·클릭 없음).
    O/X 와 농장 상태 바는 이 카드 안에 뜬다.
    영어 예문의 **각 단어는 채점 전후 언제나 탭할 수 있다**(듀오링고 방식) — 탭하면 그 단어를
    읽고(TTS) 단어 아래에 뜻 말풍선(WordInfoBubble)이 뜬다. 빈칸 pill 은 탭 대상이 아니다.
    말풍선은 바깥 탭·선택지 탭·채점·스크롤·문제 전환에 닫힌다. 한 번에 하나만 뜬다.
  - 선택지 탭: 탭한 선택지(영어 단어)를 읽는다.
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

/*
  영어 문장을 "탭 가능한 단어" 토큰으로 나눈다. 공백은 그대로 보존해 줄바꿈 위치가 평문과 같다.
  구두점은 화면에는 단어에 붙여 보여 주되, 사전 조회/TTS 에는 벗긴 단어(clean)만 쓴다.
  예: "Hello," → text "Hello,", clean "hello"
  clean 이 비면(순수 구두점·기호) 탭 대상이 아니다.
*/
const WORD_EDGE_PUNCT_RE = /^[^A-Za-z0-9'’]+|[^A-Za-z0-9'’]+$/g;
const tokenizeWords = (text) => {
  if (!text) return [];
  return text.split(/(\s+)/).filter((t) => t !== '').map((t) => {
    if (/^\s+$/.test(t)) return { type: 'space', text: t };
    const clean = t.replace(WORD_EDGE_PUNCT_RE, '');
    return { type: clean ? 'word' : 'text', text: t, clean };
  });
};

/*
  일본어 빈칸 문장 토큰화 — 띄어쓰기가 없어 공백 분리를 쓸 수 없다.
  reading_tokens([[surface, reading|null(, okurigana)]...], 이어 붙이면 빈칸 원문 plain)를
  plain 위에 놓고 [segStart, segEnd) 구간(빈칸 앞/뒤)에 걸치는 토큰만 잘라 낸다.
  - 구간에 온전히 들어온 토큰: 탭 가능(가나·한자·영숫자가 있을 때) + 읽기(ruby) 표시 가능
  - 빈칸 경계에 잘린 토큰: 평문(탭·ruby 없음 — 잘린 조각의 읽기를 알 수 없다)
  reading_tokens 가 없거나 plain 과 맞지 않으면 null → 호출부가 탭 없는 평문으로 그린다.
*/
const JA_TAPPABLE_RE = /[\u3040-\u30ff\u3400-\u9fffA-Za-z0-9\uff10-\uff19\uff21-\uff5a]/;
const tokenizeJa = (readingTokens, plain, segStart, segEnd) => {
  if (!Array.isArray(readingTokens) || readingTokens.length === 0) return null;
  const joined = readingTokens.map((t) => (Array.isArray(t) ? String(t[0] ?? '') : '')).join('');
  if (joined !== plain) return null;
  const out = [];
  let pos = 0;
  for (const tok of readingTokens) {
    const surface = String(tok[0] ?? '');
    const start = pos;
    const end = pos + surface.length;
    pos = end;
    if (!surface || end <= segStart || start >= segEnd) continue;
    const clipped = start < segStart || end > segEnd;
    const text = surface.slice(Math.max(segStart, start) - start, Math.min(segEnd, end) - start);
    if (!text) continue;
    if (clipped || /^\s+$/.test(text)) {
      out.push({ type: 'text', text });
      continue;
    }
    const reading = tok[1] ? String(tok[1]) : null;
    const okurigana = tok[2] ? String(tok[2]) : '';
    const hasOkuri = !!okurigana && surface.endsWith(okurigana) && surface.length > okurigana.length;
    out.push({
      type: JA_TAPPABLE_RE.test(text) ? 'word' : 'text',
      text,
      clean: text,
      reading,
      base: hasOkuri ? surface.slice(0, surface.length - okurigana.length) : surface,
      okurigana: hasOkuri ? okurigana : '',
    });
  }
  return out;
};

// 선택지("word") TTS 가 끝난 뒤 다음 문제로 넘어가기까지 얹는 여유(ms) — 말이 끝나자마자
// 화면이 넘어가 버리지 않게 한다.
const WORD_TTS_ADVANCE_GRACE_MS = 200;
// 선택지 TTS 가 최소 지연(minReadyAt) 기준 이 시간 안에 끝나지 않으면(네트워크 지연 등)
// 기다리지 않고 강제로 넘어간다.
const WORD_TTS_ADVANCE_WATCHDOG_MS = 4000;

// Main.jsx 는 testType 도 넘기지만 이 화면은 모드에 따라 달라지는 것이 없어 받지 않는다.
const FillInTheBlankQuestion = ({ question, onComplete, farmByWordId }) => {
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 재생 길이(초) — TtsRipple을 실제 재생 시간에 동기화(Main.jsx의 speakDuration과 동일한 용도).
  const [speakDuration, setSpeakDuration] = useState(null);
  // 지금 재생 중인 게 "보여 주는 예문"(shown)인지 "탭한 선택지"(word)인지 "단어 조회"(lookup)인지 —
  // 사지선다 reverseMultipleChoice의 speakingTarget('meaning'/'word')과 같은 역할.
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'shown' | 'word' | 'lookup' | null
  /*
    단어 말풍선(사전 조회) 상태 — 한 번에 하나만.
    { key, word, anchor: {top,left,width,height}, container: {width,height}, status, info }
    key 는 "영역-토큰인덱스" 로 같은 단어가 문장에 두 번 나와도 구분된다.
  */
  const [lookup, setLookup] = useState(null);
  const lookupReqRef = useRef(0); // 늦게 도착한 이전 단어의 응답이 현재 말풍선을 덮지 않게
  const blankCardRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  // 백그라운드 복귀 시 정답 링/성장 게이지가 최종 상태로 정적으로 스냅되는 것을 막기 위한
  // 재마운트용 키 (이유는 useResumeReplayKey 주석 참고)
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();

  const advanceTimerRef = useRef(null);
  const gradedAtRef = useRef(0);
  const advanceActionRef = useRef(null);
  const advanceFiredRef = useRef(false);
  // 최소 지연(getAdvanceDelay/ADVANCE_DELAY_GROW)을 절대 시각으로 환산해 둔 값 — grew 로
  // 다시 걸리면(아래 useEffect) 이 값만 늘어난다.
  const minReadyAtRef = useRef(0);
  // 탭한 선택지("word") TTS 재생 상태 — 실제 전환 시각은
  // max(minReadyAt, wordTtsEndedAt + WORD_TTS_ADVANCE_GRACE_MS) 다.
  const wordTtsActiveRef = useRef(false);
  const wordTtsEndedAtRef = useRef(null);
  // TTS 재생 세대 가드 — getTextSound 는 새 재생 시작 시 이전 재생을 강제 resolve 하므로
  // 연타 시 이전 재생의 finally 가 isSpeaking 을 false 로 덮지 않게 한다(Main.jsx 와 같은 방식).
  const speakGenRef = useRef(0);

  // 실제 전환을 1회만 수행한다 — 워치독 타이머 / TTS 종료 콜백 / 재검사(attemptAdvance) 등
  // 여러 경로에서 중복 호출될 수 있다.
  const doAdvance = () => {
    if (advanceFiredRef.current) return;
    advanceFiredRef.current = true;
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    advanceActionRef.current?.();
  };

  /*
    다음 문제로 넘어갈 준비가 됐는지 검사하고, 아니면 스스로를 다음 확인 시점에 다시 건다.
    - 최소 지연(minReadyAtRef)이 아직이면 그때까지 대기.
    - 선택지 TTS 가 재생 중이면(wordTtsActiveRef) 끝날 때까지 대기하되, 네트워크 지연 등으로
      끝나지 않으면 워치독(WORD_TTS_ADVANCE_WATCHDOG_MS)에서 강제로 넘긴다.
    - 재생이 이미 끝났으면(wordTtsEndedAtRef) 그 시각 + 200ms 까지 대기.
    - 선택지 TTS 자체가 시작되지 않았으면(예: 빈 텍스트) 제약 없이 바로 넘어간다.
  */
  const attemptAdvance = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (advanceFiredRef.current) return;

    const now = Date.now();
    const minReadyAt = minReadyAtRef.current;

    if (now < minReadyAt) {
      advanceTimerRef.current = setTimeout(attemptAdvance, minReadyAt - now);
      return;
    }

    if (wordTtsActiveRef.current) {
      const watchdogAt = minReadyAt + WORD_TTS_ADVANCE_WATCHDOG_MS;
      if (now >= watchdogAt) {
        doAdvance();
        return;
      }
      advanceTimerRef.current = setTimeout(attemptAdvance, watchdogAt - now);
      return;
    }

    const wordReadyAt = wordTtsEndedAtRef.current != null
      ? wordTtsEndedAtRef.current + WORD_TTS_ADVANCE_GRACE_MS
      : -Infinity; // 선택지 TTS 가 아예 시작되지 않았으면 제약 없음

    if (now < wordReadyAt) {
      advanceTimerRef.current = setTimeout(attemptAdvance, wordReadyAt - now);
      return;
    }

    doAdvance();
  };

  // 최소 지연을 절대 시각으로 걸고 즉시 준비 상태를 검사한다.
  const scheduleAdvance = (totalMs) => {
    minReadyAtRef.current = gradedAtRef.current + totalMs;
    attemptAdvance();
  };

  // 채점 전 현재 암기 상태 캡처 — 판정은 MemoryStateChangeBadge 의 공용 함수를 쓴다.
  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const { shownText, blankText, blankFill, options = [], resultIndex } = question;
  // 위 예문 = 한국어, 아래(빈칸) 예문·선택지 = 영어. 방향은 하나뿐이다.
  const shownLang = 'ko';
  const blankLang = wordLang(question);
  const jaBlank = isJa(blankLang);
  const showFurigana = useShowFurigana();
  const { before, after } = splitAtBlank(blankText);
  // ja: 띄어쓰기 기준 토큰화가 불가능 — reading_tokens 가 있으면 토큰 단위, 없으면 탭 비활성 평문.
  const jaPlain = jaBlank ? stripTags(blankText) : '';
  const jaBeforeTokens = jaBlank
    ? tokenizeJa(question.blankReadingTokens, jaPlain, 0, before.length)
    : null;
  const jaAfterTokens = jaBlank
    ? tokenizeJa(question.blankReadingTokens, jaPlain, jaPlain.length - after.length, jaPlain.length)
    : null;
  const beforeTokens = jaBlank
    ? (jaBeforeTokens ?? [{ type: 'text', text: before }])
    : tokenizeWords(before);
  const afterTokens = jaBlank
    ? (jaAfterTokens ?? [{ type: 'text', text: after }])
    : tokenizeWords(after);

  // 농장 상태 바 — 카드 맞추기와 같은 경로(Main.processCardWord → cardFarmByWordId[wordId]).
  // 채점 전에는 절대 띄우지 않는다(문제 전환 직후 이전 문제 값이 한 프레임 남아 있을 수 있음).
  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  // 공용 재생 함수 — Main.jsx의 speakText와 동일한 세대 가드 방식(gen).
  // getTextSound는 새 재생 시작 시 이전 재생을 강제 resolve하므로, 빠르게 다음 문제로
  // 넘어가거나 카드를 연타해도 먼저 시작된 재생의 finally가 최신 상태를 덮어쓰지 않는다.
  const speak = async (text, lang, target = null) => {
    if (!text) return;
    const gen = ++speakGenRef.current;
    // 새 재생이 시작되면 getTextSound 의 세대 가드가 이전 재생을 강제로 끊는다 — 그게 아직
    // 끝나지 않은 "선택지(word)" 재생이었다면, 전환 대기가 영영 끝나지 않는 일이 없도록 여기서
    // 바로 종료 처리한다. 이 새 재생이 "shown"(상단 카드 탭)이어도 마찬가지 — 대기를 늘리지
    // 않고 오히려 앞당길 뿐이라 "shown 재생이 대기를 늘리면 안 된다"는 요구와도 맞는다.
    if (wordTtsActiveRef.current) {
      wordTtsActiveRef.current = false;
      wordTtsEndedAtRef.current = Date.now();
      attemptAdvance();
    }
    setIsSpeaking(true);
    setSpeakDuration(null);
    setSpeakingTarget(target);
    // 'word'(탭한 선택지)만 전환을 붙잡는다 — 'lookup'(예문 단어 탭)은 전환 대기와 무관하다.
    if (target === 'word') {
      wordTtsActiveRef.current = true;
      wordTtsEndedAtRef.current = null;
    }
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); });
    } finally {
      if (gen === speakGenRef.current) setIsSpeaking(false);
      // 정상 종료·에러(getTextSound reject) 모두 여기로 온다 — 이 재생이 여전히 최신(세대 일치)
      // 일 때만 종료로 기록한다(세대가 바뀌었으면 위 선점 처리에서 이미 기록됨).
      if (target === 'word' && gen === speakGenRef.current) {
        wordTtsActiveRef.current = false;
        wordTtsEndedAtRef.current = Date.now();
        attemptAdvance();
      }
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

  const closeLookup = () => {
    lookupReqRef.current += 1;
    setLookup((prev) => (prev ? null : prev));
  };

  /*
    영어 예문 단어 탭 — 단어를 읽고 말풍선을 연다. 같은 단어를 다시 탭하면 닫힌다.
    위치는 단어 버튼과 아래 카드의 getBoundingClientRect 차이로 구한다(카드는 relative +
    overflow-hidden 이라 말풍선은 카드 안 좌표계에 놓인다). 카드 자체에는 탭 인터랙션이 없지만,
    상위로 이벤트가 번지지 않게 stopPropagation은 유지한다. scale 나눗셈은 만약을 대비한
    방어 코드(카드가 변형되는 경우가 없어도 무해하다).
  */
  const handleWordTap = (e, key, cleanWord) => {
    e.stopPropagation();
    if (lookup?.key === key) {
      closeLookup();
      return;
    }
    const cardEl = blankCardRef.current;
    const wordEl = e.currentTarget;
    if (!cardEl || !wordEl) return;
    const cardRect = cardEl.getBoundingClientRect();
    const wordRect = wordEl.getBoundingClientRect();
    const scale = cardEl.offsetWidth ? (cardRect.width / cardEl.offsetWidth) || 1 : 1;
    const anchor = {
      top: (wordRect.top - cardRect.top) / scale,
      left: (wordRect.left - cardRect.left) / scale,
      width: wordRect.width / scale,
      height: wordRect.height / scale,
    };
    const container = { width: cardEl.offsetWidth, height: cardEl.offsetHeight };

    haptic('light');
    speak(cleanWord, blankLang, 'lookup');

    const reqId = ++lookupReqRef.current;
    setLookup({ key, word: cleanWord, anchor, container, status: 'loading', info: null });
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

  // 말풍선 닫기 — 바깥 탭(말풍선 밖 어디든; 단어 버튼은 자기 onClick 이 토글/전환을 맡으므로 제외) · 스크롤
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

  // 탭 가능한 단어 토큰 렌더 — 공백/구두점은 평문, 단어는 인라인 버튼
  // ja 토큰 탭 — TTS 만(말풍선 생략: 일본어 단어 뜻 조회 API 가 아직 없다)
  const handleJaTokenTap = (e, text) => {
    e.stopPropagation();
    haptic('light');
    closeLookup();
    speak(text, blankLang, 'lookup');
  };

  const renderJaTokens = (tokens, area) => tokens.map((tok, i) => {
    const key = `${area}-${i}`;
    if (tok.type !== 'word') return <span key={key}>{tok.text}</span>;
    const body = showFurigana && tok.reading
      ? (
        <>
          <ruby>{tok.base}<rt>{tok.reading}</rt></ruby>
          {tok.okurigana}
        </>
      )
      : tok.text;
    return (
      <button
        key={key}
        type="button"
        aria-label={`${tok.clean} 듣기`}
        className="inline font-[inherit] text-[inherit] leading-[inherit] text-left align-baseline rounded-[4px] focus:outline-none"
        onClick={(e) => handleJaTokenTap(e, tok.clean)}
      >
        {body}
      </button>
    );
  });

  const renderWordTokens = (tokens, area) => (jaBlank ? renderJaTokens(tokens, area) : tokens.map((tok, i) => {
    if (tok.type !== 'word') return <span key={`${area}-${i}`}>{tok.text}</span>;
    const key = `${area}-${i}`;
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
  }));

  // 문제 등장 시 자동 재생 — Main.jsx가 사지선다 등에서 하는 등장 자동재생과 같은 자리.
  // Main.jsx는 fillInTheBlank를 자기 자동재생 대상에서 뺀다(단어를
  // 읽으면 빈칸 정답이 드러남) — 대신 이 컴포넌트가 "보여 주는 예문" 쪽을 직접 읽는다.
  // 이 컴포넌트는 Main.jsx가 progressIndex를 key로 문제마다 새로 마운트하므로,
  // 마운트 시 1회 재생이 "문제가 바뀔 때마다 자동재생"과 동일하다.
  useEffect(() => {
    speakShown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOptionClick = (index) => {
    if (isAnswered) return;
    closeLookup(); // 채점 순간 말풍선은 닫힌다(O/X 와 겹치지 않게)
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

    // 오답일 때는 더 천천히 다음 문제로 전환 (정답 1초 / 오답 2.5초).
    // 단계가 오른 정답은 아래 useEffect 가 2.2초로 다시 건다 — 진화 연출이 1초라 여기서 넘기면 잘린다.
    // 실제 전환 시각은 이 최소 지연과 "탭한 선택지" TTS 종료(+200ms) 중 늦은 쪽이다
    // (speak/attemptAdvance 참고 — 말이 채 끝나기 전에 화면이 넘어가지 않게).
    gradedAtRef.current = Date.now();
    advanceActionRef.current = () => onComplete([{
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: correct,
      timeTakenMs,
      updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
    }]);

    /*
      선택지 탭 시 "탭한 선택지" 읽기 — 사지선다(Main.jsx)는 정답 단어만 읽지만, 이 화면은
      사용자가 고른 선택지를 그 언어로 읽어 준다(오답을 골랐으면 오답이 들린다 — 정답 표시는
      선택지 색으로 보인다). 영어 단어를 읽는다.
      채점 효과음이 시작된 직후 같은 타이밍에 재생한다.
    */
    const tapped = stripHtmlTags(options[index]);
    if (tapped) {
      speak(tapped, blankLang, 'word');
    }

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
    if (advanceFiredRef.current) return; // 이미 넘어갔으면 늦게 도착한 grew 는 무시
    scheduleAdvance(ADVANCE_DELAY_GROW);
  }, [farm]);

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceFiredRef.current = true; // 언마운트 뒤 늦게 끝나는 word TTS 가 attemptAdvance 를 다시 돌리지 않게
    speakGenRef.current += 1; // 언마운트 뒤 늦게 끝나는 재생이 상태를 건드리지 않게
  }, []);

  // 위 카드(예문) TtsRipple 노출 — 사지선다 카드와 같은 자리, "보여 주는 예문"을 읽는 동안만.
  const showTtsRipple = isSpeaking && speakingTarget === 'shown';

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
        <div className="relative z-[1] flex items-start gap-[12px]">
          {/* 스피커 아이콘 — 텍스트 왼쪽. 평소엔 회색, 읽는 동안 primary + 맥동.
              ripple 은 이 아이콘과 같은 앵커(relative span)에 겹쳐 그려 파동 중심이 아이콘과 일치하게 한다. */}
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
            {renderHighlightedText(shownText)}
          </p>
        </div>
      </motion.button>

      {/* 아래 카드 — 빈칸 예문. 카드 자체에는 탭 인터랙션이 없다(정답 유출 방지 + 요청에 따라
          누름 효과도 없앰) — role/aria/onClick/whileTap 을 아예 붙이지 않는다.
          <button> 이 아니라 div 인 이유: 안에 <p>·농장 상태 바(블록 요소)가 들어가
          button 의 phrasing-content 제약을 어긴다. O/X 는 pointer-events-none 이라 탭을 막지 않는다. */}
      <motion.div
        ref={blankCardRef}
        className="
          relative
          flex flex-col flex-1
          w-full
          rounded-[12px] text-left
          bg-layout-gray-50 dark:bg-layout-gray-dark
          overflow-hidden
          select-none
          focus:outline-none
        "
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        style={{ willChange: 'transform, opacity' }}
      >
        <div className="relative z-[1] flex items-center flex-1 px-[20px] pt-[20px] pb-[60px]">
          {/* 빈칸 예문 — pill 은 채점 전후 모두 중립색, 채점 후 활용형이 들어간다.
              아이콘이 없어졌으니 텍스트가 카드 전체 너비를 그대로 쓴다(왼쪽 여백 없음). */}
          <p lang={jaBlank ? 'ja' : undefined} className={`w-full text-[22px] font-[700] leading-[1.8] text-layout-black dark:text-layout-white ${jaBlank ? 'break-normal' : 'break-keep'}`}>
            {renderWordTokens(beforeTokens, 'b')}
            {/* 정렬은 en 과 같다(왼쪽 정렬·카드 세로 가운데). ja 는 띄어쓰기가 없어 빈칸이 앞뒤 글자에
                딱 붙으므로 좌우 4px 을 띄운다(en 은 문장의 공백이 그 역할).
                ja: 정답이 채워지면 빈칸 글자를 문장과 같은 크기(22px)로 — 문장의 일부로 읽히게.
                en 은 기존 규격(17px) 유지. */}
            <span
              className={`
                inline-flex items-center justify-center align-middle
                min-w-[84px] px-[14px]
                rounded-[8px] border-[1px] border-layout-gray-200 dark:border-[#444444]
                bg-layout-white dark:bg-layout-black
                font-[700] text-layout-black dark:text-layout-white
                ${jaBlank ? 'mx-[4px]' : ''}
                ${jaBlank && isAnswered ? 'h-[40px] px-[10px] text-[22px] leading-none' : 'h-[34px] text-[17px]'}
              `}
            >
              {isAnswered ? blankFill : ''}
            </span>
            {renderWordTokens(afterTokens, 'a')}
          </p>
        </div>

        {/* 단어 뜻 말풍선 — O/X(z-3) 위(z-4). 채점 시 닫히므로 실제로 겹치는 일은 거의 없다. */}
        <AnimatePresence>
          {lookup && (
            <WordInfoBubble
              key={lookup.key}
              anchor={lookup.anchor}
              container={lookup.container}
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
              xp_from={farm.xp_from}
              xp_to={farm.xp_to}
              xp_delta={farm.xp_delta}
              xp_next={farm.xp_next}
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
              {/* ja: 채점 후 정답 선택지에 읽기(히라가나) — 채점 전엔 힌트가 되므로 숨김.
                  선택지 문자열은 정답 = 문제 단어(question.origin)라 읽기는 question 에서 얻는다. */}
              {isAnswered && index === resultIndex && shouldShowReading(question) && (
                <span lang="ja" className="ml-[6px] text-[12px] font-[500] opacity-80">
                  {getReading(question)}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default FillInTheBlankQuestion;
