import React, { useCallback } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useStats } from '../../context/StatsContext';
import { vibrate } from '../../utils/osFunction';
import PullToRefresh from '../common/PullToRefresh';
import ReviewScheduleContent from '../myPage/ReviewScheduleContent';

// 통계(복습 일정/분포) 풀시트 — 본문은 마이페이지와 공유하는 ReviewScheduleContent.
// ReviewScheduleContent가 보는 reviewSchedule은 StatsContext 캐시라, 새로고침도 그
// 캐시를 채우는 refreshStats로 한다(개별 복습 일정만 다시 받는 API는 따로 없다).
const ReviewScheduleNewFullSheet = () => {
  "use memo";

  const { popNewFullSheet } = useNewFullSheetActions();
  const { refreshStats } = useStats();
  const handlePullToRefresh = useCallback(async () => {
    await refreshStats();
  }, [refreshStats]);

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-border dark:border-border-dark bg-layout-white dark:bg-layout-black"
      >
        <motion.button
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileHover={{ backgroundColor: 'rgba(0,0,0,0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0,0,0,0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white whitespace-nowrap">
          복습 일정/분포
        </h1>
        <div />
      </div>

      <PullToRefresh onRefresh={handlePullToRefresh} className="flex-1 overflow-y-auto px-[16px] py-[20px]">
        <ReviewScheduleContent />
      </PullToRefresh>
    </div>
  );
};

export default ReviewScheduleNewFullSheet;
