// src/components/streak/StreakRecordView.jsx
//
// 농장 방문 화면의 본문 — 풀시트 껍데기(머리말 · 닫기 · 조회)는 home/FarmVisitCalendarSheet.jsx 가 맡고,
// 여기는 받은 /farm/streak 응답을 그리기만 한다(연속 계산 · 보호권 · 보상 로직은 건드리지 않는다).
//
//   ① 연속 요약   큰 불꽃(누르면 통 튄다) + 굴러 올라가는 연속 일수 + 최고 기록 대비 진행 막대 + 작은 수치 3칸
//   ② 월 달력     StreakMonthCalendar — 연속 띠 · 달 넘김 전환 · 날짜 선택
//   ③ 선택한 날   날짜를 누르면 설명이 부드럽게 바뀐다(맞힌 개수가 있으면 막대로도 보여준다)
//   ④ 범례
//
// 기획 11.5 — 끊겼을 때의 연출은 이 화면에 없다. 큰 빨간 0 도, 복구 유도도 두지 않는다.
// 연속 보상 목록(3일/7일/14일 …)은 2026-10-07 QA 로 이 화면에서 뺐다 — 지급은 서버가 그대로 한다.
import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MoonStars } from '@phosphor-icons/react';
import { haptic, SPRING, useCountUp } from '../../lib/feel';
import { CROP_ASSETS } from '../farm/CropImage';
import StreakFlame from './StreakFlame';
import StreakMonthCalendar, { cellState, ymd } from './StreakMonthCalendar';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const EASE = [0.3, 0.7, 0.3, 1];

const shiftYM = (y, m, offset) => {
  let nm = m + offset;
  let ny = y;
  while (nm < 1) { nm += 12; ny -= 1; }
  while (nm > 12) { nm -= 12; ny += 1; }
  return { year: ny, month: nm };
};

