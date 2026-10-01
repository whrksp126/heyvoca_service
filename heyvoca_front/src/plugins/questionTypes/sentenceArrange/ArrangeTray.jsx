import { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { FarmResultBar } from '../../../components/farm/FarmStatusBar';
import StudyTimingTag from '../../../components/farm/StudyTimingTag';
import LiftAboveBar from '../../../components/common/LiftAboveBar';
import WordInfoBubble from '../../../components/common/WordInfoBubble';
import ResultMark from '../../../components/common/ResultMark';
import { getWordInfoApi } from '../../../api/search';
import { getTextSound } from '../../../utils/common';
import { haptic } from '../../../lib/feel';
import { diffAgainstAccepted, tokenizeWords, stripTags } from './arrangeUtils';

/*
  구두점 복원(2026-09-29) — bank/prefix/suffix는 서버가 "문장 중간 표기"로 정규화해서
  내려주는 조각이라 콤마·마침표 등 구두점이 전부 빠져 있다(계약 3-1절). 유일하게 구두점이
  살아있는 곳은 answer_text(원문 전체) 뿐이라, 그 문장을 낱말 단위로 다시 쪼개서
  "낱말 순서 i번째의 앞/뒤 구두점"만 뽑아 온다. 대소문자는 건드리지 않는다(단어 표시는
  여전히 bank/prefix/suffix의 clean 텍스트를 쓰고, 구두점만 앞뒤에 얹는다) — 목표 단어
  첫 글자 대문자가 정답 힌트가 되는 규칙을 그대로 유지하기 위함.
  prefix 낱말 수만큼 오프셋을 두면 그 뒤로 슬롯(조립 구간) 낱말들이, 슬롯 개수만큼 더
  오프셋을 두면 suffix 낱말들이 이어진다 — 최종 문장이 prefix+슬롯+suffix 순서로 원문과
  1:1 대응한다는 계약(§3-1 표시 규칙)을 그대로 이용한 매핑이다.
*/
const EDGE_LEADING_RE = /^[^A-Za-z0-9']+/;
const EDGE_TRAILING_RE = /[^A-Za-z0-9']+$/;
const answerWordEdgePunct = (answerText) => {
  const words = tokenizeWords(stripTags(answerText)).filter((t) => t.type === 'word');
  return words.map((t) => ({
    leading: (t.text.match(EDGE_LEADING_RE) || [''])[0],
    trailing: (t.text.match(EDGE_TRAILING_RE) || [''])[0],
  }));
};

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

// 칩 공용 크기 — 트레이(슬롯) 칩과 은행(bank) 칩이 완전히 같은 높이·패딩·테두리(아래쪽
// 두꺼운 3D 테두리 포함)·글자 크기를 쓰도록 한곳에서 정의한다(2026-09-29). 드래그 고스트
// 칩·드래그 중 떠다니는 칩도 이 상수를 그대로 쓴다.
const CHIP_H = 46;
const CHIP_PAD_X = 'px-[16px]';
const CHIP_BORDER = 'border-[1px] border-b-[3px]';
const CHIP_RADIUS = 'rounded-[10px]';
const CHIP_FONT = 'text-[16px] font-[700]';
const CHIP_BASE_CLASS = `${CHIP_PAD_X} ${CHIP_BORDER} ${CHIP_RADIUS} ${CHIP_FONT}`;

// 슬롯(빈칸/칩) 한 칸의 바깥 상자 높이 — 빈 슬롯 밑줄과 채운 칩의 아래쪽 테두리가 항상 같은
// y 좌표에 오도록, 둘 다 이 높이의 상자 안에서 아래쪽(items-end)에 붙인다(2026-09-29).
// 칩 높이(CHIP_H)와 맞춰 은행 칩과 동일한 크기로 보이게 한다.
const SLOT_BOX_H = CHIP_H;
const SLOT_CHIP_H = CHIP_H;
const DRAG_THRESHOLD_PX = 6;
// 드래그 중 대상 슬롯 판정 — 정확히 슬롯 사각형 안에 놓아야만 인식되던 것을 완화한다
// (2026-09-29 재작업). 포인터에서 가장 가까운 슬롯 "중심"을 찾되, y(줄) 차이에 이 배율을
// 곱해 거리로 환산 — 같은 줄 안에서는 x가 좀 멀어도 그 줄의 슬롯을 우선 고르고, 줄이
// 바뀔 만큼 y가 크게 벌어져야만 다른 줄로 넘어간다.
const NEAREST_SLOT_Y_WEIGHT = 2.5;
// 카드 경계 밖이라도 이 여유(px)까지는 "카드 안"으로 쳐서 가장 가까운 슬롯을 찾는다 —
// 손가락이 카드 테두리에 살짝 걸쳐도 취소되지 않게.
const CARD_HIT_MARGIN_PX = 28;
// 조각 은행 구역 판정 여유 — 은행 위에 놓아 칩을 빼는 동작을 관대하게 인식한다(트레이 여유보다
// 우선 판정). 판정 사각형은 전부 드래그 확정 시점에 한 번 캐시한다(2026-10-02, 아래 주석).
const BANK_HIT_MARGIN_PX = 12;
// 놓은 뒤 고스트가 목적지(슬롯/원래 자리)로 미끄러져 들어가는 시간(ms). 길지 않게.
const SETTLE_MS = 140;
// 빈 슬롯 밑줄 너비 — 칩이 들어올 때 줄바꿈 위치가 덜 흔들리도록 조금 넉넉히 잡는다.
const EMPTY_SLOT_W = 'w-[48px]';

const ArrangeTray = ({
  bank,
  prefix,
  suffix,
  // 정답 인정 순서 목록(§3-1 accepted) — 채울 슬롯 개수·오답 상세 비교(diffAgainstAccepted)의
  // 기준. 부모(Sentence/ListenArrangeQuestion)가 arrange.accepted를 그대로 넘긴다.
  accepted = [],
  // prefix/suffix 단어 탭 시 사전 조회·TTS에 쓸 언어 — 부모가 wordLang(question) 그대로 넘긴다.
  answerLang = 'en',
  // 원문 전체(구두점 포함, <strong> 태그 있음) — 부모가 arrange.answer_text 그대로 넘긴다.
  // 이 트레이가 표시용 구두점을 복원하는 유일한 소스(위 answerWordEdgePunct 주석 참고).
  answerText = '',
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
  // dragVisual 은 "렌더에 필요한 값"(어느 슬롯/은행 위인지, 원본 칩, 폭)만 담는다 — 손가락 좌표는
  // 넣지 않는다. 좌표는 ghostPosRef + DOM transform 직접 갱신으로만 흘려서(리렌더 0회/move)
  // 드래그 중 깜빡임·reflow 를 없앤다(2026-10-02). overSlot/overBank 가 바뀔 때만 리렌더.
  const [dragVisual, setDragVisual] = useState(null);
  const ghostElRef = useRef(null);
  const ghostPosRef = useRef({ x: 0, y: 0, scale: 1.05, animate: false });
  const settlingRef = useRef(false);
  const settleTimerRef = useRef(null);
  const bankWrapRef = useRef(null);
  const bankChipRefs = useRef({});
  // 트레이 카드(문장 영역) 바깥 상자 — "카드 안 어디에 놓든 가장 가까운 슬롯" 판정의 기준
  // 사각형. slotRefs는 pos -> 슬롯 바깥 상자 DOM, 매 pointermove마다 실측 좌표로 가장 가까운
  // 슬롯을 찾는다(레이아웃이 고정 길이라 슬롯 개수가 적어 매번 재계산해도 비용이 작다).
  const trayCardRef = useRef(null);
  const slotRefs = useRef({});
  const registerSlotRef = (pos) => (el) => {
    if (el) slotRefs.current[pos] = el;
    else delete slotRefs.current[pos];
  };

  useEffect(() => () => { if (settleTimerRef.current) clearTimeout(settleTimerRef.current); }, []);

  const disabled = isAnswered;
  const userTokens = slots.map((idx) => (idx != null ? bank[idx] : undefined));
  const { correctFlags } = disabled ? diffAgainstAccepted(userTokens, accepted) : { correctFlags: [] };
  const allFilled = slots.length > 0 && slots.every((s) => s != null);
  const nextEmptyIndex = slots.findIndex((s) => s == null);

  const prefixTokens = tokenizeWords(prefix);
  const suffixTokens = tokenizeWords(suffix);
  // 원문 낱말 순서 인덱스 — prefix 낱말 수만큼 오프셋을 두면 그 뒤가 슬롯(조립 구간),
  // 슬롯 개수(expectedLen)만큼 더 두면 그 뒤가 suffix (위 파일 상단 주석 참고).
  const answerPunct = useMemo(() => answerWordEdgePunct(answerText), [answerText]);
  const prefixWordCount = useMemo(() => prefixTokens.filter((t) => t.type === 'word').length, [prefixTokens]);
  const suffixWordOffset = prefixWordCount + expectedLen;

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
    if (disabled || settlingRef.current) return;
    if (fromSlot == null && bankUsed[bankIdx]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      bankIdx,
      fromSlot,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      rectLeft: rect.left,
      rectTop: rect.top,
      width: rect.width,
      height: rect.height,
      pointerId: e.pointerId,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 캡처 미지원 브라우저 — 무해 */ }
  };

  // 고스트 위치 반영 — React 상태가 아니라 DOM transform 을 직접 바꾼다(reflow 없음, compositor 전용).
  const applyGhostPos = (el) => {
    if (!el) return;
    const { x, y, scale, animate } = ghostPosRef.current;
    el.style.transition = animate ? `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : 'none';
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
  };

  // 포인터에서 가장 가까운 슬롯 찾기 — 드래그 확정 시점에 캐시한 사각형(rects.slotRects)만 쓴다.
  // 드래그 중에는 레이아웃이 변하지 않으므로(고스트는 transform, 하이라이트는 absolute) 캐시가
  // 항상 유효하고, 판정 대상이 움직여 깜빡이는 일이 없다. y 거리에 가중치를 줘서 같은 줄 우선.
  const findNearestSlot = (slotRects, x, y) => {
    let bestPos = null;
    let bestDist = Infinity;
    Object.entries(slotRects).forEach(([posStr, rect]) => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(x - cx, (y - cy) * NEAREST_SLOT_Y_WEIGHT);
      if (dist < bestDist) {
        bestDist = dist;
        bestPos = Number(posStr);
      }
    });
    return bestPos;
  };

  const isPointInRect = (rect, x, y, margin) => !!rect
    && x >= rect.left - margin && x <= rect.right + margin
    && y >= rect.top - margin && y <= rect.bottom + margin;

  const handlePointerMove = (e) => {
    const start = pointerStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const gx = e.clientX - start.offsetX;
    const gy = e.clientY - start.offsetY;
    if (!dragRef.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      // 임계값을 넘은 순간 "드래그"로 확정 + 판정 사각형 캐시(슬롯·트레이·은행).
      const slotRects = {};
      Object.entries(slotRefs.current).forEach(([pos, el]) => {
        if (el) slotRects[pos] = el.getBoundingClientRect();
      });
      dragRef.current = {
        bankIdx: start.bankIdx,
        fromSlot: start.fromSlot,
        width: start.width,
        height: start.height,
        slotRects,
        trayRect: trayCardRef.current?.getBoundingClientRect() ?? null,
        bankRect: bankWrapRef.current?.getBoundingClientRect() ?? null,
        overSlot: null,
        overBank: false,
      };
      ghostPosRef.current = { x: gx, y: gy, scale: 1.05, animate: false };
      haptic('light');
      setDragVisual({
        bankIdx: start.bankIdx,
        fromSlot: start.fromSlot,
        width: start.width,
        overSlot: null,
        overBank: false,
        settling: false,
      });
      return;
    }
    const d = dragRef.current;
    ghostPosRef.current = { x: gx, y: gy, scale: 1.05, animate: false };
    applyGhostPos(ghostElRef.current);
    const overBank = isPointInRect(d.bankRect, e.clientX, e.clientY, BANK_HIT_MARGIN_PX);
    const overSlot = (!overBank && isPointInRect(d.trayRect, e.clientX, e.clientY, CARD_HIT_MARGIN_PX))
      ? findNearestSlot(d.slotRects, e.clientX, e.clientY)
      : null;
    if (overSlot !== d.overSlot || overBank !== d.overBank) {
      d.overSlot = overSlot;
      d.overBank = overBank;
      setDragVisual((prev) => (prev ? { ...prev, overSlot, overBank } : prev));
    }
  };

  const finishPointer = (e, { cancel = false } = {}) => {
    const start = pointerStartRef.current;
    if (!start || e.pointerId !== start.pointerId) return;
    pointerStartRef.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) {
      setDragVisual(null);
      if (cancel) return;
      // 이동 없이 뗐다 — 기존 탭 동작.
      if (start.fromSlot != null) tapTray(start.fromSlot);
      else tapBank(start.bankIdx);
      return;
    }

    // 목적지 결정 — 슬롯 위: 그 슬롯 중앙 / 은행 위(슬롯 칩): 원래 은행 자리 / 그 외: 출발 자리로 복귀.
    let commit = null;
    let tx = start.rectLeft;
    let ty = start.rectTop;
    if (!cancel && d.overSlot != null) {
      const r = d.slotRects[d.overSlot];
      if (r) {
        tx = r.left + r.width / 2 - d.width / 2;
        ty = r.top + r.height / 2 - d.height / 2;
      }
      commit = () => {
        haptic('light');
        if (start.fromSlot != null) moveSlotToSlot(start.fromSlot, d.overSlot);
        else placeBankIntoSlot(start.bankIdx, d.overSlot);
      };
    } else if (!cancel && d.overBank && start.fromSlot != null) {
      const r = bankChipRefs.current[start.bankIdx]?.getBoundingClientRect();
      if (r) {
        tx = r.left + r.width / 2 - d.width / 2;
        ty = r.top + r.height / 2 - d.height / 2;
      }
      commit = () => {
        haptic('light');
        removeSlotToBank(start.fromSlot);
      };
    }
    // 그 외(허공에 놓음/취소) — 출발 자리로 되돌아가며 상태 변화 없음.

    if (reducedMotion) {
      setDragVisual(null);
      commit?.();
      return;
    }
    settlingRef.current = true;
    ghostPosRef.current = { x: tx, y: ty, scale: 1, animate: true };
    applyGhostPos(ghostElRef.current);
    setDragVisual((prev) => (prev ? { ...prev, settling: true } : prev));
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      settlingRef.current = false;
      commit?.();
      setDragVisual(null);
    }, SETTLE_MS);
  };

  const handlePointerUp = (e) => finishPointer(e);
  const handlePointerCancel = (e) => finishPointer(e, { cancel: true });

  const handleConfirm = () => {
    if (disabled || !allFilled || settlingRef.current) return;
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

  // wordOffset — 이 tokens 배열의 첫 낱말이 원문(answer_text) 전체에서 몇 번째 낱말인지.
  // prefix는 0, suffix는 suffixWordOffset(=prefix 낱말 수 + 슬롯 개수)부터 시작한다.
  const renderFixedWords = (tokens, area, wordOffset) => {
    let wordIdx = 0;
    return tokens.map((tok, i) => {
      const key = `${area}-${i}`;
      if (tok.type !== 'word') return <span key={key}>{tok.text}</span>;
      const punct = answerPunct[wordOffset + wordIdx];
      wordIdx += 1;
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
          {punct?.leading}{tok.clean}{punct?.trailing}
        </button>
      );
    });
  };

  return (
    <div className="flex flex-col gap-[15px] flex-1 min-h-0">
      {/* 트레이 카드 */}
      <motion.div
        ref={trayCardRef}
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
            {/* 문장 글자 크기(17px)는 칩 글자 크기(16px, CHIP_FONT)와 어울리도록 낮췄다(2026-09-29) —
                이전 19px는 트레이 칩이 커지면서 고정 단어(prefix/suffix)만 도드라져 보였다. */}
            <p className="w-full text-[17px] font-[700] leading-[1.9] text-layout-black dark:text-layout-white break-keep">
              {prefix && (
                <span className="text-layout-gray-300 dark:text-layout-gray-100 font-[600]">
                  {renderFixedWords(prefixTokens, 'p', 0)}{' '}
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
                    ? 'bg-status-error-100 dark:bg-status-error-dark border-status-error-500 text-status-error-600 dark:text-status-error-300'
                    : 'bg-layout-white dark:bg-layout-black border-layout-gray-200 dark:border-[#3A3A3A] text-layout-black dark:text-layout-white';
                // 이 슬롯이 원문에서 몇 번째 낱말인지(prefixWordCount + pos) → 그 낱말의 앞/뒤
                // 구두점만 얻어 슬롯 밖(칩/밑줄과 별개)에 고정 텍스트로 붙인다(2026-09-29).
                const slotPunct = answerPunct[prefixWordCount + pos] || {};
                return (
                  // display:contents 래퍼 — 구두점(leading/trailing)을 슬롯 바깥에 형제로 붙이되
                  // 문장의 inline 흐름 자체는 그대로 유지한다(래퍼 자신은 박스를 만들지 않음).
                  <span key={`slot-wrap-${pos}`} style={{ display: 'contents' }}>
                    {slotPunct.leading && <span aria-hidden="true">{slotPunct.leading}</span>}
                    {/* 슬롯 바깥 상자 — 빈 슬롯 밑줄과 채운 칩을 항상 같은 높이(SLOT_BOX_H)로 감싸고
                        아래쪽(items-end)에 붙인다: 밑줄의 border-bottom과 칩의 아래쪽 테두리가
                        정확히 같은 y좌표에 온다(2026-09-29) — 칩이 들어와도 상자 높이가 바뀌지
                        않아 레이아웃이 튀지 않는다. data-arrange-slot/registerSlotRef는 드래그
                        판정(가장 가까운 슬롯 찾기)용 — 작은 사각형 하이라이트 대신 대상 슬롯 자리에
                        드래그 중인 단어의 고스트 칩을 직접 그려서 "여기 놓인다"를 보여준다(2026-09-29 재작업). */}
                    <span
                      data-arrange-slot={pos}
                      ref={registerSlotRef(pos)}
                      className="inline-flex items-end justify-center mx-[3px] my-[2px] align-middle"
                      style={{ height: SLOT_BOX_H }}
                    >
                    {filled ? (
                      <motion.button
                        key={`chip-${pos}-${bankIdx}`}
                        type="button"
                        // 네이티브 disabled 를 걸면 채점 후 click 이벤트 자체가 발생하지 않아
                        // 사전 말풍선을 열 수 없다(2026-09-29) — 항상 클릭 가능하게 열어 두고,
                        // 채점 전 배치/교체/빼기는 pointer 핸들러의 disabled 가드가 그대로 막는다.
                        disabled={false}
                        onPointerDown={(e) => beginPointer(e, { bankIdx, fromSlot: pos })}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerCancel}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={(e) => {
                          // pointerup 뒤에 따라오는 네이티브 click — 채점 전에는 pointer 핸들러가
                          // 이미 탭/드래그(배치·교체·빼기)를 처리했으므로 여기서는 아무 것도 하지
                          // 않는다. 채점 후에만 일반 단어 탭과 동일하게 사전 말풍선을 연다.
                          if (!disabled) return;
                          handleWordTap(e, `chip-${pos}`, bank[bankIdx]);
                        }}
                        // 고스트가 이미 그 자리로 미끄러져 들어온 뒤 확정되므로 팝인 애니메이션은
                        // 두지 않는다(겹쳐 보이면 깜빡임) — 레이아웃·크기 변화 없이 바로 나타난다.
                        className={`
                          inline-flex items-center justify-center
                          ${CHIP_BASE_CLASS}
                          touch-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none]
                          ${chipStyle}
                          ${isDragSource ? 'opacity-30' : ''}
                          ${isDragOver ? 'ring-2 ring-primary-main-400 dark:ring-primary-main-300' : ''}
                        `}
                        style={{ height: SLOT_CHIP_H }}
                      >
                        {bank[bankIdx]}
                      </motion.button>
                    ) : (
                      <span
                        aria-hidden="true"
                        className={`
                          relative block ${EMPTY_SLOT_W} h-0
                          border-b-[3px]
                          ${isNext
                            ? `border-primary-main-400 dark:border-primary-main-300 ${reducedMotion ? '' : 'animate-pulse'}`
                            : 'border-layout-gray-300 dark:border-[#4A4A4A]'}
                          ${isDragOver ? '!border-primary-main-500 dark:!border-primary-main-300' : ''}
                        `}
                      >
                        {/* 드롭 대상 표시 — absolute 오버레이라 슬롯 크기/줄바꿈에 영향 0. */}
                        {isDragOver && (
                          <span
                            className="
                              absolute left-[-4px] right-[-4px] bottom-[-3px]
                              rounded-[10px] border-[1.5px] border-dashed
                              border-primary-main-400 dark:border-primary-main-300
                              bg-primary-main-50/70 dark:bg-primary-main-dark/30
                            "
                            style={{ height: SLOT_CHIP_H }}
                          />
                        )}
                      </span>
                    )}
                    </span>
                    {slotPunct.trailing && <span aria-hidden="true">{slotPunct.trailing}</span>}
                  </span>
                );
              })}
              {suffix && (
                <span className="text-layout-gray-300 dark:text-layout-gray-100 font-[600]">
                  {' '}{renderFixedWords(suffixTokens, 's', suffixWordOffset)}
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

        {/* O/X — 카드 정중앙. 다른 유형과 같은 공용 ResultMark(2026-09-29) — 정답/오답 모두
            표시하고 약 600ms 후 페이드아웃해 아래 칩 정오답 색·정답 문장이 바로 보인다. */}
        <ResultMark
          result={isCorrect}
          replayKey={resumeReplayKey}
          className="absolute inset-0 z-[3] flex items-center justify-center"
        />

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
        <div ref={bankWrapRef} data-arrange-bank="" className="flex flex-wrap justify-center gap-[8px]">
          {bank.map((token, i) => (
            <motion.button
              key={i}
              ref={(el) => { if (el) bankChipRefs.current[i] = el; else delete bankChipRefs.current[i]; }}
              type="button"
              disabled={disabled || bankUsed[i]}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => beginPointer(e, { bankIdx: i, fromSlot: null })}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              whileTap={!bankUsed[i] ? { scale: 0.92 } : undefined}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className={`
                min-h-[46px]
                flex items-center justify-center
                bg-layout-white dark:bg-layout-black
                ${CHIP_BASE_CLASS}
                border-layout-gray-200 dark:border-[#3A3A3A]
                text-layout-black dark:text-layout-white
                touch-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none]
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
          overflow-hidden 에 잘리지 않는다(2026-09-29). 포인터다운 시점의 칩 내 오프셋을
          유지해서(beginPointer의 offsetX/offsetY) 손가락 바로 아래에서 위로 치우치지 않게
          따라오고, scale 1.05 + 그림자로 살짝 들어올려진 느낌을 준다(2026-09-29 재작업). */}
      {dragVisual && typeof document !== 'undefined' && createPortal(
        <div
          ref={(el) => { ghostElRef.current = el; applyGhostPos(el); }}
          aria-hidden="true"
          className={`
            fixed left-0 top-0 z-[1200] pointer-events-none touch-none will-change-transform
            inline-flex items-center justify-center
            ${CHIP_BASE_CLASS}
            bg-layout-white dark:bg-layout-black
            border-primary-main-500
            text-layout-black dark:text-layout-white
            ${dragVisual.settling ? 'shadow-[0_2px_4px_rgba(0,0,0,0.12)]' : 'shadow-[0_10px_20px_rgba(0,0,0,0.25)]'}
          `}
          style={{ height: SLOT_CHIP_H, width: dragVisual.width }}
        >
          {bank[dragVisual.bankIdx]}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ArrangeTray;
