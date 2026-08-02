// src/components/home/StreakCard.jsx
//
// 홈 — 연속 학습 카드 (시안 §6 · §10 "연속 학습 112px").
//
// §6 — 지표 두 개를 나란히 놓던 행을 해체했다. 보석은 히어로 우측 상단 칩으로 올리고
// (성격이 "얼마 있나"뿐인 재화라 본문 세로 흐름을 차지할 이유가 없다),
// 연속 학습만 본문 최상단 카드 · 3층으로 남겼다.
//   1층 헤더 — 불꽃 26px + "12일 연속"(15px/700) + 우측 "최장 24일"(11px/700) + CaretRight
//   2층 일별 학습량 막대 7칸 — 높이 38px · radius 4. 높이 = 그날 맞힌 개수. 맨 오른쪽이 오늘
//   3층 요일 라벨 10px/700
//
// §6 — 점 7개에서 막대 7개로 바꿨다. 점은 "했다 / 안 했다"밖에 말하지 못하는데,
// "5개 하고 끝낸 날"과 "40개 몰아친 날"은 전혀 다른 기억이고 그 리듬이 보여야
// 오늘 어느 정도 할지를 스스로 정한다.
// 오늘 칸만 트랙을 깔아 둔다 — 나머지 6칸은 결과지만 오늘 칸은 아직 채우는 중이다.
// 트랙이 보여주는 것은 연속 인정 기준(5개) 대비 진행이다(기획 11.1).
//
// §6 — 홈은 "얼마나 해 왔나"만 말한다. "14일 배지까지 2일 남음" 같은 남은 거리 문구는
// 두지 않는다. 홈에서 눌러야 할 것은 CTA 하나인데 또 하나의 목표가 생기면 시선이 나뉜다.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { getStreakApi } from '../../api/farm';
import { CROP_ASSETS } from '../farm/CropImage';
import { useVocabulary } from '../../context/VocabularyContext';
import { toLocalDateString } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import FarmVisitCalendarSheet from './FarmVisitCalendarSheet';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const StreakCard = () => {
  "use memo";

  const { lastSessionResult } = useVocabulary();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const [streak, setStreak] = useState(null);

  const loadStreak = useCallback(async () => {
    const res = await getStreakApi();
    if (res?.code === 200) setStreak(res.data);
  }, []);

  // 최초 1회 + 학습 세션 완료 시 조용히 갱신(스피너 없이 기존 값 유지)
  useEffect(() => {
    loadStreak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSessionResult?.completedAt]);

  const today = toLocalDateString(new Date());
  const required = Math.max(1, streak?.required ?? 5);
  const todayCorrect = streak?.today_correct ?? 0;

  /**
   * 최근 7일 — 날짜 오름차순, 맨 오른쪽이 오늘.
   *
   * 막대 높이는 "그날 맞힌 개수"인데 GET /farm/streak 의 calendar 는 date/qualified/protected
   * 세 필드만 준다(백엔드에 CheckIn.correct_word_cnt 는 있으나 응답에 실리지 않는다 — 보고 참조).
   * 개수 필드가 실려 오면 그대로 쓰고, 없으면 자격을 채운 날을 기준선(required)으로 근사한다.
   */
  const days = useMemo(() => {
    const calendar = (streak?.calendar ?? [])
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(-7);
    return calendar.map((d) => {
      const isToday = d.date === today;
      const counted = d.qualified || d.protected;
      const value = isToday
        ? todayCorrect
        : (d.correct_cnt ?? d.correct_word_cnt ?? (counted ? required : 0));
      const date = new Date(`${d.date}T00:00:00`);
      return {
        date: d.date,
        isToday,
        value,
        label: isToday ? '오늘' : (Number.isNaN(date.getTime()) ? '' : DOW[date.getDay()]),
      };
    });
  }, [streak, today, todayCorrect, required]);

  // §16 ⑤ — 막대 상한은 최근 7일 최댓값이다(시안이 가정한 방식).
  const peak = useMemo(
    () => Math.max(required, ...days.map((d) => d.value || 0)),
    [days, required]
  );

  // §6 "최장 기록 … 누르면 기록 화면" — 농장 방문 달력은 하단 탭을 덮는 풀시트다
  // (home-calendar §3 "풀시트라 하단 탭이 없다"). 진입로는 홈의 이 버튼 하나뿐이다.
  const handleBest = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(FarmVisitCalendarSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true,
    });
  };

  // 조회 전이거나 실패했으면 홈에 빈 카드를 남기지 않는다
  if (!streak) return null;

  const current = streak.current ?? 0;
  const best = streak.best ?? 0;

  return (
    <div className="
      rounded-[12px] p-[14px]
      bg-primary-main-50 dark:bg-primary-main-dark
      border border-primary-main-200 dark:border-transparent
    ">
      {/* 1층 — 불꽃 · 연속 일수 · 최장 기록 */}
      <div className="flex items-center gap-[10px]">
        <img
          src={CROP_ASSETS.streak}
          alt=""
          draggable={false}
          className="w-[26px] h-[26px] object-contain select-none flex-shrink-0"
        />
        <span className="flex-1 text-layout-black dark:text-layout-white text-[15px] font-[700] tracking-[-0.03em]">
          {current}일 연속
        </span>
        <button
          type="button"
          onClick={handleBest}
          className="flex items-center gap-[3px] text-[11px] font-[700] text-[#B8709F] dark:text-primary-main-400"
        >
          최장 {best}일
          <CaretRight size={10} weight="fill" className="text-[#D9A8C8] dark:text-primary-main-400" />
        </button>
      </div>

      {/* 2층 — 일별 학습량 막대 7칸. 맨 오른쪽이 오늘 */}
      <div className="flex items-end gap-[6px] h-[38px] mt-[12px] mb-[5px]">
        {days.map((d) => {
          if (d.isToday) {
            // 오늘 — 옅은 트랙 위에 목표(5개) 대비 채움. 아직 채우는 중이라는 뜻이다
            const pct = Math.min(100, Math.round((d.value / required) * 100));
            return (
              <div
                key={d.date}
                className="flex-1 h-full flex items-end rounded-[4px] bg-[#FFE3F5] dark:bg-[rgba(255,255,255,.14)]"
              >
                <i
                  style={{ height: `${Math.max(pct, d.value > 0 ? 10 : 0)}%` }}
                  className="block w-full rounded-[4px] bg-primary-main-600"
                />
              </div>
            );
          }
          const pct = peak > 0 ? Math.round((d.value / peak) * 100) : 0;
          return (
            <div key={d.date} className="flex-1 h-full flex items-end">
              {/* 학습한 날 #FF88DC · 최소 높이 4px — 1개만 해도 흔적이 남는다.
                  빠뜨린 날은 회색이 아니라 연한 핑크다 — 실패로 읽히지 않게 */}
              <i
                style={{ height: `${pct}%`, minHeight: 4 }}
                className={`block w-full rounded-[4px] ${
                  d.value > 0
                    ? 'bg-primary-main-500'
                    : 'bg-[#F3DEEC] dark:bg-[rgba(255,255,255,.14)]'
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* 3층 — 요일 라벨. 오늘만 브랜드 핑크 */}
      <div className="flex gap-[6px] text-[10px] font-[700] tracking-[-0.02em] text-[#B8709F] dark:text-primary-main-400">
        {days.map((d) => (
          <span
            key={d.date}
            className={`flex-1 text-center ${d.isToday ? 'text-primary-main-600 dark:text-primary-main-500' : ''}`}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
};

export default StreakCard;
