import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import SpeakerArt from '../../../components/common/SpeakerArt';
import CardSpeakerButton from '../../../components/common/CardSpeakerButton';
import WordInfoBubble from '../../../components/common/WordInfoBubble';
import { getWordInfoApi } from '../../../api/search';
import { useShowFurigana } from '../../../context/ExampleSettingsContext';
import { feel } from '../../../lib/feel';
import { getTextSound, stripHtmlTags } from '../../../utils/common';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { wordLang } from '../../../utils/lang';
import ArrangeTray from '../sentenceArrange/ArrangeTray';
import { tokenizeWords } from '../sentenceArrange/arrangeUtils';

/*
  문장 뜻 맞추기(sentenceTranslate) — 계약: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §3.

  - 위 카드: 외국어 예문(목표 단어 강조) + 스피커. 등장 시 1회 자동 재생(lang en/ja).
    예문 단어를 탭하면 빈칸 채우기와 같은 사전 말풍선(WordInfoBubble)이 뜬다(en·ja 모두).
  - 아래: 문장 만들기와 같은 ArrangeTray — 한국어 블록을 눌러 답 줄에 나열, 놓은 블록을 누르면 되돌린다.
  - 채점: 고른 블록 text 배열이 accepted 중 하나와 같으면 정답(문장부호·공백 무시).
    accepted 는 서버가 '성분 묶음'(관형어+명사, 명사+동안 등) 단위로 서술어 앞 순서를 바꾼 경우를
    모두 담아 보낸다(QA 3차) — 어순 판정 규칙은 서버 한 곳(sentence_meaning.py)에만 둔다.
    긴 번역은 앞부분이 prefix 로 미리 채워져 오고, accepted 는 나머지 부분만 담는다.
    틀리면 트레이 아래에 정답 문장(translation)을 보여 준다.
*/

// 비교용 정규화 — 공백·문장부호 제거(계약 §3 채점 규칙).
const norm = (t) => String(t ?? '').replace(/[\s\p{P}\p{S}]+/gu, '').toLowerCase();

const isAccepted = (tokens, accepted) => accepted.some((acc) =>
  Array.isArray(acc) && acc.length === tokens.length && acc.every((t, i) => norm(t) === norm(tokens[i])));

// sentence_html 의 <b>/<strong> 강조만 살려 조각으로 나눈다.
const splitEmphasis = (html, plain) => {
  if (!html) return [{ text: plain, hl: false }];
  return String(html)
    .split(/(<(?:b|strong)\b[^>]*>[\s\S]*?<\/(?:b|strong)>)/i)
    .filter(Boolean)
    // stripHtmlTags 는 앞뒤 공백을 trim 해서 강조 경계의 띄어쓰기가 사라진다("Bananasare") — 공백은 살린다.
    .map((part) => {
      const lead = /^\s/.test(part) ? ' ' : '';
      const trail = /\s$/.test(part) ? ' ' : '';
      return { text: `${lead}${stripHtmlTags(part)}${trail}`, hl: /^<(?:b|strong)\b/i.test(part) };
    });
};

