// src/components/home/TodayTasksCard.jsx
//
// 홈 — "오늘 할 일" 카드 (2026-09-27 확정 목업, scratchpad/home10/IMPL_SPEC.md).
//
// CTA 바로 아래, 기존 "지금 볼 만한 단어"(care·rotten)를 대신한다 — 같은 사실(썩은 단어·
// 시듦·돌봄)을 개수 카드와 목록 카드 두 곳에서 반복하지 않는다(Main.jsx 정리 참고).
//
// 행 4개, 고정 순서. 0인 행은 숨긴다 — 썩은 단어 / 시듦 물주기 / 오늘 돌봄 물주기 / 새 씨앗 심기.
// 오늘 살린 단어가 있고 남은 부패가 0이면 썩은 단어 행은 다른 행처럼 체크 + 진행 x/y 로 남는다(rotten.done).
// 이슈 #25 13차 — '연속 학습' 카드를 이 카드에 합쳤다(머리말 오른쪽 연속 일수 · 아래 1주 줄) +
// 홈에 돌아왔을 때 새로 달성한 줄 · 오늘 불꽃 점화를 연출한다(아래 '달성 연출' 주석).
// 2026-10-25(이슈 #16 §4) — 줄(정보)만 남긴다. 우측 '살리기'·'심기' 버튼과 카드 아래 넓은
// '새 씨앗 심기' 버튼은 뺐다 — 학습 진입은 홈 '농사 시작' → 학습 고르기 시트
// (newBottomSheet/StudyPickNewBottomSheet)가 한 곳에서 맡는다(살리기·심기 동작도 그쪽으로 옮겼다).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import { useStats } from '../../context/StatsContext';
import { useUser } from '../../context/UserContext';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { vibrate } from '../../utils/osFunction';
import { feel, SPRING, useCountUp } from '../../lib/feel';
import { useStreakCard } from './StreakCard';
import StreakCardBody, { StreakHeaderPill } from '../streak/StreakCardView';
import {
  useHomeScreenClear, isHomeScreenBusy, questPendingCount, questCelebrationMs,
  START_SETTLE_MS, START_RETRY_MS,
} from './homeCelebrationGate';

const VISIBLE_WORDS = 3;

/** 우측 진행 x/y — 완료 여부는 왼쪽 체크로 이미 드러나므로 배지 없이 숫자만,
 *  완료 시 회색으로 낮춘다(개수 자체는 계속 보여준다). */
const Progress = ({ done, total }) => {
  const isDone = total > 0 && done >= total;
  return (
    <span className="shrink-0 flex items-baseline gap-[1px]">
      <b className={`text-[17px] font-[800] ${isDone ? 'text-[#BBBBBB]' : 'text-layout-black dark:text-layout-white'}`}>
        {done}
      </b>
      <span className={`text-[14px] font-[700] ${isDone ? 'text-[#BBBBBB]' : 'text-[#AAAAAA]'}`}>/{total}</span>
    </span>
  );
};

/**
 * 단어 목록 — 앞 3개 + '외 N개' → 눌러서 전체 칩으로 펼침.
 *
 * 압축 줄(compact)과 펼친 칩(expandedBlock) 모두 Row의 텍스트 칸(체크박스 오른쪽, 제목과
 * 같은 칼럼) 안에 얹는다 — 그래서 별도 들여쓰기(pl) 계산 없이도 타이틀 텍스트 시작선에
 * 그대로 맞는다. 둘은 동시에 그리지 않는다: 펼치면 compact 는 null 이고, '접기'는 칩 목록
 * 맨 끝에 놓인다.
 */
