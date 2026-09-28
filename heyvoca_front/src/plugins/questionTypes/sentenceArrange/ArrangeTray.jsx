import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle, X } from '@phosphor-icons/react';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import StudyTimingTag from '../../../components/farm/StudyTimingTag';
import LiftAboveBar from '../../../components/common/LiftAboveBar';
import WordInfoBubble from '../../../components/common/WordInfoBubble';
import { getWordInfoApi } from '../../../api/search';
import { getTextSound } from '../../../utils/common';
import { haptic } from '../../../lib/feel';
import { diffAgainstAccepted, tokenizeWords } from './arrangeUtils';

/*
  문장 조립형 3종(sentenceArrangePartial/sentenceArrange/listenArrange) 공용 "아래 화면" —
  기존 빈칸 채우기(FillInTheBlankQuestion)의 아래 카드 + 선택지 영역과 같은 자리를 대신한다.

  구성(위→아래):
    1) 트레이 카드(회색) — 고정 텍스트(prefix/suffix) + 채울 자리(빈 슬롯 라인) + 사용자가
       놓은 조각이 문장처럼 줄바꿈. 처음부터 채워야 할 칸 수만큼 밑줄 슬롯을 그려 문장
       골격을 보여준다(2026-09-28 피드백) — 다음에 채울 슬롯은 은은하게 강조한다.
       O/X · 시점 문구 · 농장 상태 바는 이 카드 안에서 사지선다/빈칸 채우기와 같은 자리에 뜬다.
       틀렸으면 카드 안에 정답 문장을 이어서 보여준다(호출부가 postAnswerNode로 넘김).
       고정 텍스트(prefix/suffix) 단어는 fillInTheBlank와 같은 방식(handleWordTap +
       WordInfoBubble)으로 탭하면 사전 말풍선이 뜬다.
    2) 조각 은행 — 흰 바탕 칩. 탭하면 트레이의 다음 빈 슬롯으로 이동(자리는 invisible로
       비워 두어 레이아웃이 흔들리지 않는다). 트레이의 조각을 탭하면 다시 은행으로 돌아간다.
    3) 확인 버튼(50px) — 조각 1개 이상 놓였을 때만 활성. 서비스 공용 primary CTA 규칙(분홍
       bg-primary-main-600 활성 / 회색 비활성)을 그대로 쓴다(2026-09-29 QA 반영).

  채점 후에는 사용자가 놓은 조각마다 정오 판정을 칩 색으로 보여준다(맞음=초록, 틀림=빨강+
  취소선, 못 채운 자리=빨강 점선 슬롯) — 듀오링고식 오답 상세 피드백(2026-09-28).
  카드 자체에는 탭 인터랙션이 없다(정답 유출 방지) — 단, prefix/suffix 고정 텍스트 단어만
  예외로 사전 조회 탭을 허용한다(FillInTheBlankQuestion과 동일 규칙).
*/
const ArrangeTray = ({
  bank,
  prefix,
  suffix,
  // 정답 인정 순서 목록(§3-1 accepted) — 채울 슬롯 개수·오답 상세 비교(diffAgainstAccepted)의
  // 기준. 부모(Sentence/ListenArrangeQuestion)가 arrange.accepted를 그대로 넘긴다.
  accepted = [],
  // prefix/suffix 단어 탭 시 사전 조회·TTS에 쓸 언어 — 부모가 wordLang(question) 그대로 넘긴다.
  answerLang = 'en',
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
  const cardRef = useRef(null);

  // 단어 뜻 말풍선(사전 조회) — prefix/suffix 고정 텍스트만 탭 대상. 한 번에 하나만.
  const [lookup, setLookup] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lookupReqRef = useRef(0);
  const speakGenRef = useRef(0);

  const disabled = isAnswered;
  // 채울 슬롯 총 개수 — accepted[0](정답 원소 하나)의 길이를 기준으로 삼는다(계약 §3-1,
  // 채점은 배열 전체를 보지만 표시할 슬롯 수는 대표 정답 하나로 충분하다).
  const expectedLen = Array.isArray(accepted) && Array.isArray(accepted[0]) && accepted[0].length > 0
    ? accepted[0].length
    : bank.length;
  const userTokens = trayOrder.map((i) => bank[i]);
  const { correctFlags } = disabled ? diffAgainstAccepted(userTokens, accepted) : { correctFlags: [] };

  const prefixTokens = tokenizeWords(prefix);
  const suffixTokens = tokenizeWords(suffix);

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

  const closeLookup = () => {
    lookupReqRef.current += 1;
    setLookup((prev) => (prev ? null : prev));
  };

  // prefix/suffix 단어 발음 재생 — fillInTheBlank의 'lookup' 타겟과 같은 자리(전환을 붙잡지 않음).
  const speakWord = async (text) => {
    if (!text) return;
    const gen = ++speakGenRef.current;
    setIsSpeaking(true);
    try {
      await getTextSound(text, answerLang);
    } finally {
      if (gen === speakGenRef.current) setIsSpeaking(false);
    }
  };

  const handleWordTap = (e, key, cleanWord) => {
    e.stopPropagation();
    if (lookup?.key === key) {
      closeLookup();
      return;
    }
    const cardEl = cardRef.current;
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
    speakWord(cleanWord);

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

  // 말풍선 닫기 — 바깥 탭·스크롤(FillInTheBlankQuestion과 동일 규칙).
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

  const renderFixedWords = (tokens, area) => tokens.map((tok, i) => {
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

  // 사용자가 놓은 조각 수와 정답 슬롯 수 중 큰 쪽까지 렌더 — 못 채운 자리는 빈 슬롯,
  // 정답 수보다 더 놓았으면(방해 조각까지 놓은 경우) 그 조각도 칩으로 계속 보인다.
  const totalSlots = Math.max(expectedLen, trayOrder.length);
  const nextEmptyIndex = trayOrder.length;

  return (
    <div className="flex flex-col gap-[15px] flex-1 min-h-0">
      {/* 트레이 카드 */}
      <motion.div
        ref={cardRef}
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
                <span className="text-layout-gray-300 dark:text-layout-gray-100 font-[600]">
                  {renderFixedWords(prefixTokens, 'p')}{' '}
                </span>
              )}
              {Array.from({ length: totalSlots }).map((_, pos) => {
                if (pos < trayOrder.length) {
                  const bankIdx = trayOrder[pos];
                  const flag = disabled ? correctFlags[pos] : null;
                  const chipStyle = flag === true
                    ? 'bg-status-success-100 dark:bg-status-success-dark border-status-success-500 text-status-success-700 dark:text-status-success-300'
                    : flag === false
                      ? 'bg-status-error-100 dark:bg-status-error-dark border-status-error-500 text-status-error-600 dark:text-status-error-300 line-through'
                      : 'bg-layout-white dark:bg-layout-black border-layout-gray-200 dark:border-[#3A3A3A] text-layout-black dark:text-layout-white';
                  return (
                    <button
                      key={`chip-${pos}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => tapTray(pos)}
                      className={`
                        inline-flex items-center align-middle mx-[3px] my-[2px]
                        px-[9px] py-[2px]
                        border-[1px]
                        rounded-[6px]
                        ${chipStyle}
                      `}
                    >
                      {bank[bankIdx]}
                    </button>
                  );
                }
                // 빈 슬롯 — 밑줄 라인으로 채울 자리를 미리 보여준다. 채점 후 정답보다 덜
                // 채워 남은 자리는 빨강 점선(빠진 자리), 다음에 채울 자리는 은은하게 강조.
                const missing = disabled && isCorrect === false && pos < expectedLen;
                const isNext = !disabled && pos === nextEmptyIndex;
                return (
                  <span
                    key={`slot-${pos}`}
                    aria-hidden="true"
                    className={`
                      inline-block align-text-bottom mx-[4px] my-[2px]
                      w-[30px] h-0
                      border-b-[3px]
                      ${missing ? 'border-dashed' : ''}
                      ${missing
                        ? 'border-status-error-400 dark:border-status-error-500'
                        : isNext
                          ? `border-primary-main-400 dark:border-primary-main-300 ${reducedMotion ? '' : 'animate-pulse'}`
                          : 'border-layout-gray-300 dark:border-[#4A4A4A]'}
                    `}
                  />
                );
              })}
              {suffix && (
                <span className="text-layout-gray-300 dark:text-layout-gray-100 font-[600]">
                  {' '}{renderFixedWords(suffixTokens, 's')}
                </span>
              )}
            </p>
            {isAnswered && postAnswerNode}
          </LiftAboveBar>
        </div>

        {/* 단어 뜻 말풍선 — O/X(z-3) 위(z-4). 채점 시 닫히지 않아도(별도 useEffect 없음)
            prefix/suffix는 채점 후에도 항상 탭 가능해 말풍선이 자연스럽게 남을 수 있다. */}
        <AnimatePresence>
          {lookup && (
            <WordInfoBubble
              key={lookup.key}
              anchor={lookup.anchor}
              container={lookup.container}
              status={lookup.status}
              info={lookup.info}
              speaking={isSpeaking}
              onReplay={() => {
                haptic('light');
                speakWord(lookup.word);
              }}
            />
          )}
        </AnimatePresence>

        {/* O — 정답, 카드 정중앙(기존 유지). */}
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
          </AnimatePresence>
        </div>

        {/* X — 오답. 예전엔 카드 정중앙을 큰 아이콘으로 덮어 칩 색 피드백을 가렸다 —
            이제 우측 상단(StudyTimingTag가 오답일 때 비워 두는 자리)에 작게만 표시한다. */}
        <div className="absolute top-[11px] right-[13px] z-[3] pointer-events-none">
          <AnimatePresence>
            {isCorrect === false && (
              <motion.div
                key={`wrong-${resumeReplayKey}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 25, duration: 0.3 }}
                style={{ willChange: 'transform, opacity' }}
              >
                <X size={20} weight="bold" className="text-status-error-500" />
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
              : 'bg-primary-main-600 text-layout-white dark:text-layout-black'}
          `}
        >
          확인
        </motion.button>
      </div>
    </div>
  );
};

export default ArrangeTray;
