// src/components/home/StreakCard.jsx
//
// 홈 — 연속 학습일 카드.
// 최근 35일을 한 눈에 보여주고(이어간 날 / 보호권으로 지킨 날 / 쉰 날), 오늘 남은 목표를 알려준다.
//
// 기획 11.5 — 기록이 끊겨도 **큰 빨간 0 을 쓰지 않는다.** 최고 기록은 늘 옆에 남고,
// 끊긴 날은 "지금까지 만든 습관"을 먼저 말한 뒤 오늘부터 다시 잇자고 제안한다.
// 보호권이 없을 때 구매를 권하지 않는다(기획 13.4 결제 압박 금지).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Drop, ShieldCheck } from '@phosphor-icons/react';
import { getStreakApi, recoverStreakApi } from '../../api/farm';
import { CROP_ASSETS } from '../farm/CropImage';
import { useVocabulary } from '../../context/VocabularyContext';
import { toLocalDateString } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

const StreakCard = () => {
  "use memo";

  const { lastSessionResult } = useVocabulary();
  const [streak, setStreak] = useState(null);
  const [recovering, setRecovering] = useState(false);

  const loadStreak = useCallback(async () => {
    const res = await getStreakApi();
    if (res?.code === 200) setStreak(res.data);
  }, []);

  // 최초 1회 + 학습 세션 완료 시 조용히 갱신(스피너 없이 기존 값 유지)
  useEffect(() => {
    loadStreak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSessionResult?.completedAt]);

  // 최근 35일 — 날짜 오름차순으로 세워 5주 격자에 그대로 흘린다
  const days = useMemo(
    () => (streak?.calendar ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
    [streak]
  );

  // 35일 창이 월 경계와 무관하므로 요일 머리글은 첫 칸의 실제 요일에서 시작한다
  const dowOffset = useMemo(() => {
    if (!days.length) return 0;
    const d = new Date(`${days[0].date}T00:00:00`);
    return Number.isNaN(d.getTime()) ? 0 : d.getDay();
  }, [days]);

  const handleRecover = async () => {
    if (recovering) return;
    vibrate({ duration: 5 });
    setRecovering(true);
    try {
      const res = await recoverStreakApi();
      if (res?.code === 200) await loadStreak();
    } finally {
      setRecovering(false);
    }
  };

  // 조회 전이거나 실패했으면 홈에 빈 카드를 남기지 않는다
  if (!streak) return null;

  const current = streak.current ?? 0;
  const best = streak.best ?? 0;
  const required = streak.required ?? 0;
  const todayCorrect = streak.today_correct ?? 0;
  const todayDone = !!streak.today_done;
  const remain = Math.max(0, required - todayCorrect);
  const milestone = streak.next_milestone;
  const canRecover = !!streak.recoverable && (streak.shield_cnt ?? 0) > 0;
  const today = toLocalDateString(new Date());

  return (
    <div className="
      flex flex-col gap-[12px]
      px-[15px] py-[12px]
      rounded-[12px]
      bg-primary-main-50 dark:bg-primary-main-dark
    ">
      <div className="flex items-center gap-[8px]">
        <img
          src={CROP_ASSETS.streak}
          alt=""
          draggable={false}
          className="w-[26px] h-[26px] object-contain select-none"
        />
        {current > 0 ? (
          <span className="text-layout-black dark:text-layout-white text-[20px] font-[800] leading-[1.1]">
            {current}
            <span className="text-[13px] font-[700] ml-[2px]">일 연속</span>
          </span>
        ) : (
          <span className="text-layout-black dark:text-layout-white text-[16px] font-[700]">
            오늘부터 다시 이어가요
          </span>
        )}
        {best > 0 && (
          <span className="ml-auto text-primary-main-600 text-[11.5px] font-[700]">최고 {best}일</span>
        )}
      </div>

      {/* 끊긴 뒤에는 지금까지 만든 습관을 먼저 말한다 */}
      {current === 0 && (
        <p className="text-layout-gray-400 dark:text-layout-gray-200 text-[12px] font-[600] leading-[1.5]">
          {best > 0
            ? `${best}일 동안 만든 습관은 사라지지 않아요. 오늘부터 다시 이어가요.`
            : '오늘 물을 주면 첫 기록이 시작돼요.'}
        </p>
      )}

      {/* 최근 35일 — 5주 격자 */}
      <div>
        <div className="grid grid-cols-7 gap-[4px] mb-[5px]">
          {Array.from({ length: 7 }, (v, i) => (
            <span
              key={i}
              className="text-center text-layout-gray-200 dark:text-layout-gray-300 text-[10px] font-[700]"
            >
              {DOW[(dowOffset + i) % 7]}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-[4px]">
          {days.map((d) => {
            const isToday = d.date === today;
            const ring = isToday
              ? 'ring-[1.5px] ring-inset ring-layout-black dark:ring-layout-white'
              : '';
            if (d.protected) {
              return (
                <span
                  key={d.date}
                  className={`h-[24px] rounded-[7px] flex items-center justify-center bg-secondary-yellow-100 dark:bg-secondary-yellow-dark ${ring}`}
                >
                  <ShieldCheck size={12} weight="fill" className="text-secondary-yellow-600" />
                </span>
              );
            }
            if (d.qualified) {
              return (
                <span
                  key={d.date}
                  className={`h-[24px] rounded-[7px] flex items-center justify-center bg-primary-main-600 ${ring}`}
                >
                  <Drop size={12} weight="fill" className="text-layout-white" />
                </span>
              );
            }
            return (
              <span
                key={d.date}
                className={`h-[24px] rounded-[7px] bg-layout-gray-50 dark:bg-layout-gray-dark ${ring}`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-[12px] gap-y-[5px] mt-[10px]">
          <span className="flex items-center gap-[5px] text-layout-gray-300 text-[10.5px] font-[600]">
            <i className="block w-[12px] h-[12px] rounded-[4px] bg-primary-main-600" />
            이어간 날
          </span>
          <span className="flex items-center gap-[5px] text-layout-gray-300 text-[10.5px] font-[600]">
            <i className="block w-[12px] h-[12px] rounded-[4px] bg-secondary-yellow-100 dark:bg-secondary-yellow-dark" />
            보호권으로 지킴
          </span>
          <span className="flex items-center gap-[5px] text-layout-gray-300 text-[10.5px] font-[600]">
            <i className="block w-[12px] h-[12px] rounded-[4px] bg-layout-gray-50 dark:bg-layout-gray-dark" />
            쉰 날
          </span>
        </div>
      </div>

      {/* 오늘 남은 목표 */}
      <div className="flex items-center gap-[8px] px-[12px] py-[9px] rounded-[10px] bg-layout-white dark:bg-layout-gray-dark">
        <span className="flex-1 min-w-0 text-layout-black dark:text-layout-white text-[12.5px] font-[700]">
          {todayDone
            ? '오늘 기록을 이어갔어요'
            : (required > 0
              ? `오늘 ${todayCorrect}/${required}개 · ${remain}개만 더 맞히면 오늘도 이어져요`
              : '오늘 학습하면 기록이 이어져요')}
        </span>
        {milestone?.days > 0 && (
          <span className="shrink-0 text-primary-main-600 text-[11px] font-[700]">
            {milestone.days}일까지 {Math.max(0, milestone.days - current)}일
          </span>
        )}
      </div>

      {/* 복구 창이 열려 있고 보호권이 있을 때만 노출. 없을 때 구매를 권하지 않는다 */}
      {canRecover && (
        <button
          type="button"
          onClick={handleRecover}
          disabled={recovering}
          className="
            flex items-center justify-center gap-[6px]
            h-[40px] w-full
            rounded-[10px]
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[13px] font-[700]
            disabled:opacity-60
          "
        >
          <ShieldCheck size={16} weight="fill" />
          보호권으로 기록 잇기
        </button>
      )}
    </div>
  );
};

export default StreakCard;