const buildWordListParts = (words = [], expanded, onToggle) => {
  if (words.length === 0) return { compact: null, expandedBlock: null };
  // 백엔드가 이미 "남은 단어 먼저 + done 단어는 뒤에" 순서로 내려준다(계약 확인).
  // 응답이 어떤 순서로 오든 항상 같은 화면이 되도록 여기서도 같은 규칙으로 다시 나눈다.
  const rest = words.filter((w) => !w.done);
  const done = words.filter((w) => w.done);
  const ordered = [...rest, ...done];
  const visible = ordered.slice(0, VISIBLE_WORDS);
  const hiddenCount = ordered.length - visible.length;

  const isExpanded = expanded && hiddenCount > 0;

  // 펼친 상태에서는 미리보기 줄을 그리지 않는다(단어가 칩 목록에서 한 번만 보이게).
  const compact = isExpanded ? null : (
    <span className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-[13px] font-[600] text-[#5A5A5A]">
      {visible.map((w) => (
        <span key={w.id} className={w.done ? 'text-[#BBBBBB] line-through' : undefined}>
          {w.word}
        </span>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); vibrate({ duration: 5 }); onToggle(); }}
          aria-expanded={false}
          className="text-[13px] font-[700] text-layout-gray-400 underline underline-offset-2"
        >
          {`외 ${hiddenCount}개`}
        </button>
      )}
    </span>
  );

  const expandedBlock = isExpanded ? (
    <span className="flex flex-wrap items-center gap-[6px]">
      {ordered.map((w) => (
        <span
          key={w.id}
          className={`inline-flex items-center h-[28px] px-[10px] rounded-[8px] bg-[#F6F5F2] dark:bg-layout-gray-dark text-[13px] font-[700] ${
            w.done ? 'text-[#BBBBBB] line-through' : 'text-layout-gray-500 dark:text-layout-gray-200'
          }`}
        >
          {w.word}
        </span>
      ))}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); vibrate({ duration: 5 }); onToggle(); }}
        aria-expanded={true}
        className="inline-flex items-center h-[28px] px-[6px] text-[13px] font-[700] text-layout-gray-400 underline underline-offset-2"
      >
        접기
      </button>
    </span>
  ) : null;

  return { compact, expandedBlock };
};

/**
 * 완료 표시용 동그라미 체크박스 — 표시 전용(탭 동작 없음). 미완료=빈 원, 완료=채운 원+체크.
 * draw — 달성 연출 중 막 완료된 줄: 원이 톡 차오르고 체크가 왼쪽부터 그려진다.
 */
