import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Circle } from '@phosphor-icons/react';
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
    1) 트레이 카드(회색) — 고정 텍스트(prefix/suffix) + 채울 자리(슬롯) + 사용자가 놓은 조각이
       문장처럼 줄바꿈. 정답 길이(expectedLen)만큼 **고정된 슬롯**을 처음부터 그려 문장 골격을
       보여준다 — 빈 슬롯은 밑줄, 채운 슬롯은 칩. 다음에 채울 빈 슬롯은 은은하게 강조.
       O/X · 시점 문구 · 농장 상태 바는 이 카드 안에서 사지선다/빈칸 채우기와 같은 자리에 뜬다.
       틀렸으면 카드 안에 정답 문장을 이어서 보여준다(호출부가 postAnswerNode로 넘김).
       고정 텍스트(prefix/suffix) 단어는 fillInTheBlank와 같은 방식(handleWordTap +
       WordInfoBubble)으로 탭하면 사전 말풍선이 뜬다.
    2) 조각 은행 — 흰 바탕 칩. 탭하면 다음 빈 슬롯으로 이동하거나, 손가락으로 눌러 원하는
       슬롯까지 끌어다 놓을 수 있다(2026-09-29 드래그 앤 드롭 추가 — pointer events, 새
       라이브러리 없음). 채워진 슬롯의 칩도 다른 슬롯으로 끌어 옮기거나(자리 교체) 은행
       구역으로 끌어내려 뺄 수 있다. 짧은 탭(이동 < 6px)은 기존처럼 탭 동작으로 처리.
    3) 확인/다음 버튼(50px) — 모든 슬롯이 채워져야 활성(2026-09-29). 채점 후에는 자동으로
       넘어가지 않고 "다음"으로 바뀐다 — 사용자가 결과(칩 정오답·정답 문장)를 직접 보고
       눌러야 다음 문제로 진행한다. 서비스 공용 primary CTA 규칙(분홍 활성/회색 비활성,
       흰 글자)을 그대로 쓴다.

  채점 후에는 사용자가 놓은 조각마다 정오 판정을 칩 색으로 보여준다(맞음=초록, 틀림=빨강+
  취소선) — 듀오링고식 오답 상세 피드백. 카드 자체에는 탭 인터랙션이 없다(정답 유출 방지) —
  단, prefix/suffix 고정 텍스트 단어만 예외로 사전 조회 탭을 허용한다(FillInTheBlankQuestion과
  동일 규칙).
*/

