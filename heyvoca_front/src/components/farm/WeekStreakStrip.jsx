import React from 'react';
import StreakMark, { StreakLegend, STREAK_BAND_CLASS, STREAK_LIT } from '../streak/StreakMark';
import { getKstToday } from '../../utils/kstDate';

/*
  1주 불꽃 달력 — 최근 6일 + 오늘, 오래된→오늘 7칸.

  status: 'all'(오늘 할 일 모두) | 'part'(일부) | 'shield'(보호권) | 'none'(빈 날) |
          'today_empty'(오늘, 아직 미달성). 정의는 `GET /farm/today-tasks`(week 필드)가
          정본이다(개수·말풍선 없음).

  【2026-10-08 QA #11】 상태를 칸 배경색으로 나누지 않는다. 연속이 이어진 날(all·part·shield)은
  같은 색·같은 높이의 띠 한 줄로 잇고, 상태는 띠 위 표식(찬 불꽃·작은 불씨·보호권 그림)으로만
  구분한다 — 띠·표식 정의는 streak/StreakMark.jsx 가 정본이다. 띠는 끊긴 날에서만 끊긴다.

  홈(home/StreakCard.jsx)과 학습 결과 연속 학습 슬라이드(takeTest/StudyResult.jsx)가
  같은 그림을 그리도록 칸 렌더링(WeekStreakCell)과 원본→cell 변환(buildWeekCells)을
  여기 한 곳에서만 정의한다.

  【2026-09-28 실기기 피드백 4차】 예전에 StudyResult 는 studied/protected/missed/future
  4상태(session-summary.streak.week)로 분홍 물방울을 그렸는데, 홈은 이미 all/part/shield/
  none/today_empty 5상태(today-tasks.week)로 바뀌어 있어 같은 "연속 학습"인데 두 화면이
  다른 그림을 보여줬다. 이제 두 화면 모두 today-tasks.week 하나만 받는다.
*/
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** today-tasks.week(원본, {date, status} 배열) → 화면이 그리는 cell 배열. */
export const buildWeekCells = (week, now = new Date()) => {
  // 서버 week.date 는 KST 날짜다 — 기기 시간대가 아니라 KST 기준 오늘과 비교한다(utils/kstDate.js)
  const today = getKstToday(now);
  return (week || []).map((d) => {
    const isToday = d.date === today;
    const date = new Date(`${d.date}T00:00:00`);
    return {
      date: d.date,
      isToday,
      status: d.status,
      label: isToday ? '오늘' : (Number.isNaN(date.getTime()) ? '' : DOW[date.getDay()]),
    };
  });
};

// 'YYYY-MM-DD' 에 n일을 더한다 — 시간대 영향이 없도록 UTC 자정 기준으로만 계산한다
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};
const dowOf = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};
const RECORD_STATUS = new Set(['all', 'part', 'shield']);

/**
 * 홈 연속 학습 카드 전용 7칸 — 이슈 #25.
 *
 * buildWeekCells 는 "최근 6일 + 오늘"이라 오늘이 늘 오른쪽 끝이다. 가입 첫날엔 왼쪽 6칸이
 * 전부 빈 날(none)로 깔려 "이전 날을 다 안 한" 것처럼 보였다. 그래서 홈 카드는 시작 칸을
 * 기록 기준으로 옮긴다.
 *   start = 최근 6일(오늘 제외) 중 기록(all·part·shield)이 있는 가장 이른 날, 없으면 오늘
 *   칸   = start ~ start+6. 오늘 이후 칸은 status 'upcoming'(다가올 날 — 표식 없는 흐린 점선 칸)
 * 6일 전에 기록이 있으면 결과는 buildWeekCells 와 같다(오늘이 오른쪽 끝).
 * 학습 결과 슬라이드(StudyResult)는 계속 buildWeekCells 를 쓴다(홈 카드에만 적용).
 */
export const buildHomeWeekCells = (week, now = new Date()) => {
  const base = buildWeekCells(week, now);
  const todayIdx = base.findIndex((c) => c.isToday);
  // 서버 응답 모양이 예상(오늘이 끝인 7칸)과 다르면 손대지 않는다
  if (base.length !== 7 || todayIdx !== 6) return base;

  const firstRecord = base.findIndex((c, i) => i < todayIdx && RECORD_STATUS.has(c.status));
  const start = firstRecord === -1 ? todayIdx : firstRecord;
  if (start === 0) return base;

  const past = base.slice(start);
  const today = base[todayIdx].date;
  const upcoming = Array.from({ length: 7 - past.length }, (_, k) => {
    const date = addDays(today, k + 1);
    return { date, isToday: false, status: 'upcoming', label: dowOf(date) };
  });
  return [...past, ...upcoming];
};

/** 칸 하나 — 이어진 날은 띠 한 토막 + 표식, 나머지는 띠 없는 둥근 빈칸. */
export const WeekStreakCell = ({ status, isToday = false, linkPrev = false, linkNext = false }) => {
  const lit = STREAK_LIT.has(status);
  let boxClass = '';
  if (status === 'today_empty') boxClass = 'bg-layout-white dark:bg-layout-black border-[1.5px] border-dashed border-layout-gray-200 dark:border-layout-gray-500';
  else if (!lit) boxClass = 'bg-layout-gray-50 dark:bg-layout-gray-dark'; // 'none' — 공부 안 한 과거 날의 빈칸

  return (
    <div className="relative h-[46px]">
      {/* 이어진 쪽은 칸 사이 틈까지 덮어 옆 토막과 맞붙고, 끝나는 쪽만 둥글다 */}
      {lit && (
        <span
          aria-hidden
          className={`
            absolute bottom-[5px] left-0 top-[5px]
            ${STREAK_BAND_CLASS}
            ${linkPrev ? '' : 'rounded-l-full'}
            ${linkNext ? '-right-[7px]' : 'right-0 rounded-r-full'}
          `}
        />
      )}
      <div className={`absolute inset-x-0 bottom-[5px] top-[5px] flex items-center justify-center rounded-full ${boxClass}`}>
        {lit && <StreakMark status={status} size={26} />}
      </div>
      {isToday && lit && (
        <span aria-hidden className="pointer-events-none absolute -inset-x-[3px] bottom-[2px] top-[2px] rounded-full border-[2px] border-secondary-yellow-500" />
      )}
    </div>
  );
};

/**
 * 7칸 그리드 + 요일 라벨('오늘'은 강조) (+ 선택적 범례).
 * `cells`는 buildWeekCells가 만든 배열을 그대로 받는다.
 */
const WeekStreakStrip = ({ cells, showLegend = false, className = '' }) => (
  <div className={className}>
    <div className="grid grid-cols-7 gap-[6px]">
      {cells.map((d, i) => (
        <div key={d.date} className="flex flex-col gap-[6px]">
          <span className={`text-[11px] text-center ${d.isToday ? 'font-[800] text-layout-black dark:text-layout-white' : 'font-[600] text-layout-gray-300'}`}>
            {d.label}
          </span>
          <WeekStreakCell
            status={d.status}
            isToday={d.isToday}
            linkPrev={STREAK_LIT.has(d.status) && STREAK_LIT.has(cells[i - 1]?.status)}
            linkNext={STREAK_LIT.has(d.status) && STREAK_LIT.has(cells[i + 1]?.status)}
          />
        </div>
      ))}
    </div>

    {showLegend && (
      <StreakLegend
        showShield={cells.some((d) => d.status === 'shield')}
        className="mt-[10px] text-[11px] font-[600] text-layout-gray-300"
      />
    )}
  </div>
);

export default WeekStreakStrip;