/*
  예문 → 탭 가능한 토큰. 강조(hl)는 조각 단위로 유지한다.
  - en: 강조 조각별 공백 분리(tokenizeWords — 빈칸 채우기·문장 만들기와 같은 규칙).
  - ja: reading_tokens 를 평문 위에 놓고 토큰 하나 = 탭 단위. 강조 경계가 토큰 안에 걸리면
    그 토큰은 조각으로 쪼개 보여 주되 탭은 원래 토큰 전체를 조회한다(ruby 는 쪼개지 않은 토큰만).
    reading_tokens 가 없거나 평문과 맞지 않으면 null → 탭 없는 평문으로 그린다.
*/
const JA_TAPPABLE_RE = /[\u3040-\u30ff\u3400-\u9fffA-Za-z0-9\uff10-\uff19\uff21-\uff5a]/;
const tokenizeEn = (parts) => parts.flatMap((p) => tokenizeWords(p.text).map((t) => ({ ...t, hl: p.hl })));
const tokenizeJa = (parts, readingTokens) => {
  if (!Array.isArray(readingTokens) || readingTokens.length === 0) return null;
  const plain = parts.map((p) => p.text).join('');
  const surfaces = readingTokens.map((t) => (Array.isArray(t) ? String(t[0] ?? '') : ''));
  if (surfaces.join('') !== plain) return null;
  const hlAt = [];
  parts.forEach((p) => { for (let i = 0; i < p.text.length; i += 1) hlAt.push(p.hl); });
  let pos = 0;
  return readingTokens.map((tok, ti) => {
    const surface = surfaces[ti];
    const start = pos;
    pos += surface.length;
    const segs = [];
    for (let i = 0; i < surface.length; i += 1) {
      const hl = hlAt[start + i];
      if (segs.length && segs[segs.length - 1].hl === hl) segs[segs.length - 1].text += surface[i];
      else segs.push({ text: surface[i], hl });
    }
    const okurigana = tok[2] ? String(tok[2]) : '';
    const hasOkuri = !!okurigana && surface.endsWith(okurigana) && surface.length > okurigana.length;
    return {
      type: JA_TAPPABLE_RE.test(surface) ? 'word' : 'text',
      text: surface,
      clean: surface,
      segs,
      hl: segs.length === 1 && segs[0].hl,
      reading: segs.length === 1 && tok[1] ? String(tok[1]) : null,
      base: hasOkuri ? surface.slice(0, surface.length - okurigana.length) : surface,
      okurigana: hasOkuri ? okurigana : '',
    };
  });
};

const HL_CLASS = 'text-primary-main-600 dark:text-primary-main-400';

const SentenceTranslateQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isPerfect, setIsPerfect] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // 지금 재생 중인 게 예문 전체('shown')인지 탭한 단어('lookup')인지 — 스피커 맥동은 예문일 때만.
  const [speakingTarget, setSpeakingTarget] = useState(null);
  const [lookup, setLookup] = useState(null);
  const lookupReqRef = useRef(0); // 늦게 도착한 이전 단어의 응답이 현재 말풍선을 덮지 않게
  const showFurigana = useShowFurigana();

  const startTimeRef = useRef(Date.now());
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();
  const advanceGate = useStudyAdvanceGate();
  const nextRef = useRef(null);
  const speakGenRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const meaning = question.meaning ?? {};
  const { sentence = '', sentence_html: sentenceHtml = '', tiles = [], accepted = [], translation = '' } = meaning;
  // 9어절 이상 번역은 서버가 앞부분을 미리 채워 보낸다(prefix) — 맞출 조각·accepted 는 그 뒷부분만.
  const prefix = meaning.prefix ?? '';
  const lang = meaning.lang ?? wordLang(question);
  const bank = tiles.map((t) => t?.text ?? '');
  // 트레이의 칩 색(맞음/틀림) 비교는 원문 그대로 하므로 accepted 를 블록 표기에 맞춰 둔다.
  const trayAccepted = accepted.map((acc) => (Array.isArray(acc)
    ? acc.map((tok) => bank.find((b) => norm(b) === norm(tok)) ?? tok)
    : acc));

  const farm = isAnswered ? (farmByWordId?.[question.id] ?? null) : null;

  const speak = async (text = stripHtmlTags(sentence), target = 'shown') => {
    if (!text) return;
    const gen = ++speakGenRef.current;
    setIsSpeaking(true);
    setSpeakingTarget(target);
    try {
      await getTextSound(text, lang);
    } finally {
      if (gen === speakGenRef.current) { setIsSpeaking(false); setSpeakingTarget(null); }
    }
  };

  const closeLookup = () => {
    lookupReqRef.current += 1;
    setLookup((prev) => (prev ? null : prev));
  };

  // 예문 단어 탭 — 빈칸 채우기(handleWordTap)와 같은 동작: 단어를 읽고 사전 말풍선을 연다. 같은 단어 재탭 = 닫기.
  const handleWordTap = (e, key, cleanWord) => {
    e.stopPropagation();
    if (lookup?.key === key) { closeLookup(); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const anchor = { top: r.top, left: r.left, width: r.width, height: r.height };
    feel('tap');
    speak(cleanWord, 'lookup');
    const reqId = ++lookupReqRef.current;
    setLookup({ key, word: cleanWord, anchor, status: 'loading', info: null });
    getWordInfoApi(cleanWord)
      .then((info) => {
        if (reqId !== lookupReqRef.current) return;
        setLookup((prev) => (prev && prev.key === key ? { ...prev, status: info ? 'found' : 'notFound', info } : prev));
      })
      .catch(() => {
        if (reqId !== lookupReqRef.current) return;
        setLookup((prev) => (prev && prev.key === key ? { ...prev, status: 'error' } : prev));
      });
  };

  // 말풍선 닫기 — 바깥 탭(단어 버튼은 자기 onClick 이 토글/전환을 맡으므로 제외) · 스크롤
  useEffect(() => {
    if (!lookup) return undefined;
    const onPointerDown = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) { closeLookup(); return; }
      if (t.closest('[data-word-info-bubble]') || t.closest('[data-lookup-word]')) return;
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

  useEffect(() => {
    speak();
    return () => { speakGenRef.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (userTokens) => {
    if (isAnswered) return;
    closeLookup(); // 채점 순간 말풍선은 닫는다
    const correct = isAccepted(userTokens, accepted);
    const timeTakenMs = Date.now() - startTimeRef.current;
    const perfect = correct && !question.isRetry;
    feel(perfect ? 'perfect' : (correct ? 'correct' : 'wrong'));
    setIsPerfect(perfect);

    // 실수 유형 — 정답에 없는 블록을 골랐으면 방해 조각, 아니면 어순.
    let errorType = null;
    if (!correct) {
      const answerSet = new Set(accepted.flat().map(norm));
      errorType = userTokens.some((t) => !answerSet.has(norm(t))) ? 'distractor' : 'order';
    }

    question.isCorrect = correct;
    question.prevMemoryStateKey = question.prevMemoryStateKey ?? prevStateKeyRef.current;
    question.nextMemoryStateKey = getMemoryStateKeyByStability(correct ? 3.13 : 0.5, 'learning');

    setIsCorrect(correct);
    setIsAnswered(true);

    const result = {
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: correct,
      timeTakenMs,
      errorType,
      updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
    };
    const processedNow = typeof onCardMatched === 'function';
    if (processedNow) onCardMatched(result);
    nextRef.current = () => onCompleteRef.current?.([result], { processed: processedNow });
  };

  const handleNext = () => {
    feel('tap');
    nextRef.current?.();
  };

  const postAnswerNode = isCorrect === false && translation ? (
    <div className="w-full mt-[16px] pt-[14px] border-t-[1px] border-layout-gray-200 dark:border-[#3A3A3A]">
      <span className="block mb-[2px] text-[11px] font-[700] leading-[1.7] text-layout-gray-300">정답</span>
      <p className="text-[15px] leading-[1.7] text-layout-gray-400 dark:text-layout-gray-100 break-keep">{translation}</p>
    </div>
  ) : null;

  const ja = lang === 'ja';
  const parts = splitEmphasis(sentenceHtml, stripHtmlTags(sentence));
  const tokens = (ja ? tokenizeJa(parts, meaning.reading_tokens) : tokenizeEn(parts))
    ?? parts.map((p) => ({ type: 'text', text: p.text, hl: p.hl }));
  const showSpeaking = isSpeaking && speakingTarget === 'shown';

  const renderToken = (tok, i) => {
    const key = `s-${i}`;
    const inner = tok.segs && tok.segs.length > 1
      ? tok.segs.map((sg, j) => <span key={j} className={sg.hl ? HL_CLASS : ''}>{sg.text}</span>)
      : (ja && showFurigana && tok.reading
        ? <><ruby>{tok.base}<rt>{tok.reading}</rt></ruby>{tok.okurigana}</>
        : tok.text);
    const hlClass = tok.hl ? HL_CLASS : '';
    if (tok.type !== 'word') return <span key={key} className={hlClass}>{inner}</span>;
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
          rounded-[4px] px-[1px] focus:outline-none transition-colors duration-150
          ${hlClass}
          ${active ? 'underline decoration-dotted decoration-2 underline-offset-[6px] decoration-layout-gray-300 bg-primary-main-100 dark:bg-primary-main-dark' : ''}
        `}
        onClick={(e) => handleWordTap(e, key, tok.clean)}
      >
        {inner}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 위 카드 — 외국어 예문. 스피커를 누르면 다시 읽는다. */}
      <motion.div
        className="relative overflow-hidden w-full px-[20px] py-[18px] rounded-[12px] text-left bg-primary-main-50 dark:bg-primary-main-dark"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="relative z-[1] flex items-start gap-[12px]">
          <p className={`flex-1 min-w-0 text-[19px] font-[600] text-layout-black dark:text-layout-white ${ja ? 'leading-[1.8] break-normal' : 'leading-[1.6] break-keep'}`}>
            {tokens.map(renderToken)}
          </p>
          {/* 스피커 — 텍스트 오른쪽(듣기 문제 주 재생 스피커만 예외, 2026-10-28). 평소엔 회색, 읽는 동안 primary + 음파. */}
          <motion.button
            type="button"
            aria-label="문장 듣기"
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="relative flex-shrink-0 mt-[3px]"
            onClick={() => { feel('tap'); speak(); }}
          >
            <motion.span
              className={`relative z-[1] block transition-colors duration-200 ${showSpeaking ? 'text-primary-main-600' : 'text-layout-gray-300'}`}
              animate={showSpeaking && !reducedMotion ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={showSpeaking && !reducedMotion ? { duration: 0.6, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              <SpeakerArt size={22} playing={showSpeaking} />
            </motion.span>
          </motion.button>
        </div>
      </motion.div>

      {/* 단어 뜻 말풍선 — document.body 포털이라 카드 overflow 에 잘리지 않는다. */}
      <AnimatePresence>
        {lookup && (
          <WordInfoBubble
            key={lookup.key}
            anchor={lookup.anchor}
            status={lookup.status}
            info={lookup.info}
            speaking={isSpeaking && speakingTarget === 'lookup'}
            onReplay={() => { feel('tap'); speak(lookup.word, 'lookup'); }}
          />
        )}
      </AnimatePresence>

      <ArrangeTray
        bank={bank}
        prefix={prefix}
        suffix=""
        accepted={trayAccepted}
        answerLang="ko"
        answerText={translation}
        postAnswerNode={postAnswerNode}
        isAnswered={isAnswered}
        isCorrect={isCorrect}
        perfect={isPerfect}
        question={question}
        farm={farm}
        farmTrailing={
          // 채점 후 농장 상태 바 옆 스피커 — 위 카드의 외국어 예문 전체를 다시 읽는다(게이트 무관).
          <CardSpeakerButton
            playing={isSpeaking && speakingTarget === 'full'}
            onPress={() => speak(stripHtmlTags(sentence), 'full')}
          />
        }
        resumeReplayKey={resumeReplayKey}
        advanceGate={advanceGate}
        onSubmit={handleSubmit}
        onNext={handleNext}
        lookupChips={false}
      />
    </div>
  );
};

export default SentenceTranslateQuestion;