// 슬롯(빈칸/칩) 한 칸의 바깥 상자 높이 — 빈 슬롯 밑줄과 채운 칩의 아래쪽 테두리가 항상 같은
// y 좌표에 오도록, 둘 다 이 높이의 상자 안에서 아래쪽(items-end)에 붙인다(2026-09-29).
const SLOT_BOX_H = 32;
const SLOT_CHIP_H = 28;
const DRAG_THRESHOLD_PX = 6;

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
  // 조각(칩)을 슬롯에 채워 넣는 순간(탭 또는 드롭) 호출 — 해당 단어를 TTS로 읽는다. 부모
  // (Sentence/ListenArrangeQuestion)가 자기 speak/speakGenRef를 그대로 넘겨서 진행 중이던
  // 재생(받아쓰기 0.7배 단어별 재생 포함)을 세대 가드로 끊고 새로 읽게 한다(2026-09-29).
  // 슬롯을 비우는 동작(은행으로 빼기)에서는 호출하지 않는다.
  onPiecePlaced,
  // 채점 후 "다음" 버튼 탭 — 자동으로 넘어가지 않는다(2026-09-29). 부모가 진행 콜백을 넘긴다.
  onNext,
}) => {
  const reducedMotion = useReducedMotion();
  // 채울 슬롯 총 개수 — accepted[0](정답 원소 하나)의 길이를 기준으로 삼는다(계약 §3-1,
  // 채점은 배열 전체를 보지만 표시할 슬롯 수는 대표 정답 하나로 충분하다).
  const expectedLen = Array.isArray(accepted) && Array.isArray(accepted[0]) && accepted[0].length > 0
    ? accepted[0].length
    : bank.length;

  const [bankUsed, setBankUsed] = useState(() => bank.map(() => false));
  // slots[pos] = bank 인덱스 | null — 고정 길이(expectedLen) 슬롯 배열. 드래그로 중간 자리만
  // 채운 상태(빈칸 사이 공백)도 그대로 표현된다.
  const [slots, setSlots] = useState(() => Array(expectedLen).fill(null));

  // 단어 뜻 말풍선(사전 조회) — prefix/suffix 고정 텍스트만 탭 대상. 한 번에 하나만.
  const [lookup, setLookup] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lookupReqRef = useRef(0);
  const speakGenRef = useRef(0);

  // 드래그 앤 드롭(pointer events, 새 라이브러리 없음) — pointerStartRef 는 pointerdown 시점
  // 정보(탭/드래그 판정 전), dragRef 는 6px 임계값을 넘어 "드래그"로 확정된 뒤의 실시간 상태
  // (렌더에 쓰는 dragVisual state 와 항상 동기화). elementFromPoint 로 지금 손가락 아래
  // 어떤 슬롯/은행 위인지 찾는다(별도 라이브러리 없이 순수 pointer events로 구현).
  const pointerStartRef = useRef(null);
  const dragRef = useRef(null);
  const [dragVisual, setDragVisual] = useState(null);

  const disabled = isAnswered;
  const userTokens = slots.map((idx) => (idx != null ? bank[idx] : undefined));
  const { correctFlags } = disabled ? diffAgainstAccepted(userTokens, accepted) : { correctFlags: [] };
  const allFilled = slots.length > 0 && slots.every((s) => s != null);
  const nextEmptyIndex = slots.findIndex((s) => s == null);

  const prefixTokens = tokenizeWords(prefix);
  const suffixTokens = tokenizeWords(suffix);

  // ─── 슬롯 조작(배치·교체·이동·제거) — 탭과 드래그 드롭 모두 이 함수들로 귀결된다 ───────────

  const placeBankIntoSlot = (bankIdx, slotPos) => {
    const displaced = slots[slotPos];
    setSlots((prev) => {
      const next = [...prev];
      next[slotPos] = bankIdx;
      return next;
    });
    setBankUsed((prev) => {
      const next = [...prev];
      next[bankIdx] = true;
      if (displaced != null && displaced !== bankIdx) next[displaced] = false;
      return next;
    });
    onPiecePlaced?.(bank[bankIdx]);
  };

  const moveSlotToSlot = (fromPos, toPos) => {
    if (fromPos === toPos) return;
    const movingIdx = slots[fromPos];
    if (movingIdx == null) return;
    const targetIdx = slots[toPos];
    setSlots((prev) => {
      const next = [...prev];
      next[toPos] = movingIdx;
      next[fromPos] = targetIdx ?? null;
      return next;
    });
    onPiecePlaced?.(bank[movingIdx]);
  };

  const removeSlotToBank = (pos) => {
    const bankIdx = slots[pos];
    if (bankIdx == null) return;
    setSlots((prev) => {
      const next = [...prev];
      next[pos] = null;
      return next;
    });
    setBankUsed((prev) => {
      const next = [...prev];
      next[bankIdx] = false;
      return next;
    });
  };

  const tapBank = (i) => {
    if (disabled || bankUsed[i]) return;
    const target = slots.findIndex((s) => s == null);
    if (target === -1) return;
    haptic('light');
    placeBankIntoSlot(i, target);
  };

  const tapTray = (pos) => {
    if (disabled || slots[pos] == null) return;
    haptic('light');
    removeSlotToBank(pos);
  };

  // ─── 드래그(pointer events) — 뱅크 칩/트레이 칩 공용. 짧은 탭은 기존 tap 동작으로 위임 ───────

  const beginPointer = (e, { bankIdx, fromSlot }) => {
    if (disabled) return;
    if (fromSlot == null && bankUsed[bankIdx]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      bankIdx,
      fromSlot,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      pointerId: e.pointerId,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 캡처 미지원 브라우저 — 무해 */ }
  };

  const handlePointerMove = (e) => {
    const start = pointerStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragRef.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      // 임계값을 넘은 순간 "드래그"로 확정 — 스크롤 방지는 draggable 요소의 touch-none(CSS)이 맡는다.
      dragRef.current = {
        bankIdx: start.bankIdx,
        fromSlot: start.fromSlot,
        x: e.clientX - start.offsetX,
        y: e.clientY - start.offsetY,
        width: start.width,
        overSlot: null,
        overBank: false,
      };
      haptic('light');
      setDragVisual(dragRef.current);
      return;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const slotEl = el?.closest?.('[data-arrange-slot]');
    const overSlot = slotEl ? Number(slotEl.getAttribute('data-arrange-slot')) : null;
    const overBank = !!el?.closest?.('[data-arrange-bank]');
    dragRef.current = {
      ...dragRef.current,
      x: e.clientX - start.offsetX,
      y: e.clientY - start.offsetY,
      overSlot,
      overBank,
    };
    setDragVisual(dragRef.current);
  };

  const finishPointer = (e, { cancel = false } = {}) => {
    const start = pointerStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    pointerStartRef.current = null;
    const dragState = dragRef.current;
    dragRef.current = null;
    setDragVisual(null);
    if (cancel) return;
    if (!dragState) {
      // 이동 없이 뗐다 — 기존 탭 동작.
      if (start.fromSlot != null) tapTray(start.fromSlot);
      else tapBank(start.bankIdx);
      return;
    }
    if (dragState.overSlot != null) {
      if (start.fromSlot != null) moveSlotToSlot(start.fromSlot, dragState.overSlot);
      else placeBankIntoSlot(start.bankIdx, dragState.overSlot);
    } else if (dragState.overBank && start.fromSlot != null) {
      removeSlotToBank(start.fromSlot);
    }
    // 그 외(트레이/은행 밖 허공에 놓음) — 취소, 상태 변화 없음.
  };

  const handlePointerUp = (e) => finishPointer(e);
  const handlePointerCancel = (e) => finishPointer(e, { cancel: true });

  const handleConfirm = () => {
    if (disabled || !allFilled) return;
    haptic('light');
    onSubmit(slots.map((i) => bank[i]));
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

  // 말풍선은 document.body 포털(WordInfoBubble) + position:fixed 라 anchor 는 탭한 단어의
  // 뷰포트 기준 getBoundingClientRect() 를 그대로 쓴다 — 카드 좌표계 변환이 필요 없다(2026-09-29).
  const handleWordTap = (e, key, cleanWord) => {
    e.stopPropagation();
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
    speakWord(cleanWord);

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
                <span className="text-layout-gray-300 dark:text-layout-gray-100 font-[600]">
                  {renderFixedWords(prefixTokens, 'p')}{' '}
                </span>
              )}
              {slots.map((bankIdx, pos) => {
                const filled = bankIdx != null;
                const flag = disabled && filled ? correctFlags[pos] : null;
                const isNext = !disabled && pos === nextEmptyIndex;
                const isDragOver = !!dragVisual && dragVisual.overSlot === pos && dragVisual.fromSlot !== pos;
                const isDragSource = !!dragVisual && dragVisual.fromSlot === pos;
                const chipStyle = flag === true
                  ? 'bg-status-success-100 dark:bg-status-success-dark border-status-success-500 text-status-success-700 dark:text-status-success-300'
                  : flag === false
                    ? 'bg-status-error-100 dark:bg-status-error-dark border-status-error-500 text-status-error-600 dark:text-status-error-300 line-through'
                    : 'bg-layout-white dark:bg-layout-black border-layout-gray-200 dark:border-[#3A3A3A] text-layout-black dark:text-layout-white';
                return (
                  // 슬롯 바깥 상자 — 빈 슬롯 밑줄과 채운 칩을 항상 같은 높이(SLOT_BOX_H)로 감싸고
                  // 아래쪽(items-end)에 붙인다: 밑줄의 border-bottom과 칩의 아래쪽 테두리가
                  // 정확히 같은 y좌표에 온다(2026-09-29) — 칩이 들어와도 상자 높이가 바뀌지
                  // 않아 레이아웃이 튀지 않는다. data-arrange-slot은 드래그 드롭 판정용.
                  <span
                    key={`slot-${pos}`}
                    data-arrange-slot={pos}
                    className={`
                      inline-flex items-end justify-center
                      mx-[3px] my-[2px] align-middle
                      transition-colors duration-100
                      ${isDragOver ? 'rounded-[8px] bg-primary-main-100 dark:bg-primary-main-dark/60' : ''}
                    `}
                    style={{ height: SLOT_BOX_H }}
                  >
                    {filled ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onPointerDown={(e) => beginPointer(e, { bankIdx, fromSlot: pos })}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerCancel}
                        className={`
                          inline-flex items-center justify-center
                          px-[9px]
                          border-[1px]
                          rounded-[6px]
                          touch-none
                          ${chipStyle}
                          ${isDragSource ? 'opacity-30' : ''}
                        `}
                        style={{ height: SLOT_CHIP_H }}
                      >
                        {bank[bankIdx]}
                      </button>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`
                          block w-[30px] h-0
                          border-b-[3px]
                          ${isNext
                            ? `border-primary-main-400 dark:border-primary-main-300 ${reducedMotion ? '' : 'animate-pulse'}`
                            : 'border-layout-gray-300 dark:border-[#4A4A4A]'}
                        `}
                      />
                    )}
                  </span>
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

        {/* 단어 뜻 말풍선 — document.body 포털(WordInfoBubble)이라 카드가 잘라도 잘리지 않는다. */}
        <AnimatePresence>
          {lookup && (
            <WordInfoBubble
              key={lookup.key}
              anchor={lookup.anchor}
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

        <FarmResultBar
          farm={farm}
          replayKey={resumeReplayKey}
          onAnimStart={advanceGate.farmStarted}
          onSettled={advanceGate.farmSettled}
        />
      </motion.div>

      {/* 조각 은행 + 확인/다음 */}
      <div className="flex-shrink-0 flex flex-col gap-[10px]">
        {/* data-arrange-bank — 채워진 칩을 이 구역으로 끌어오면 슬롯에서 빼서 은행으로 되돌린다. */}
        <div data-arrange-bank="" className="flex flex-wrap justify-center gap-[8px]">
          {bank.map((token, i) => (
            <motion.button
              key={i}
              type="button"
              disabled={disabled || bankUsed[i]}
              onPointerDown={(e) => beginPointer(e, { bankIdx: i, fromSlot: null })}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              whileTap={!bankUsed[i] ? { scale: 0.92 } : undefined}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className={`
                min-h-[46px] px-[16px]
                flex items-center justify-center
                bg-layout-white dark:bg-layout-black
                border-[1px] border-b-[3px] border-layout-gray-200 dark:border-[#3A3A3A]
                rounded-[10px]
                text-[16px] font-[700] text-layout-black dark:text-layout-white
                touch-none
                ${bankUsed[i] ? 'invisible' : ''}
                ${dragVisual && dragVisual.fromSlot == null && dragVisual.bankIdx === i ? 'opacity-30' : ''}
              `}
            >
              {token}
            </motion.button>
          ))}
        </div>
        <motion.button
          type="button"
          disabled={isAnswered ? false : !allFilled}
          whileTap={(isAnswered || allFilled) ? { scale: 0.97 } : undefined}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          onClick={isAnswered ? onNext : handleConfirm}
          className={`
            h-[50px] rounded-[12px]
            text-[16px] font-[700]
            ${(!isAnswered && !allFilled)
              ? 'bg-layout-gray-200 dark:bg-[#2A2A2A] text-layout-gray-400 dark:text-layout-gray-300'
              : 'bg-primary-main-600 text-layout-white'}
          `}
        >
          {isAnswered ? '다음' : '확인'}
        </motion.button>
      </div>

      {/* 드래그 중 손가락을 따라다니는 조각 — document.body 포털 + fixed 라 트레이 카드의
          overflow-hidden 에 잘리지 않는다(2026-09-29). */}
      {dragVisual && typeof document !== 'undefined' && createPortal(
        <div
          className="
            fixed z-[1200] pointer-events-none
            inline-flex items-center justify-center
            px-[9px]
            border-[1px] rounded-[6px]
            bg-layout-white dark:bg-layout-black
            border-primary-main-500
            text-[16px] font-[700] text-layout-black dark:text-layout-white
            shadow-[0_6px_16px_rgba(0,0,0,0.2)]
          "
          style={{ left: dragVisual.x, top: dragVisual.y, height: SLOT_CHIP_H, width: dragVisual.width }}
        >
          {bank[dragVisual.bankIdx]}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ArrangeTray;
