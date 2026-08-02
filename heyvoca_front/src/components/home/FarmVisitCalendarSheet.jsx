// src/components/home/FarmVisitCalendarSheet.jsx
//
// 홈 — 농장 방문 달력 (시안 home-calendar §1 · §2 · §3).
//
// §3 — 마이페이지가 아니라 **홈 소속**이다. 진입로는 홈의 연속 학습 카드 하나뿐이라
// 파일도 home/ 아래에 둔다. 하단 탭을 덮는 풀시트다(§3 "풀시트라 하단 탭이 없다").
//
// §1 화면 순서: 연속 요약(.strk) → 월 달력(.calh/.dow/.cal/.legend) → 연속 보상(.rows).
// §2 셀은 네 가지 + 오늘 테두리. X 나 빨강을 쓰지 않는다(기획 14.5).
// §2 — 지금 출석 달력이 쓰던 "항상 6주 고정"을 버리고 **실제 주 수만큼만** 그린다.
//
// 기획 11.5 — 끊겼을 때의 연출은 이 화면에 없다. 큰 빨간 0 도, 복구(보호권 구매) 유도도
// 두지 않는다. 끊긴 사실은 `current` 가 작아진 것으로만 드러난다.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CaretLeft, CaretRight, Drop, ShieldCheck, Check, Fire, Crown } from '@phosphor-icons/react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { getStreakApi } from '../../api/farm';
import { CROP_ASSETS } from '../farm/CropImage';
import { toLocalDateString } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 연속 보상 표(기획 11.4).
 * 백엔드 `constants.STREAK_MILESTONES` 를 그대로 옮긴 값이다 — GET /farm/streak 는
 * `next_milestone`(다음 한 단계)만 주는데 시안은 받은 것 + 앞으로 두 단계를 함께 보여준다.
 * 다음 단계의 문구는 응답값이 있으면 그것을 우선 쓴다(둘이 어긋나면 서버가 정본).
 */
const MILESTONES = [
  { days: 3, kind: 'GEM', amount: 1 },
  { days: 7, kind: 'GEM', amount: 3 },
  { days: 14, kind: 'SHOVEL', amount: 5 },
  { days: 30, kind: 'NUTRIENT', amount: 10 },
  { days: 50, kind: 'GEM', amount: 10 },
  { days: 100, kind: 'SHIELD', amount: 1 },
  { days: 365, kind: 'GEM', amount: 50 },
];

const ITEM_LABEL = {
  SHOVEL: '새심기 삽',
  NUTRIENT: '영양 회복제',
  SHIELD: '보호권',
};

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const shiftYM = (y, m, offset) => {
  let nm = m + offset;
  let ny = y;
  while (nm < 1) { nm += 12; ny -= 1; }
  while (nm > 12) { nm -= 12; ny += 1; }
  return { year: ny, month: nm };
};

/**
 * §2 — 셀 상태. 순서가 곧 규칙이다.
 *   goal 목표까지 달성 · on 물만 준 날(5개 이상) · prot 보호권으로 지킴 · miss 쉰 날
 * 보호권은 학습하지 않은 날에만 서게 되므로(11.3) 자격을 먼저 본다.
 */
const cellState = (info) => {
  if (!info) return 'miss';
  // goal_met 은 아직 응답에 없다(보고 참조) — 없으면 자격 충족한 날은 전부 "물만 준 날"
  if (info.qualified) return (info.goal_met ?? info.goal ?? false) ? 'goal' : 'on';
  if (info.protected) return 'prot';
  return 'miss';
};

const CELL_CLASS = {
  goal: 'bg-primary-main-600 text-layout-white',
  on: 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600',
  prot: 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark text-secondary-yellow-600',
  miss: 'text-layout-gray-100 dark:text-[#3A3A3A]',
};

/** 셀 안의 표식 — 물방울 / 방패. 쉰 날은 아무것도 두지 않는다(§2) */
const CellMark = ({ state }) => {
  if (state === 'goal') {
    return (
      <span className="w-[15px] h-[15px] flex items-center justify-center">
        <Drop size={11} weight="fill" className="text-layout-white" />
      </span>
    );
  }
  if (state === 'on') {
    return (
      <span className="w-[15px] h-[15px] flex items-center justify-center">
        <Drop size={11} weight="fill" className="text-primary-main-600" />
      </span>
    );
  }
  if (state === 'prot') {
    return (
      <span className="w-[15px] h-[15px] flex items-center justify-center">
        <ShieldCheck size={11} weight="fill" className="text-secondary-yellow-600" />
      </span>
    );
  }
  return null;
};

