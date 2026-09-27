import React from 'react';
import { CROP_ASSETS } from './CropImage';
import { toLocalDateString } from '../../utils/common';

/*
  1주 불꽃 달력 — 최근 6일 + 오늘, 오래된→오늘 7칸.

  status: 'all'(오늘 할 일 모두) | 'part'(일부) | 'shield'(보호권) | 'none'(빈 날) |
          'today_empty'(오늘, 아직 미달성). 정의는 `GET /farm/today-tasks`(week 필드)가
          정본이다 — "그날 다 했는가"만 색으로 말한다(개수·말풍선 없음).

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
  const today = toLocalDateString(now);
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

/** 칸 하나 — status 값 하나만으로 그림·색을 정한다(개수·말풍선 없음). */
export const WeekStreakCell = ({ status }) => {
  if (status === 'shield') {
    return (
      <div className="flex items-center justify-center h-[46px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
        <img src={CROP_ASSETS.shield} alt="보호권" draggable={false} className="w-[22px] h-[22px] object-contain select-none opacity-80" />
      </div>
    );
  }
  if (status === 'all') {
    return (
      <div className="flex items-center justify-center h-[46px] rounded-[12px] bg-streak-all">
        <img src={CROP_ASSETS.streak} alt="" draggable={false} className="w-[20px] h-[20px] object-contain select-none" />
      </div>
    );
  }
  if (status === 'part') {
    return (
      <div className="flex items-center justify-center h-[46px] rounded-[12px] bg-streak-part">
        <img src={CROP_ASSETS.streak} alt="" draggable={false} className="w-[20px] h-[20px] object-contain select-none" />
      </div>
    );
  }
  if (status === 'today_empty') {
    return <div className="h-[46px] rounded-[12px] bg-layout-white dark:bg-layout-black border-[1.5px] border-dashed border-layout-gray-200 dark:border-layout-gray-500" />;
  }
  // 'none' — 공부 안 한 과거 날의 빈칸
  return <div className="h-[46px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark" />;
};

/**
 * 7칸 그리드 + 요일 라벨('오늘'은 강조) (+ 선택적 범례).
 * `cells`는 buildWeekCells가 만든 배열을 그대로 받는다.
 */
const WeekStreakStrip = ({ cells, showLegend = false, className = '' }) => (
  <div className={className}>
    <div className="grid grid-cols-7 gap-[6px]">
      {cells.map((d) => (
        <div key={d.date} className="flex flex-col gap-[6px]">
          <span className={`text-[11px] text-center ${d.isToday ? 'font-[800] text-layout-black dark:text-layout-white' : 'font-[600] text-layout-gray-300'}`}>
            {d.label}
          </span>
          <WeekStreakCell status={d.status} />
        </div>
      ))}
    </div>

    {showLegend && (
      <div className="flex items-center gap-[12px] mt-[10px] text-[11px] font-[600] text-layout-gray-300">
        <span className="flex items-center gap-[4px]">
          <i className="w-[12px] h-[12px] rounded-[4px] bg-streak-all" />
          오늘 할 일 모두
        </span>
        <span className="flex items-center gap-[4px]">
          <i className="w-[12px] h-[12px] rounded-[4px] bg-streak-part" />
          일부
        </span>
      </div>
    )}
  </div>
);

export default WeekStreakStrip;
