// src/components/home/FarmVisitCalendarSheet.jsx
//
// 홈 — 농장 방문 달력 (시안 home-calendar §1 · §2 · §3).
//
// §3 — 마이페이지가 아니라 **홈 소속**이다. 진입로는 홈의 연속 학습 카드 하나뿐이라
// 파일도 home/ 아래에 둔다. 하단 탭을 덮는 풀시트다(§3 "풀시트라 하단 탭이 없다").
//
// 본문(연속 요약 → 월 달력 → 선택한 날 설명 → 범례)은 streak/StreakRecordView.jsx 가 그린다
// (2026-10-07 연속 학습 화면 고도화). 이 파일은 풀시트 껍데기 — 머리말 · 닫기 · /farm/streak 조회 — 만 맡는다.
// 맨 아래 있던 '연속 보상' 목록은 같은 날 QA 로 뺐다(지급은 서버가 그대로 한다).
//
// 기획 11.5 — 끊겼을 때의 연출은 이 화면에 없다. 큰 빨간 0 도, 복구(보호권 구매) 유도도
// 두지 않는다. 끊긴 사실은 `current` 가 작아진 것으로만 드러난다.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CaretLeft } from '@phosphor-icons/react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { getStreakApi } from '../../api/farm';
import { toLocalDateString } from '../../utils/common';
import { vibrate } from '../../utils/osFunction';
import StreakRecordView from '../streak/StreakRecordView';

const FarmVisitCalendarSheet = () => {
  "use memo";

  const { popNewFullSheet } = useNewFullSheetActions();

  const [streak, setStreak] = useState(null);
  const today = useMemo(() => toLocalDateString(new Date()), []);
  const load = useCallback(async () => {
    const res = await getStreakApi();
    if (res?.code === 200) setStreak(res.data);
  }, []);

  useEffect(() => { load(); }, [load]);

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
        {streak && <StreakRecordView streak={streak} today={today} />}
      </div>
    </div>
  );
};

export default FarmVisitCalendarSheet;