const CheckCircle = ({ checked, draw = false }) => (
  <span className="relative shrink-0 mt-[1px] w-[22px] h-[22px]">
    <span className="absolute inset-0 rounded-full border-[1.5px] border-layout-gray-200 dark:border-layout-gray-500" />
    {checked && (
      <motion.span
        className="absolute inset-0 rounded-full bg-status-success-600 flex items-center justify-center"
        initial={draw ? { scale: 0.3, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={draw ? SPRING.bouncy : { duration: 0 }}
      >
        <motion.span
          className="flex"
          initial={draw ? { clipPath: 'inset(0 100% 0 0)' } : false}
          animate={{ clipPath: 'inset(0 0% 0 0)' }}
          transition={draw ? { duration: 0.26, delay: 0.12, ease: 'easeOut' } : { duration: 0 }}
        >
          <Check size={13} weight="bold" className="text-layout-white" />
        </motion.span>
      </motion.span>
    )}
  </span>
);

/*
  단어 목록(sub·expand) 들여쓰기 — 2026-09-29 QA로 제목 왼쪽 인라인 아이콘(새싹·씨앗봉투 등)을
  뺐다. 아이콘이 있을 때는 그 폭(22)+간격(6)만큼 sub 를 들여써 "타이틀 텍스트 시작선"에
  맞췄지만, 이제 제목이 칼럼 맨 앞에서 시작하므로 들여쓰기 없이 그대로 맞춰야 제목과 같은
  시작선에 정렬된다.
*/
const TITLE_TEXT_INDENT = '';

/**
 * 행 한 줄 — [체크박스][제목+단어 목록][우측] · 행 탭(버튼 제외)은 onRowClick.
 * 단어 목록(sub·expand)은 체크박스 칸 밖, 제목과 같은 칼럼 안에서 제목과 같은 시작선에 맞춘다.
 */
const Row = ({ title, titleClassName, sub, expand, right, last, faded, checked, draw, onRowClick }) => (
  <div
    role={onRowClick ? 'button' : undefined}
    tabIndex={onRowClick ? 0 : undefined}
    onClick={onRowClick}
    className={`flex gap-[10px] py-[12px] text-left ${last ? '' : 'border-b border-[#F0F0F0] dark:border-[rgba(255,255,255,.08)]'}`}
  >
    <CheckCircle checked={checked} draw={draw} />
    <div className="flex-1 min-w-0 flex flex-col gap-[4px]">
      <div className={`transition-opacity duration-300 ${faded ? 'opacity-45' : ''}`}>
        <b className={`text-[15px] font-[800] ${titleClassName || 'text-layout-black dark:text-layout-white'}`}>
          {title}
        </b>
      </div>
      {sub && <div className={`${TITLE_TEXT_INDENT} transition-opacity duration-300 ${faded ? 'opacity-45' : ''}`}>{sub}</div>}
      {expand && <div className={TITLE_TEXT_INDENT}>{expand}</div>}
    </div>
    {right}
  </div>
);

/* ── 달성 연출(이슈 #25 13차) ─────────────────────────────────────────────
   마지막으로 본 상태(완료한 줄 · 오늘 불꽃 켜짐)를 계정별 localStorage 에 기억했다가, 홈에 왔을 때
   새로 완료된 줄만 체크가 그려지고(cue 'match'), 오늘 처음 연속이 이어졌으면 오늘 칩이 점화되며
   (cue 'evolve') 연속 일수가 하나 올라간다(cue 'xpUp').
   - 처음 진입(기억 없음)·모션 줄이기 → 지금 상태를 기억만 하고 연출하지 않는다(새로고침도 같은 기억을 읽어 조용하다)
   - 날짜가 바뀐 기억은 '오늘 아무것도 안 본' 상태로 읽는다
   - 새로 완료된 줄은 렌더 중에 바로 계산해 첫 프레임부터 '아직 안 함' 모양으로 붙잡아 둔다(퀘스트 카드 12차와 같은 방식)
   - 시작 시점은 입문 퀘스트 카드와 같은 대기 조건(homeCelebrationGate) + 카드가 화면에 보일 때.
     퀘스트 카드에 연출할 단계가 남아 있으면 그 연출이 끝난 뒤에 시작한다(퀘스트 먼저)
   - 기억은 연출을 시작할 때 갱신한다 — 그 전에 화면을 떠나면 다음에 다시 연출한다 */
const SEEN_KEY_PREFIX = 'heyvoca_today_seen_';
const CHECK_STEP_MS = 420;

const readSeen = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && Array.isArray(v.done) ? v : null;
  } catch (e) {
    return null;
  }
};

const writeSeen = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* noop */ }
};

/**
 * 홈 '오늘 할 일' + '연속 학습' 통합 카드(이슈 #25 13차).
 *   머리말   「오늘 할 일」 · 오른쪽에 「(불꽃 칩) N일 연속 >」(누르면 농장 방문 기록)
 *   본문     할 일 줄(썩은 단어 · 시듦 · 돌봄 · 새 씨앗)
 *   아래     1주 줄(요일 칩 + 연속 캡슐) — 멈춤 알림 · 다시 잇기 도전은 그 자리를 대신한다
 * 예전 연속 학습 카드의 큰 불꽃 · '오늘 했나' 표시는 1주 줄의 오늘 칩 하나로 합쳤다(중복 제거).
 * registerStreakRefresh — 홈 당겨서 새로고침 때 /farm/streak 도 같이 다시 받게 재조회 함수를 넘긴다.
 */
