import React from 'react';
import { Drop } from '@phosphor-icons/react';

/*
  연속 학습 — 보호권으로 이어진 날 표시. 학습 결과 슬라이드(StudyResult.jsx `StreakWeek`)와
  홈 카드(StreakCard.jsx 막대)가 같은 색을 쓰도록 여기 한 곳에만 정의한다.

  백엔드 계약(day_status, streak_v2.py)의 상태값 3종 + 화면이 따로 다루는 'future'.
    studied   — 오늘 학습해서 자격을 채운 날. 기존 브랜드 색(진한 핑크) 그대로.
    protected — 보호권이 자동으로 채워 이어 준 날. studied와 같은 높이/크기, 색만
                "연속 학습 보호권" 아이템 색(secondary-mint)으로 채운다. 아이콘·범례 없음
                — 색 하나로만 구분한다(QA 피드백: 아이콘+범례는 과했다).
    missed    — 학습도 보호도 없는 빈 날.
    future    — 아직 오지 않은 날(session-summary.week 전용, calendar 는 future 를 안 준다).
*/

// 보호일 채운 색 — "연속 학습 보호권"(SHIELD) 아이템은 상점/인벤토리에 전용 색 토큰이 없고,
// 아이콘 원본(item-streak-shield.png)의 주조색도 테두리가 핑크·불꽃이 주황이라 studied의
// primary-main 계열과 거의 같은 톤이라 색만으로는 구분이 안 된다. 그래서 기존 팔레트 중
// 농장 화면에서 아직 의미가 배정되지 않은 secondary-mint(테알)를 골랐다 — health-fresh는
// status-success, health-thirsty는 secondary-blue, wilted/critical은 secondary-yellow를
// 이미 쓰고 있어 mint만 비어 있었다(index.css). studied(primary-main-600, 진한 핑크)와
// 라이트·다크 모두에서 색상 자체가 달라 명도 대비 없이도 구분된다.
export const STREAK_PROTECTED_BG_CLASS = 'bg-secondary-mint-500';

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
      {!isStudied && !isProtected && isToday && <Drop size={size} weight="fill" className="text-primary-main-600" />}
    </div>
  );
};

export default StreakDayMark;