/** 선택 날짜 라벨 — "9월 13일 (일)" */
const formatDateLabel = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${m}월 ${d}일 (${DOW[new Date(y, m - 1, d).getDay()]})`;
};

/**
 * 선택한 날짜의 설명 — QA §C. 순서가 곧 규칙이다.
 *   ① 오늘인데 아직 자격(required)을 못 채웠다 → 진행 중이라는 사실을 먼저 말한다 (progress)
 *   ② 자격을 채웠다(qualified) → 이어진 날 (lit)
 *   ③ 학습은 없었지만 보호권으로 지켰다(protected) (shield)
 *   ④ 과거인데 correct_cnt>0 이고 미달 → "했지만 모자랐다" (short)
 *   ⑤ 그 외 → 쉰 날 (rest)
 * correct_cnt 는 구서버가 안 줄 수 있다 — 그때는 개수 문구 · 막대를 빼고 자격 여부만 남긴다
 * (오늘 칸은 홈 카드와 같은 today_correct 로 대신할 수 있어 예외로 둔다).
 */
const summaryFor = (date, info, streak, today) => {
  const required = streak?.required ?? 5;
  const isToday = date === today;
  const hasCorrectCnt = typeof info?.correct_cnt === 'number';
  const correctCnt = isToday
    ? (streak?.today_correct ?? (hasCorrectCnt ? info.correct_cnt : 0))
    : (hasCorrectCnt ? info.correct_cnt : 0);
  const ratio = Math.min(1, correctCnt / Math.max(1, required));

  if (isToday && !info?.qualified) {
    const remain = Math.max(0, required - correctCnt);
    return {
      kind: 'progress',
      count: correctCnt,
      required,
      sub: remain > 0 ? `${remain}개만 더 맞히면 오늘도 이어져요` : null,
    };
  }
  if (info?.qualified) {
    const state = cellState(info);
    if (isToday || hasCorrectCnt) {
      return { kind: 'lit', state, count: correctCnt, required, sub: null };
    }
    // 구서버 폴백 — 개수를 모르니 자격 문구만 남긴다
    return { kind: 'lit', state, count: null, title: '연속으로 이어진 날', sub: null };
  }
  if (info?.protected) {
    return { kind: 'shield', title: '보호권으로 지킨 날', sub: '학습은 없었지만 연속은 끊기지 않았어요', count: null };
  }
  if (!isToday && hasCorrectCnt && correctCnt > 0) {
    return { kind: 'short', count: correctCnt, required, sub: null };
  }
  return { kind: 'rest', count: null, title: '쉰 날', sub: null };
};

const TILE_CLASS = {
  progress: 'bg-primary-main-100 dark:bg-primary-main-dark',
  lit: 'bg-streak-all',
  shield: 'bg-secondary-mint-100 dark:bg-secondary-mint-dark',
  short: 'bg-layout-gray-50 dark:bg-layout-black',
  rest: 'bg-layout-gray-50 dark:bg-layout-black',
};
const BAR_CLASS = {
  progress: 'bg-primary-main-600',
  lit: 'bg-[linear-gradient(90deg,var(--secondary-yellow-400),var(--secondary-yellow-600))]',
  short: 'bg-layout-gray-200 dark:bg-layout-gray-400',
};

const CHIP_LABEL = { progress: '진행 중', lit: '이어짐', shield: '보호권', short: '못 채움', rest: '쉼' };
const CHIP_CLASS = {
  progress: 'bg-primary-main-100 text-primary-main-600 dark:bg-primary-main-dark dark:text-primary-main-400',
  lit: 'bg-streak-all text-layout-black',
  shield: 'bg-secondary-mint-100 text-secondary-mint-600 dark:bg-secondary-mint-dark dark:text-secondary-mint-400',
  short: 'bg-layout-gray-100 text-layout-gray-400 dark:bg-white/[0.12] dark:text-layout-gray-300',
  rest: 'bg-layout-gray-100 text-layout-gray-400 dark:bg-white/[0.12] dark:text-layout-gray-300',
};

const DayDetail = ({ date, summary, reducedMotion }) => (
  <div className="relative overflow-hidden rounded-[14px] bg-layout-gray-50 dark:bg-layout-gray-dark">
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={date}
        className="flex items-center gap-[12px] px-[12px] py-[12px]"
        initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        <span className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[13px] ${summary.kind === 'lit' && summary.state === 'part' ? 'bg-streak-part' : TILE_CLASS[summary.kind]} ${summary.kind === 'rest' || summary.kind === 'short' ? 'dark:bg-layout-black' : ''}`}>
          {summary.kind === 'lit' && <StreakFlame days={summary.state === 'all' ? 7 : 1} lit size={30} />}
          {(summary.kind === 'progress' || summary.kind === 'short') && <StreakFlame lit={false} size={28} />}
          {summary.kind === 'shield' && (
            <img src={CROP_ASSETS.shield} alt="" draggable={false} className="h-[28px] w-[28px] select-none object-contain" />
          )}
          {summary.kind === 'rest' && <MoonStars size={22} weight="fill" className="text-layout-gray-200 dark:text-layout-gray-400" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-[8px]">
            <span className="text-[11.5px] font-[700] tracking-[-0.02em] text-layout-gray-300">
              {formatDateLabel(date)}
            </span>
            <span className={`shrink-0 rounded-full px-[8px] py-[2px] text-[10.5px] font-[800] tracking-[-0.02em] ${CHIP_CLASS[summary.kind]}`}>
              {CHIP_LABEL[summary.kind]}
            </span>
          </span>
          {summary.count !== null ? (
            <span className="mt-[3px] flex items-baseline gap-[3px] text-layout-black dark:text-layout-white">
              <span className="text-[22px] font-[800] leading-none tracking-[-0.04em] tabular-nums">{summary.count}</span>
              <span className="text-[12.5px] font-[700] tracking-[-0.03em]">개 맞혔어요</span>
              <span className="ml-[4px] text-[11.5px] font-[600] tracking-[-0.02em] text-layout-gray-300">목표 {summary.required}개</span>
            </span>
          ) : (
            <span className="mt-[3px] block text-[14px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
              {summary.title}
            </span>
          )}
          {summary.count !== null && (
            <span className="mt-[8px] flex gap-[4px]">
              {Array.from({ length: summary.required }).map((_, i) => (
                <span key={i} className="h-[7px] flex-1 overflow-hidden rounded-full bg-layout-gray-100 dark:bg-white/[0.12]">
                  {i < summary.count && (
                    <motion.span
                      className={`block h-full w-full origin-left rounded-full ${BAR_CLASS[summary.kind] ?? BAR_CLASS.short}`}
                      initial={{ scaleX: reducedMotion ? 1 : 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.22, delay: 0.06 + i * 0.07, ease: EASE }}
                    />
                  )}
                </span>
              ))}
            </span>
          )}
          {summary.sub && (
            <span className="mt-[6px] block text-[11.5px] font-[500] leading-[1.4] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
              {summary.sub}
            </span>
          )}
        </span>
      </motion.div>
    </AnimatePresence>
  </div>
);

