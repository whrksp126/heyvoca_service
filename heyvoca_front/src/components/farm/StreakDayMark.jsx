import React from 'react';
import { Drop, ShieldCheck } from '@phosphor-icons/react';

/*
  연속 학습 — 보호권으로 이어진 날 표시. 학습 결과 슬라이드(StudyResult.jsx `StreakWeek`)와
  홈 카드(StreakCard.jsx 막대)가 같은 색·아이콘을 쓰도록 여기 한 곳에만 정의한다.

  백엔드 계약(day_status, streak_v2.py)의 상태값 3종 + 화면이 따로 다루는 'future'.
    studied   — 오늘 학습해서 자격을 채운 날. 기존 브랜드 색(진한 핑크) 그대로.
    protected — 보호권이 자동으로 채워 이어 준 날. studied보다 옅은 브랜드 톤 + 실드 아이콘.
    missed    — 학습도 보호도 없는 빈 날.
    future    — 아직 오지 않은 날(session-summary.week 전용, calendar 는 future 를 안 준다).
*/

// 채운 칸 색 — studied 는 기존 진한 브랜드 색(primary-main-600), protected 는 그보다 옅은 톤.
// primary-main-200/300 은 다크 모드 전용 토큰이 없어(index.css) 같은 값이 다크에서도 쓰이는데,
// studied 의 primary-main-600 도 마찬가지로 다크 오버라이드 없이 그대로 쓰는 기존 규칙과 같다.
export const STREAK_PROTECTED_BG_CLASS = 'bg-primary-main-200 dark:bg-primary-main-dark';
export const STREAK_PROTECTED_ICON_CLASS = 'text-primary-main-600 dark:text-primary-main-400';
export const STREAK_PROTECTED_LABEL = '보호권으로 이어진 날이에요';

/**
 * 보호일 범례 한 줄 — 보호일이 1개 이상일 때만 호출부에서 조건부로 그린다.
 * 글자색은 `textClassName` 으로 화면마다 다른 톤(muted 회색 · 카드 톤)을 넘긴다 —
 * 기본값과 호출부 className에 같은 text-* 유틸이 동시에 있으면 Tailwind가 어느 쪽을
 * 최종 적용할지 보장하지 않아, 색만은 항상 하나의 자리(textClassName)로 넘기게 했다.
 */
export const StreakProtectedLegend = ({ className = '', textClassName = 'text-layout-gray-300' }) => (
  <div className={`flex items-center justify-center gap-[4px] text-[11px] font-[600] ${textClassName} ${className}`}>
    <ShieldCheck size={12} weight="fill" className={STREAK_PROTECTED_ICON_CLASS} />
    {STREAK_PROTECTED_LABEL}
  </div>
);

/**
 * 연속 학습 주간 스트립의 칸 하나 (학습 결과 슬라이드 전용, 정사각형).
 * `status` 는 백엔드 계약값을 그대로 받는다('studied'|'protected'|'missed'|'future').
 * `isToday` 는 채워졌든 아니든 테두리로 항상 강조한다(기존 'today' 상태의 시각 규칙 유지).
 */
export const StreakDayMark = ({ status, isToday = false, size = 15, className = '' }) => {
  const isStudied = status === 'studied';
  const isProtected = status === 'protected';

  let bgClass = 'bg-layout-gray-50 dark:bg-layout-gray-dark'; // missed / future
  if (isStudied) bgClass = 'bg-primary-main-600';
  else if (isProtected) bgClass = STREAK_PROTECTED_BG_CLASS;
  else if (isToday) bgClass = 'bg-primary-main-100 dark:bg-primary-main-dark'; // 오늘, 아직 안 채움

  return (
    <div
      className={`
        flex items-center justify-center w-full aspect-square rounded-[10px]
        ${bgClass}
        ${isToday ? 'border-[2px] border-primary-main-600' : ''}
        ${className}
      `}
    >
      {isStudied && <Drop size={size} weight="fill" className="text-layout-white" />}
      {isProtected && <ShieldCheck size={size} weight="fill" className={STREAK_PROTECTED_ICON_CLASS} />}
      {!isStudied && !isProtected && isToday && <Drop size={size} weight="fill" className="text-primary-main-600" />}
    </div>
  );
};

export default StreakDayMark;