const FarmVisitCalendarSheet = () => {
  "use memo";

  const { popNewFullSheet } = useNewFullSheetActions();

  const [streak, setStreak] = useState(null);
  const today = useMemo(() => toLocalDateString(new Date()), []);
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const load = useCallback(async () => {
    const res = await getStreakApi();
    if (res?.code === 200) setStreak(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 날짜 → {qualified, protected}. 서버가 35일을 빈 날까지 채워 보내므로 그대로 색인만 한다
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

  // §2 — 실제 주 수만큼만. 앞쪽 빈 칸은 그대로 두고 뒤쪽은 아예 만들지 않는다
  const weeks = useMemo(() => {
    const { year, month } = view;
    const firstDow = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const rows = Math.ceil((firstDow + daysInMonth) / 7);

    const cells = [];
    for (let i = 0; i < rows * 7; i += 1) {
      const day = i - firstDow + 1;
      if (day < 1 || day > daysInMonth) { cells.push(null); continue; }
      const date = ymd(year, month, day);
      cells.push({ day, date, state: cellState(byDate[date]), isToday: date === today });
    }
    return cells;
  }, [view, byDate, today]);

  const now = new Date();
  const isThisMonth = view.year === now.getFullYear() && view.month === now.getMonth() + 1;
  const prevYM = shiftYM(view.year, view.month, -1);
  // 이전 달로 갈 수 있는 범위는 서버가 준 35일 창까지다(월 단위 조회 API 가 없다 — 보고 참조)
  const prevLastDate = ymd(prevYM.year, prevYM.month, new Date(prevYM.year, prevYM.month, 0).getDate());
  const canPrev = Boolean(windowStart) && prevLastDate >= windowStart;

  const go = (offset) => {
    if (offset < 0 && !canPrev) return;
    if (offset > 0 && isThisMonth) return;
    vibrate({ duration: 5 });
    setView((v) => shiftYM(v.year, v.month, offset));
  };

  // §1 하단 — 연속 보상. 받은 것 하나 + 앞으로 둘(시안 3행)
  const rewardRows = useMemo(() => {
    if (!streak) return [];
    const current = streak?.current ?? 0;
    const nextDays = streak?.next_milestone?.days ?? null;
    // 응답의 다음 단계를 표에서 찾는다. 표에 없는 값이 오면(서버가 단계를 바꾼 경우)
    // 현재 연속일 다음 칸으로 물러선다 — 세 줄이 통째로 어긋나지 않게.
    let nextIdx = nextDays === null ? -1 : MILESTONES.findIndex((m) => m.days === nextDays);
    if (nextIdx < 0 && nextDays !== null) nextIdx = MILESTONES.findIndex((m) => m.days > current);
    if (nextIdx < 0) nextIdx = MILESTONES.length; // 전부 받았다

    const start = Math.max(0, Math.min(nextIdx - 1, MILESTONES.length - 3));
    return MILESTONES.slice(start, start + 3).map((m, i) => {
      const awarded = start + i < nextIdx;
      const isNext = start + i === nextIdx;
      const left = m.days - current;
      return {
        ...m,
        awarded,
        isNext,
        // 받은 날짜는 응답에 없다(보고 참조) — 시안의 "받았어요 · 7월 4일" 중 날짜를 뺀다
        desc: awarded ? '받았어요' : (left > 0 ? `${left}일 남음` : '곧 받아요'),
        // 보석은 아이콘 + 숫자, 도구는 이름 + 개수(시안 §1 보상 3행)
        label: m.kind === 'GEM' ? null : `${ITEM_LABEL[m.kind]} ${m.amount}`,
      };
    });
  }, [streak]);

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-border dark:border-border-dark bg-layout-white dark:bg-layout-black"
      >
        <motion.button
          type="button"
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileTap={{ scale: 0.95 }}
          aria-label="닫기"
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white whitespace-nowrap">
          농장 방문
        </h1>
        <div />
      </div>

      {/* 조회 전에는 아무것도 그리지 않는다 — 빈 달력을 먼저 보이면 "쉰 날"로 읽힌다 */}
      <div className="flex-1 overflow-y-auto px-[16px] pt-[14px] pb-[24px] flex flex-col gap-[14px]">
        {streak && (<>
        {/* ① 연속 요약 — 기록 화면의 머리말. 홈 카드와 달리 최고 기록까지 한 줄에 둔다(§3) */}
        <div className="rounded-[14px] p-[14px] bg-primary-main-50 dark:bg-primary-main-dark">
          <div className="flex items-center gap-[8px]">
            <img
              src={CROP_ASSETS.streak}
              alt=""
              draggable={false}
              className="w-[26px] h-[26px] object-contain select-none flex-shrink-0"
            />
            <span className="text-[22px] font-[800] tracking-[-0.04em] text-layout-black dark:text-layout-white">
              {streak?.current ?? 0}
              <em className="not-italic text-[13px] font-[700] ml-[1px]">일 연속</em>
            </span>
            <span className="ml-auto text-[11.5px] font-[700] text-primary-main-600">
              최고 {streak?.best ?? 0}일
            </span>
          </div>
          {/* §1 — "앱을 연 게 아니라 5개를 맞힌 날이 기록이다"(기획 11.1) */}
          <p className="mt-[9px] text-[11px] font-[600] tracking-[-0.02em] text-[#B87DA5] dark:text-primary-main-400">
            하루에 <b className="font-[800]">{streak?.required ?? 5}개</b>만 맞히면 그날은 이어져요
          </p>
        </div>

        {/* ② 월 달력 */}
        <div>
          <div className="flex items-center justify-center gap-[14px] pt-[2px] pb-[10px]">
            <motion.button
              type="button"
              onClick={() => go(-1)}
              disabled={!canPrev}
              whileTap={canPrev ? { scale: 0.9 } : {}}
              aria-label="이전 달"
              className={`flex items-center ${canPrev ? 'text-layout-gray-200' : 'text-layout-gray-100'}`}
            >
              <CaretLeft size={15} weight="fill" />
            </motion.button>
            <span className="text-[15px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
              {view.year}년 {view.month}월
            </span>
            <motion.button
              type="button"
              onClick={() => go(1)}
              disabled={isThisMonth}
              whileTap={!isThisMonth ? { scale: 0.9 } : {}}
              aria-label="다음 달"
              className={`flex items-center ${!isThisMonth ? 'text-layout-gray-200' : 'text-layout-gray-100'}`}
            >
              <CaretRight size={15} weight="fill" />
            </motion.button>
          </div>

          <div className="grid grid-cols-7 gap-[4px] mb-[6px]">
            {DOW.map((d) => (
              <span key={d} className="text-center text-[10.5px] font-[700] text-[#BBBBBB]">{d}</span>
            ))}
          </div>

          <motion.div
            key={`${view.year}-${view.month}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16 }}
            className="grid grid-cols-7 gap-[4px]"
          >
            {weeks.map((cell, i) => {
              if (!cell) return <span key={`e${i}`} className="aspect-square" />;
              return (
                <span
                  key={cell.date}
                  className={`
                    aspect-square rounded-[10px] flex flex-col items-center justify-center gap-[1px]
                    text-[11px] font-[700]
                    ${CELL_CLASS[cell.state]}
                    ${cell.isToday ? 'shadow-[inset_0_0_0_1.5px_#111111] dark:shadow-[inset_0_0_0_1.5px_#FFFFFF]' : ''}
                  `}
                >
                  {cell.day}
                  <CellMark state={cell.state} />
                </span>
              );
            })}
          </motion.div>

          {/* §2 범례 — 네 가지 상태. 쉰 날에도 X 나 빨강을 쓰지 않는다 */}
          <div className="flex flex-wrap gap-[12px] mt-[12px]">
            {[
              { t: '목표까지 달성', c: 'bg-primary-main-600' },
              { t: '물만 준 날', c: 'bg-primary-main-100 dark:bg-primary-main-dark' },
              { t: '보호권으로 지킴', c: 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark' },
              { t: '쉰 날', c: 'bg-[#F0F0F0] dark:bg-[#2A2A2A]' },
            ].map((l) => (
              <span
                key={l.t}
                className="flex items-center gap-[5px] text-[10.5px] font-[600] tracking-[-0.02em] text-layout-gray-300"
              >
                <i className={`block w-[14px] h-[14px] rounded-[5px] ${l.c}`} />
                {l.t}
              </span>
            ))}
          </div>
        </div>

        {/* ③ 연속 보상 (기획 11.4) */}
        <div>
          <div className="flex items-baseline gap-[8px] mb-[7px]">
            <h4 className="text-[15px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
              연속 보상
            </h4>
          </div>
          <div className="rounded-[12px] overflow-hidden border border-[#EEEEEE] dark:border-transparent dark:bg-layout-gray-dark">
            {rewardRows.map((r, i) => (
              <div
                key={r.days}
                className={`flex items-center gap-[10px] px-[12px] py-[10px] ${i > 0 ? 'border-t border-[#F4F4F4] dark:border-white/[0.07]' : ''}`}
              >
                <span
                  className={`
                    w-[28px] h-[28px] rounded-[8px] flex-shrink-0 flex items-center justify-center
                    ${r.awarded
                      ? 'bg-status-success-100 dark:bg-status-success-dark'
                      : r.isNext
                        ? 'bg-primary-main-100 dark:bg-primary-main-dark'
                        : 'bg-layout-gray-50 dark:bg-[#333333]'}
                  `}
                >
                  {r.awarded && <Check size={13} weight="bold" className="text-status-success-600" />}
                  {!r.awarded && r.isNext && <Fire size={14} weight="fill" className="text-primary-main-600" />}
                  {!r.awarded && !r.isNext && <Crown size={14} weight="fill" className="text-[#BBBBBB]" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
                    {r.days}일
                  </div>
                  <div className="text-[10.5px] font-[500] tracking-[-0.02em] text-layout-gray-300 mt-[1px]">
                    {r.desc}
                  </div>
                </div>
                <span
                  className={`
                    flex-shrink-0 flex items-center gap-[3px] text-[12.5px]
                    ${r.isNext
                      ? 'font-[800] text-layout-black dark:text-layout-white'
                      : 'font-[700] text-layout-gray-200'}
                  `}
                >
                  {r.label ?? (
                    <>
                      <img
                        src={CROP_ASSETS.gem}
                        alt="보석"
                        draggable={false}
                        className="w-[14px] h-[14px] object-contain select-none"
                      />
                      {r.amount}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
};

export default FarmVisitCalendarSheet;