// React Compiler("use memo")는 쓰지 않는다 — 퀘스트 대기 판정을 렌더 중 ref 에 적어 두는 자리가 있어서다.
const TodayTasksCard = ({ registerStreakRefresh } = {}) => {

  const { todayTasks } = useStats();
  const { userProfile } = useUser();
  const { missions, questCardVisible, pendingMissionRewards } = useOnboardingUnlock();
  const {
    streak, weekCells, onOpenRecord, onOpenPaused, onStartEarnBack, startingEarnBack,
  } = useStreakCard({ registerRefresh: registerStreakRefresh });
  const reduceMotion = useReducedMotion();

  const rootRef = useRef(null);
  const seenOnce = useInView(rootRef, { once: true, amount: 0.2 });
  const inView = useInView(rootRef, { amount: 0.35 });
  const play = seenOnce || typeof IntersectionObserver === 'undefined';

  const [expanded, setExpanded] = useState({ rotten: false, wilted: false, care: false });
  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  // ── 행 서술 — 0인 행은 숨긴다 ──────────────────────────────────────
  const rowDefs = [];
  if (todayTasks) {
    const rotten = todayTasks.rotten ?? { count: 0, done: 0, words: [] };
    const rottenDone = rotten.done ?? 0;
    const wilted = todayTasks.wilted ?? { total: 0, done: 0, words: [] };
    const care = todayTasks.care ?? { total: 0, done: 0, words: [] };
    const newSeed = todayTasks.new_seed ?? { target: 0, done: 0 };

    // 다 살렸으면(남은 부패 0, 오늘 살린 것 ≥1) 다른 행처럼 체크 + 진행 x/y 로 남는다
    if (rotten.count > 0 || rottenDone > 0) {
      const done = rotten.count <= 0;
      const { compact, expandedBlock } = buildWordListParts(rotten.words, expanded.rotten, () => toggle('rotten'));
      rowDefs.push({
        key: 'rotten',
        title: '썩은 단어 살리기',
        sub: compact,
        expand: expandedBlock,
        checked: done,
        right: done
          ? <Progress done={rottenDone} total={rottenDone + rotten.count} />
          : <b className="shrink-0 text-[17px] font-[800] text-layout-black dark:text-layout-white">{rotten.count}</b>,
      });
    }
    if (wilted.total > 0) {
      const { compact, expandedBlock } = buildWordListParts(wilted.words, expanded.wilted, () => toggle('wilted'));
      rowDefs.push({
        key: 'wilted',
        title: '시듦 물주기',
        sub: compact,
        expand: expandedBlock,
        checked: wilted.done >= wilted.total,
        right: <Progress done={wilted.done} total={wilted.total} />,
      });
    }
    if (care.total > 0) {
      const { compact, expandedBlock } = buildWordListParts(care.words, expanded.care, () => toggle('care'));
      rowDefs.push({
        key: 'care',
        title: '오늘 돌봄 물주기',
        sub: compact,
        expand: expandedBlock,
        checked: care.done >= care.total,
        right: <Progress done={care.done} total={care.total} />,
      });
    }
    if (newSeed.target > 0) {
      rowDefs.push({
        key: 'new_seed',
        title: '농장에 새 씨앗 심기',
        checked: newSeed.done >= newSeed.target,
        right: <Progress done={newSeed.done} total={newSeed.target} />,
      });
    }
  }

  // ── 달성 연출 상태 ─────────────────────────────────────────────────
  const userId = userProfile?.id;
  const storageKey = userId ? `${SEEN_KEY_PREFIX}${userId}` : null;
  const todayCell = weekCells.find((c) => c.isToday) ?? null;
  const todayDate = todayCell?.date ?? null;
  const todayLit = todayCell ? (todayCell.status === 'all' || todayCell.status === 'part') : false;
  // today-tasks 가 오늘 날짜 기준 응답일 때만 판정한다(자정 직후 어제 응답으로 연출하지 않게)
  const ready = !!todayTasks && !!todayDate && !!storageKey;
  const doneSig = rowDefs.filter((r) => r.checked).map((r) => r.key).join(',');
  const doneKeys = doneSig ? doneSig.split(',') : [];

  const [ack, setAck] = useState(null); // { storageKey, value } — 이번 화면에서 확인한 기억
  const [playing, setPlaying] = useState(null); // { rows, lit, from, to, snapshot }
  const [revealed, setRevealed] = useState(0); // 연출 중 체크가 그려진 줄 수
  const [ignited, setIgnited] = useState(false);
  const [counted, setCounted] = useState(false);
  const [bump, setBump] = useState(0);

  const storedSeen = useMemo(() => (storageKey ? readSeen(storageKey) : null), [storageKey]);
  const seenRaw = ack && ack.storageKey === storageKey ? ack.value : storedSeen;
  const seen = seenRaw && ready
    ? (seenRaw.d === todayDate ? seenRaw : { d: todayDate, done: [], lit: false })
    : null;
  const newlyRows = (ready && seen && !reduceMotion) ? doneKeys.filter((k) => !seen.done.includes(k)) : [];
  const newlyLit = !!(ready && seen && !reduceMotion && todayLit && !seen.lit);
  const pendingSig = newlyRows.length || newlyLit ? `${newlyRows.join(',')}|${newlyLit ? 1 : 0}` : '';

  const toCount = todayTasks?.streak?.current ?? streak?.current ?? 0;
  const baseCount = streak?.current ?? toCount;

  // 처음 진입(기억 없음) · 모션 줄이기 · 새로 할 연출 없음 — 지금 상태를 기억만 한다
  useEffect(() => {
    if (!ready || playing || pendingSig) return;
    const value = { d: todayDate, done: doneKeys, lit: todayLit };
    if (seenRaw && seenRaw.d === value.d && seenRaw.lit === value.lit
      && seenRaw.done.join(',') === doneSig) return;
    writeSeen(storageKey, value);
    setAck({ storageKey, value });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing, pendingSig, todayDate, doneSig, todayLit, storageKey]);

  // 퀘스트 카드가 연출할 단계 — 렌더 때 보이면 기억해 둔다(그 카드가 먼저 시작해 기억을 지워도 기다리게)
  const questRef = useRef({ n: 0, at: 0 });
  const questN = questPendingCount(userId, missions, questCardVisible);
  if (questN > 0) questRef.current = { n: questN, at: Date.now() };
  const questArgsRef = useRef({ missions, questCardVisible });
  questArgsRef.current = { missions, questCardVisible };

  const screenClear = useHomeScreenClear({ rewardsPending: (pendingMissionRewards?.length ?? 0) > 0 });

  // 홈만 보이고 카드가 화면에 있으면 연출 시작
  useEffect(() => {
    if (playing || !pendingSig || !screenClear || !inView || !storageKey) return undefined;
    let t = 0;
    const tryStart = () => {
      const { missions: ms, questCardVisible: qv } = questArgsRef.current;
      const n = questPendingCount(userId, ms, qv);
      if (n > 0) {
        questRef.current = { n, at: Date.now() };
        t = setTimeout(tryStart, START_RETRY_MS);
        return;
      }
      const q = questRef.current;
      const questUntil = q.n > 0 ? q.at + START_SETTLE_MS + questCelebrationMs(q.n) : 0;
      if (Date.now() < questUntil || isHomeScreenBusy()) {
        t = setTimeout(tryStart, START_RETRY_MS);
        return;
      }
      questRef.current = { n: 0, at: 0 };
      const [rowsPart, litPart] = pendingSig.split('|');
      const snapshot = { d: todayDate, done: doneKeys, lit: todayLit };
      writeSeen(storageKey, snapshot);
      setRevealed(0);
      setIgnited(false);
      setCounted(false);
      setPlaying({
        rows: rowsPart ? rowsPart.split(',') : [],
        lit: litPart === '1',
        from: Math.max(0, toCount - 1),
        to: toCount,
        snapshot,
      });
    };
    t = setTimeout(tryStart, START_SETTLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, pendingSig, screenClear, inView, storageKey]);

  // 연출 타임라인 — 체크(줄마다) → 오늘 칩 점화 → 연속 일수 카운트업
  useEffect(() => {
    if (!playing) return undefined;
    const timers = [];
    let t = 250;
    playing.rows.forEach((_, i) => {
      timers.push(setTimeout(() => { setRevealed(i + 1); feel('match'); }, t));
      t += CHECK_STEP_MS;
    });
    if (playing.lit) {
      t += 120;
      timers.push(setTimeout(() => { setIgnited(true); feel('evolve'); }, t));
      t += 560;
      timers.push(setTimeout(() => { setCounted(true); setBump((b) => b + 1); feel('xpUp'); }, t));
      t += 900;
    }
    timers.push(setTimeout(() => {
      if (storageKey) setAck({ storageKey, value: playing.snapshot });
      setPlaying(null);
      setRevealed(0);
      setIgnited(false);
      setCounted(false);
    }, t + 150));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // ── 보이는 모양 — 연출 대상은 자기 차례 전까지 '아직 안 함' ─────────────
  const holdRows = playing ? playing.rows : newlyRows;
  const rowVisual = (row) => {
    const hi = holdRows.indexOf(row.key);
    if (hi === -1) return { checked: row.checked, draw: false };
    const shown = !!playing && revealed > hi;
    return { checked: row.checked && shown, draw: shown };
  };
  const holdLit = playing ? playing.lit && !ignited : newlyLit;
  const shownCells = holdLit && todayDate
    ? weekCells.map((c) => (c.date === todayDate ? { ...c, status: 'today_empty' } : c))
    : weekCells;
  const igniteDate = playing?.lit && ignited ? todayDate : null;

  let countTarget = baseCount;
  if (playing?.lit) countTarget = counted ? playing.to : playing.from;
  else if (newlyLit) countTarget = Math.max(0, toCount - 1);
  const shownCount = useCountUp(countTarget, { duration: 0.7 });
  const pillLit = holdLit ? false : todayLit;

  if (!todayTasks && !streak) return null;

  return (
    <motion.section
      ref={rootRef}
      aria-label="오늘 할 일과 연속 학습"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0.15 } : SPRING.soft}
      className="rounded-[12px] pt-[16px] px-[18px] pb-[16px] bg-[rgba(255,255,255,.72)] dark:bg-[rgba(36,36,36,.66)] backdrop-blur-[12px] backdrop-saturate-[1.4] border border-white/80 dark:border-white/[.08] shadow-[inset_0_1px_0_rgba(255,255,255,.7),0_4px_14px_rgba(96,80,52,.08)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_4px_14px_rgba(0,0,0,.28)]"
    >
      <div className="flex items-center justify-between gap-[8px]">
        <b className="text-[17px] font-[800] text-layout-black dark:text-layout-white">오늘 할 일</b>
        {(streak || todayTasks?.streak) && (
          <StreakHeaderPill
            shown={shownCount}
            lit={pillLit}
            paused={!!streak?.paused}
            onOpenRecord={onOpenRecord}
            bump={bump}
          />
        )}
      </div>

      {todayTasks && (
        rowDefs.length > 0 ? (
          <div className="flex flex-col mt-[2px]">
            <AnimatePresence initial={false}>
              {rowDefs.map((row, idx) => {
                const v = rowVisual(row);
                return (
                  <motion.div
                    key={row.key}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <Row
                      {...row}
                      checked={v.checked}
                      draw={v.draw}
                      faded={v.checked}
                      last={idx === rowDefs.length - 1}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <p className="mt-[8px] text-[13px] font-[600] text-layout-gray-400 dark:text-layout-gray-300">
            오늘은 돌볼 일이 없어요
          </p>
        )
      )}

      {/* 연속 학습 — 할 일 아래 얇은 구분선 뒤에 1주 줄 */}
      <div className="mt-[6px] pt-[14px] border-t border-[#F0F0F0] dark:border-[rgba(255,255,255,.08)]">
        <StreakCardBody
          streak={streak}
          weekCells={shownCells}
          play={play}
          igniteDate={igniteDate}
          onOpenPaused={onOpenPaused}
          onStartEarnBack={onStartEarnBack}
          startingEarnBack={startingEarnBack}
        />
      </div>
    </motion.section>
  );
};

export default TodayTasksCard;
