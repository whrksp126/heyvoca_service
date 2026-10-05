import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { SpeakerHigh } from '@phosphor-icons/react';
import TtsRipple from '../../../components/common/TtsRipple';
import WordInfoBubble from '../../../components/common/WordInfoBubble';
import { getWordInfoApi } from '../../../api/search';
import { feel } from '../../../lib/feel';
import { getTextSound, stripHtmlTags } from '../../../utils/common';
import { useStudyAdvanceGate } from '../../../hooks/useStudyAdvanceGate';
import { getMemoryStateKeyByStability } from '../../../components/common/MemoryStateChangeBadge';
import { useResumeReplayKey } from '../../../hooks/useResumeReplayKey';
import { useKoreanWordLookup } from '../../../hooks/useKoreanWordLookup';
import { wordLang } from '../../../utils/lang';
import { tokenizeKoreanWords } from '../../../utils/koreanTokenize';
import { stripTags, isAcceptedOrder, renderHighlightedText, tokenizeWords, diffAgainstAccepted } from './arrangeUtils';
import ArrangeTray from './ArrangeTray';

/*
  문장 만들기(sentenceArrangePartial / sentenceArrange) — 계약: SENTENCE_QUESTIONS_CONTRACT.md 3-1절.

  화면 규격은 기존 빈칸 채우기(fillInTheBlank)와 최대한 같게 맞춘다.
  - 위 카드(primary 틴트, 스피커 아이콘): 한국어 해석(question.arrange.ko). 카드 전체 탭 = TTS.
    마운트 시 1회 자동 재생.
  - 아래 = ArrangeTray(트레이 카드 + 조각 은행 + 확인 버튼) — 두 유형(부분/전체 조립)이 페이로드
    모양이 완전히 같아 이 컴포넌트 하나로 함께 처리한다(questionType 문자열만 다르다).
*/
const SentenceArrangeQuestion = ({ question, onComplete, onCardMatched, farmByWordId }) => {
  const [isAnswered, setIsAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);
  const [isPerfect, setIsPerfect] = useState(false); // 한 번에 맞힘 → '완벽해요'
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakDuration, setSpeakDuration] = useState(null);
  const [speakingTarget, setSpeakingTarget] = useState(null); // 'shown' | 'answer' | null
  // 채점 직전 사용자가 배열한 조각 — "정답 문장"에서 틀린 위치의 정답 단어를 강조하는 데 쓴다.
  const [submittedTokens, setSubmittedTokens] = useState([]);

  const startTimeRef = useRef(Date.now());
  const resumeReplayKey = useResumeReplayKey();
  const reducedMotion = useReducedMotion();
  const advanceGate = useStudyAdvanceGate();
  const wordTtsActiveRef = useRef(false);
  // 문장(위 카드 한국어 해석 'shown' / 채점 후 정답 문장 'answer') 재생 중인지 — 조각을 슬롯에
  // 놓을 때(onPiecePlaced) 이 값이 true면 단어 TTS를 재생하지도, 문장 재생을 끊지도 않는다
  // (2026-09-29 추가 요청). getTextSound가 끝나는 시점(정상 종료)에 false, 다른 speak() 호출에
  // 가로채이거나(중단) 언마운트되어도 false로 되돌아간다. 조각 단어 TTS 자체(target 없음)는
  // 이 ref를 true로 만들지 않는다.
  const isSentencePlayingRef = useRef(false);
  // 위 카드(한국어 해석) 어절 탭 → 역방향 조회 말풍선. TTS는 재생하지 않는다.
  const koLookup = useKoreanWordLookup();
  // 채점 후 "정답 문장" 단어 탭 → 사전 조회 말풍선(2026-09-29). 이 유형은 응용 확인이라
  // 목표 단어를 포인트 컬러로 강조하지 않는 대신, 문장의 모든 단어를 탭하면 fillInTheBlank와
  // 같은 WordInfoBubble(영어 사전)로 뜻을 보여 준다. ArrangeTray의 prefix/suffix 단어 조회
  // (data-lookup-word)와는 별개 상태 — 이 컴포넌트가 그리는 "정답 문장" 영역 전용이다.
  const [answerLookup, setAnswerLookup] = useState(null);
  const answerLookupReqRef = useRef(0);
  // 채점 후 "다음" 버튼을 누를 때 진행할 콜백 — 채점 순간(handleSubmit)에 캡처해 둔다(2026-09-29,
  // 예전엔 advanceGate.arm으로 자동 진행했지만 출력형 문제는 결과를 사용자가 직접 확인하고
  // 넘겨야 한다). 로그 전송·재출제(onCardMatched)는 여전히 채점 즉시 처리 — 진행만 수동이다.
  const nextRef = useRef(null);
  const speakGenRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  const prevStateKeyRef = useRef(
    getMemoryStateKeyByStability(question.fsrs?.stability ?? 0, question.fsrs?.state ?? null)
  );

  const arrange = question.arrange ?? {};
  const { bank = [], prefix = '', suffix = '', accepted = [], answer_text: answerText = '', ko = '' } = arrange;
  const answerLang = wordLang(question);

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
    const isSentence = target === 'shown' || target === 'answer';
    if (isSentence) isSentencePlayingRef.current = true;
    try {
      await getTextSound(text, lang, (d) => { if (gen === speakGenRef.current) setSpeakDuration(d); });
    } finally {
      if (gen === speakGenRef.current) setIsSpeaking(false);
      if (target === 'answer' && gen === speakGenRef.current) {
        wordTtsActiveRef.current = false;
        advanceGate.ttsEnd();
      }
      if (isSentence && gen === speakGenRef.current) isSentencePlayingRef.current = false;
    }
  };

  const speakShown = () => speak(stripHtmlTags(ko), 'ko', 'shown');

  useEffect(() => {
    speakShown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    speakGenRef.current += 1;
    isSentencePlayingRef.current = false;
  }, []);

  const handleCardClick = () => {
    feel('tap');
    speakShown();
  };

  const handleSubmit = (userTokens) => {
    if (isAnswered) return;
    setSubmittedTokens(userTokens);
    const correct = isAcceptedOrder(userTokens, accepted);
    const timeTakenMs = Date.now() - startTimeRef.current;

    // 소리·진동·시각(아래 setState)을 같은 틱에. 재출제(isRetry)가 아닌 첫 시도 정답이면 perfect.
    const perfect = correct && !question.isRetry;
    feel(perfect ? 'perfect' : (correct ? 'correct' : 'wrong'));
    setIsPerfect(perfect);

    question.isCorrect = correct;

    {
      const optimisticStability = correct ? 3.13 : 0.5;
      question.prevMemoryStateKey = question.prevMemoryStateKey ?? prevStateKeyRef.current;
      question.nextMemoryStateKey = getMemoryStateKeyByStability(optimisticStability, 'learning');
    }

    setIsCorrect(correct);
    setIsAnswered(true);

    const result = {
      sheetId: question.vocabularySheetId,
      wordId: question.id,
      isCorrect: correct,
      timeTakenMs,
      updateData: { fsrs: question.fsrs, isCorrect: correct, updatedAt: new Date().toISOString() },
    };
    const processedNow = typeof onCardMatched === 'function';
    if (processedNow) onCardMatched(result);

    // 채점 후 정답 문장 TTS(계약 3-1절 표시 규칙) — 정오답 무관하게 정답을 들려준다.
    const plainAnswer = stripTags(answerText);
    if (plainAnswer) speak(plainAnswer, answerLang, 'answer');

    // 자동으로 넘어가지 않는다(2026-09-29) — 결과(칩 정오답·정답 문장·XP)를 보여준 채로
    // 대기하다가 사용자가 "다음" 버튼을 눌러야 진행한다. onCardMatched는 이미 위에서
    // 채점 즉시 처리했다(진행 바·로그 전송·재출제 타이밍은 기존과 동일).
    nextRef.current = () => onCompleteRef.current?.([result], { processed: processedNow });
  };

  const handleNext = () => {
    feel('tap');
    nextRef.current?.();
  };

  const closeAnswerLookup = () => {
    answerLookupReqRef.current += 1;
    setAnswerLookup((prev) => (prev ? null : prev));
  };

  // "정답 문장" 단어 탭 — fillInTheBlank/ArrangeTray의 handleWordTap과 같은 규칙(사전 조회 +
  // 단어 TTS). speak()의 'lookup' 타겟은 게이트를 잡지 않는다 — 정답 문장이 재생 중이었다면
  // (target='answer') speak() 진입부의 공용 선점 처리가 그 게이트만 끊고, 탭한 단어를 새로 읽는다.
  const handleAnswerWordTap = (e, key, cleanWord) => {
    e.stopPropagation();
    if (!cleanWord) return;
    if (answerLookup?.key === key) {
      closeAnswerLookup();
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

    feel('tap');
    speak(cleanWord, answerLang, 'lookup');

    const reqId = ++answerLookupReqRef.current;
    setAnswerLookup({ key, word: cleanWord, anchor, status: 'loading', info: null });
    getWordInfoApi(cleanWord)
      .then((info) => {
        if (reqId !== answerLookupReqRef.current) return;
        setAnswerLookup((prev) => (prev && prev.key === key
          ? { ...prev, status: info ? 'found' : 'notFound', info }
          : prev));
      })
      .catch(() => {
        if (reqId !== answerLookupReqRef.current) return;
        setAnswerLookup((prev) => (prev && prev.key === key ? { ...prev, status: 'error' } : prev));
      });
  };

  // 말풍선 닫기 — 바깥 탭·스크롤(FillInTheBlankQuestion/ArrangeTray와 동일 규칙).
  useEffect(() => {
    if (!answerLookup) return undefined;
    const onPointerDown = (e) => {
      const t = e.target;
      if (!(t instanceof Element)) { closeAnswerLookup(); return; }
      if (t.closest('[data-word-info-bubble]')) return;
      if (t.closest('[data-answer-lookup-word]')) return;
      closeAnswerLookup();
    };
    const onScroll = () => closeAnswerLookup();
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerLookup?.key]);

  const showTtsRipple = isSpeaking && speakingTarget === 'shown';

  // 틀렸을 때만 정답 문장을 강조 표시(계약 3-1절 표시 규칙) — 맞았을 때는 사용자가 놓은
  // 조각이 이미 정답이므로 다시 보여줄 필요가 없다.
  // 오답 상세 피드백(2026-09-28) — 목표 단어 강조(hl)와 별개로, 사용자가 놓은 조각 중
  // 틀린 위치의 정답 단어를 빨강으로 한 번 더 강조한다(듀오링고식).
  // 위치 기반 매핑(2026-09-29 재작업) — 예전엔 "단어 문자열"로 매칭해서 문장 안에 같은
  // 단어가 prefix/suffix에도 있으면 전부 강조되는 버그가 있었다(예: 'Keep the noise to
  // ___ ___ during ___ exam.'에서 앞의 'the'까지 강조). 정답 문장(answerText)은
  // joinSentence(prefix, ref, suffix) 규칙대로 "prefix + 빈칸 자리 + suffix" 순서로
  // 조립되므로, prefix의 단어 토큰 개수를 오프셋으로 써서 "빈칸 구간"의 전역 단어 인덱스
  // 범위([blankStart, blankEnd))만 계산하고, 그 범위 안에서만 correctFlags를 검사한다.
  // diffAgainstAccepted가 이미 사용자가 맞춘 어순(alt_orders 등)을 기준(ref)으로 고르므로
  // 그 기준 그대로 위치를 맞춘다. 대소문자·구두점은 tokenizeWords/normTok이 이미 무시한다.
  const { ref: answerRef, correctFlags } = isCorrect === false
    ? diffAgainstAccepted(submittedTokens, accepted)
    : { ref: [], correctFlags: [] };
  const blankStart = tokenizeWords(prefix).filter((t) => t.type === 'word').length;
  const blankEnd = blankStart + answerRef.length;
  // "정답 문장"은 응용 확인용이라 목표 단어를 포인트 컬러(분홍)로 강조하지 않는다(2026-09-29) —
  // p.hl(강조 마커) 색은 더 이상 쓰지 않는다. 대신 문장의 모든 단어를 탭하면 fillInTheBlank와
  // 같은 방식(handleAnswerWordTap + WordInfoBubble)으로 사전 말풍선이 뜬다. 사용자가 틀린
  // 위치의 정답 단어(빨강 밑줄)는 그대로 유지한다.
  const postAnswerNode = isCorrect === false ? (() => {
    let wordIdx = 0;
    return (
      <div className="w-full mt-[16px] pt-[14px] border-t-[1px] border-layout-gray-200 dark:border-[#3A3A3A] relative">
      <span className="block mb-[2px] text-[11px] font-[700] leading-[1.7] text-layout-gray-300">정답 문장</span>
      <div className="flex items-start gap-[8px] w-full">
        {/* 정답 문장 듣기 — 본문 바로 왼쪽, 첫 줄 높이에 맞춰 상단 정렬(재생 중 primary + 리플) */}
        <motion.button
          type="button"
          aria-label="정답 문장 듣기"
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.15 }}
          className="relative shrink-0 flex items-center justify-center w-[28px] h-[25.5px]"
          onClick={() => {
            feel('tap');
            const plain = stripTags(answerText);
            if (plain) speak(plain, answerLang, 'answer');
          }}
        >
          {isSpeaking && speakingTarget === 'answer' && (
            <TtsRipple
              size={70}
              duration={speakDuration}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[0] pointer-events-none"
            />
          )}
          <span className={`relative z-[1] block transition-colors duration-200 ${isSpeaking && speakingTarget === 'answer' ? 'text-primary-main-600' : 'text-layout-gray-300'}`}>
            <SpeakerHigh size={22} weight="fill" />
          </span>
        </motion.button>
        <p className="relative z-[1] flex-1 min-w-0 text-[15px] leading-[1.7] text-layout-gray-400 dark:text-layout-gray-100 break-keep">
        {(renderHighlightedText(answerText) ?? []).map((p) => (
          <span key={p.key}>
            {tokenizeWords(p.text).map((tok, i) => {
              const isWordTok = tok.type === 'word';
              const idx = isWordTok ? wordIdx : -1;
              if (isWordTok) wordIdx += 1;
              if (!isWordTok) return <span key={i}>{tok.text}</span>;
              const isWrong = idx >= blankStart && idx < blankEnd
                && correctFlags[idx - blankStart] === false;
              const key = `ans-${idx}`;
              const active = answerLookup?.key === key;
              return (
                <button
                  key={i}
                  type="button"
                  data-answer-lookup-word
                  aria-label={`${tok.clean} 뜻 보기`}
                  aria-expanded={active}
                  className={`
                    inline font-[inherit] text-[inherit] leading-[inherit] text-left align-baseline
                    rounded-[4px] px-[1px]
                    focus:outline-none
                    transition-colors duration-150
                    ${isWrong ? 'text-status-error-600 dark:text-status-error-400 font-[700] underline decoration-2 underline-offset-[3px]' : ''}
                    ${active ? 'bg-primary-main-50 dark:bg-primary-main-dark' : ''}
                  `}
                  onClick={(e) => handleAnswerWordTap(e, key, tok.clean)}
                >
                  {tok.text}
                </button>
              );
            })}
          </span>
        ))}
        </p>
      </div>
      </div>
    );
  })() : null;

  /*
    위 카드(한국어 해석) 어절 탭 렌더 — fillInTheBlank의 상단 카드와 같은 규칙: 카드 자체가
    <button>(전체 탭 = TTS)이라 실제 <button>을 중첩할 수 없어 span+role="button"을 쓴다.
    탭은 koLookup.handleTap 내부 stopPropagation으로 카드의 TTS 탭과 분리된다.
  */
  const koTokens = tokenizeKoreanWords(stripHtmlTags(ko));
  const renderKoTokens = () => koTokens.map((tok, i) => {
    if (tok.type !== 'word') return <span key={i}>{tok.text}</span>;
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

  return (
    <div className="flex flex-col gap-[15px] h-full">
      {/* 위 카드 — 한국어 해석. 카드 자체는 탭 동작 없음 — 왼쪽 스피커 아이콘을 눌러야
          읽는다(2026-09-29, 예전엔 카드 전체 탭 = TTS 였다). 어절 탭 = 한국어 역방향 사전 조회. */}
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
            aria-label="해석 듣기"
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
            {renderKoTokens()}
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

      {/* 아래 — 트레이(회색 카드) + 조각 은행 + 확인 */}
      <ArrangeTray
        bank={bank}
        prefix={prefix}
        suffix={suffix}
        accepted={accepted}
        answerLang={answerLang}
        answerText={answerText}
        postAnswerNode={postAnswerNode}
        isAnswered={isAnswered}
        isCorrect={isCorrect}
        perfect={isPerfect}
        question={question}
        farm={farm}
        resumeReplayKey={resumeReplayKey}
        advanceGate={advanceGate}
        onSubmit={handleSubmit}
        onPiecePlaced={(word) => {
          // 문장 재생(한국어 해석 'shown' 카드/정답 문장 'answer') 중이면 단어 TTS를 건너뛴다 —
          // 문장 재생을 끊지도 않는다. 재생 중이 아닐 때만 방금 놓은 조각을 읽는다.
          if (isSentencePlayingRef.current) return;
          speak(word, answerLang);
        }}
        onNext={handleNext}
      />

      {/* "정답 문장" 단어 뜻 말풍선 — document.body 포털(WordInfoBubble)이라 트레이 카드의
          overflow-hidden에 잘리지 않는다. */}
      <AnimatePresence>
        {answerLookup && (
          <WordInfoBubble
            key={answerLookup.key}
            anchor={answerLookup.anchor}
            status={answerLookup.status}
            info={answerLookup.info}
            speaking={isSpeaking && speakingTarget === 'lookup'}
            onReplay={() => {
              feel('tap');
              speak(answerLookup.word, answerLang, 'lookup');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SentenceArrangeQuestion;