const LEGEND = [
  { t: '오늘 할 일 모두', c: 'bg-streak-all' },
  { t: '일부', c: 'bg-streak-part ring-1 ring-inset ring-secondary-yellow-300 dark:ring-0' },
  { t: '보호권', c: 'border border-dashed border-secondary-mint-500 bg-secondary-mint-100 dark:bg-secondary-mint-dark' },
];

const StreakRecordView = ({ streak, today }) => {
  "use memo";

  const reducedMotion = useReducedMotion();
  const flameRef = useRef(null);

  const [view, setView] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { year: y, month: m };
  });
  // QA §C — 기본 선택은 오늘. 달을 넘겨도 선택은 그대로 두고 설명 칸만 따라간다.
  const [selectedDate, setSelectedDate] = useState(today);

  // 날짜 → {qualified, protected, …}. 서버가 35일을 빈 날까지 채워 보내므로 그대로 색인만 한다
  const byDate = useMemo(() => {
    const map = {};
    (streak?.calendar ?? []).forEach((d) => { map[d.date] = d; });
    return map;
  }, [streak]);

  const windowStart = useMemo(() => {
    const dates = Object.keys(byDate);
    if (!dates.length) return null;
    return dates.reduce((a, b) => (a < b ? a : b));
  }, [byDate]);

  const thisMonthPrefix = today.slice(0, 7);
  const isThisMonth = `${view.year}-${String(view.month).padStart(2, '0')}` === thisMonthPrefix;
  const prevYM = shiftYM(view.year, view.month, -1);
  // 이전 달로 갈 수 있는 범위는 서버가 준 35일 창까지다(월 단위 조회 API 가 없다)
  const prevLastDate = ymd(prevYM.year, prevYM.month, new Date(prevYM.year, prevYM.month, 0).getDate());
  const canPrev = Boolean(windowStart) && prevLastDate >= windowStart;

  const go = (offset) => {
    if (offset < 0 && !canPrev) return;
    if (offset > 0 && isThisMonth) return;
    haptic('light');
    setView((v) => shiftYM(v.year, v.month, offset));
  };

  // QA §C — 미래 날짜는 탭을 막는다. 쉰 날을 포함해 오늘까지는 전부 고를 수 있다.
  const selectDate = (date) => {
    if (date > today) return;
    setSelectedDate(date);
  };

  // 선택일이 35일 창 밖이면 byDate[selectedDate] 는 undefined 이고 summaryFor 가 "쉰 날"로 그린다
  const selectedSummary = useMemo(
    () => summaryFor(selectedDate, byDate[selectedDate], streak, today),
    [selectedDate, byDate, streak, today],
  );

  const current = streak?.current ?? 0;
  const best = streak?.best ?? 0;
  const required = streak?.required ?? 5;
  const todayCorrect = streak?.today_correct ?? 0;
  const todayDone = streak?.today_done ?? Boolean(byDate[today]?.qualified);
  const paused = !!streak?.paused;
  const isRecord = current > 0 && current >= best;
  const bestRatio = best > 0 ? Math.min(1, current / best) : 0;
  // 이번 달 불꽃을 켠 날 — 35일 창이 이번 달 전체를 덮으므로 응답만으로 셀 수 있다
  const monthLit = useMemo(
    () => (streak?.calendar ?? []).filter((d) => d.date.startsWith(thisMonthPrefix) && d.qualified).length,
    [streak, thisMonthPrefix],
  );

  const shown = useCountUp(current, { duration: 0.8, from: reducedMotion ? undefined : 0 });

  const rise = (i) => ({
    initial: reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: reducedMotion ? { duration: 0.15 } : { ...SPRING.soft, delay: i * 0.07 },
  });

  return (
    <>
      {/* ① 연속 요약 */}
      <motion.div
        {...rise(0)}
        className="rounded-[16px] border border-farm-line bg-[linear-gradient(165deg,var(--secondary-yellow-100)_0%,var(--layout-white)_62%)] p-[14px] dark:border-transparent dark:bg-none dark:bg-layout-gray-dark"
      >
        <div className="flex items-center gap-[14px]">
          <button
            type="button"
            aria-label="연속 학습 불꽃"
            onClick={() => { haptic('light'); flameRef.current?.play(); }}
            className="shrink-0"
          >
            <StreakFlame ref={flameRef} days={paused ? 0 : current} size={68} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-[4px] text-layout-black dark:text-layout-white">
              <span className="text-[40px] font-[800] leading-none tracking-[-0.05em] tabular-nums">{shown}</span>
              <span className="text-[15px] font-[700] tracking-[-0.03em]">일 연속</span>
              {paused && (
                <span className="ml-[4px] shrink-0 self-center rounded-full bg-primary-main-100 px-[8px] py-[3px] text-[10.5px] font-[800] text-primary-main-600 dark:bg-primary-main-dark dark:text-primary-main-400">
                  멈춤
                </span>
              )}
            </div>
            {/* "앱을 연 게 아니라 5개를 맞힌 날이 기록이다"(기획 11.1) */}
            <p className="mt-[7px] text-[11.5px] font-[600] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
              하루에 <b className="font-[800] text-layout-black dark:text-layout-white">{required}개</b>만 맞히면 그날은 이어져요
            </p>
          </div>
          {best > 0 && (
            <span className="shrink-0 self-start text-[12px] font-[700] tracking-[-0.02em] tabular-nums text-layout-gray-300">
              최고 {best}일
            </span>
          )}
        </div>
      </motion.div>

      {/* ② 월 달력 */}
      <motion.div {...rise(1)}>
        <StreakMonthCalendar
          view={view}
          byDate={byDate}
          today={today}
          selectedDate={selectedDate}
          canPrev={canPrev}
          canNext={!isThisMonth}
          onGo={go}
          onSelect={selectDate}
        />
      </motion.div>

      {/* ③ 선택한 날 · ④ 범례 */}
      <motion.div {...rise(2)}>
        <DayDetail date={selectedDate} summary={selectedSummary} reducedMotion={reducedMotion} />
        {/* 쉰 날은 색이 없는 상태 자체가 규칙이라 범례에 다시 적지 않는다 */}
        <div className="mt-[12px] flex flex-wrap gap-[12px] px-[2px]">
          {LEGEND.map((l) => (
            <span key={l.t} className="flex items-center gap-[5px] text-[10.5px] font-[600] tracking-[-0.02em] text-layout-gray-300">
              <i className={`block h-[14px] w-[14px] rounded-[5px] ${l.c}`} />
              {l.t}
            </span>
          ))}
        </div>
      </motion.div>
    </>
  );
};

export default StreakRecordView;
