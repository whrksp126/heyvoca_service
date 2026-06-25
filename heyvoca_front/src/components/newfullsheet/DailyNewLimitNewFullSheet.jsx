import React, { useState } from 'react';
import { CaretLeft, Minus, Plus } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { updateUserInfoApi } from '../../api/auth';
import { vibrate } from '../../utils/osFunction';

// 선택 가능한 단계: 0(무제한), 5, 10, 15, 20, 25, 30, 35, 40, 45, 50
const STEP = 5;
const MIN_LIMIT = 5;
const MAX_LIMIT = 50;
const UNLIMITED = 0;

const clampToStep = (value) => {
  if (value <= UNLIMITED) return UNLIMITED;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.round(value / STEP) * STEP));
};

const DailyNewLimitNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { userProfile, setUserProfile } = useUser();

  const rawLimit = userProfile?.daily_new_limit ?? 20;
  const [localLimit, setLocalLimit] = useState(
    rawLimit === UNLIMITED ? UNLIMITED : clampToStep(rawLimit)
  );
  const [isSaving, setIsSaving] = useState(false);

  // 표시 레이블
  const displayLabel = localLimit === UNLIMITED ? '무제한' : `${localLimit}개`;

  // 감소: 5 → 무제한(0), 나머지 -5
  const handleDecrement = () => {
    vibrate({ duration: 5 });
    if (localLimit === UNLIMITED) return;
    if (localLimit <= MIN_LIMIT) {
      setLocalLimit(UNLIMITED);
    } else {
      setLocalLimit((prev) => prev - STEP);
    }
  };

  // 증가: 무제한 → 5, 나머지 +5
  const handleIncrement = () => {
    vibrate({ duration: 5 });
    if (localLimit === UNLIMITED) {
      setLocalLimit(MIN_LIMIT);
    } else if (localLimit < MAX_LIMIT) {
      setLocalLimit((prev) => prev + STEP);
    }
  };

  const isDecrementDisabled = localLimit === UNLIMITED;
  const isIncrementDisabled = localLimit >= MAX_LIMIT;

  const handleSave = async () => {
    if (isSaving) return;
    vibrate({ duration: 5 });

    // 낙관적 업데이트
    const prevLimit = userProfile?.daily_new_limit;
    setUserProfile((prev) => ({ ...prev, daily_new_limit: localLimit }));
    setIsSaving(true);

    try {
      const result = await updateUserInfoApi({ daily_new_limit: localLimit });
      if (!result || result.code !== 200) {
        // 실패 시 롤백
        setUserProfile((prev) => ({ ...prev, daily_new_limit: prevLimit }));
        setLocalLimit(prevLimit === UNLIMITED ? UNLIMITED : clampToStep(prevLimit ?? 20));
      }
    } catch (e) {
      setUserProfile((prev) => ({ ...prev, daily_new_limit: prevLimit }));
      setLocalLimit(prevLimit === UNLIMITED ? UNLIMITED : clampToStep(prevLimit ?? 20));
    } finally {
      setIsSaving(false);
    }

    popNewFullSheet();
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-border dark:border-border-dark bg-layout-white dark:bg-layout-black"
      >
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
            className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
            whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', scale: 1.05 }}
            whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <CaretLeft size={24} />
          </motion.button>
        </div>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white">
          학습 설정
        </h1>
        <div className="flex items-center gap-[8px] text-layout-gray-200 dark:text-layout-white"></div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 overflow-y-auto">

        {/* ── 새 단어 수 설정 행 ── */}
        <div className="px-[16px] py-[20px] border-b border-border dark:border-border-dark">
          <div className="flex items-center justify-between gap-[12px]">
            {/* 라벨 */}
            <div className="flex flex-col gap-[2px]">
              <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white">새 단어 수</span>
              <span className="text-[12px] text-layout-gray-300 dark:text-layout-gray-400">하루에 새로 학습할 단어 수</span>
            </div>

            {/* 스테퍼 */}
            <div className="flex items-center gap-[12px] shrink-0">
              <motion.button
                onClick={handleDecrement}
                disabled={isDecrementDisabled}
                className={`
                  flex items-center justify-center w-[36px] h-[36px] rounded-[8px] border-[1.5px]
                  ${isDecrementDisabled
                    ? 'border-layout-gray-200 text-layout-gray-200 dark:border-layout-gray-500 dark:text-layout-gray-500'
                    : 'border-primary-main-600 text-primary-main-600'
                  }
                `}
                whileTap={isDecrementDisabled ? {} : { scale: 0.9 }}
              >
                <Minus size={16} />
              </motion.button>

              <span className="w-[64px] text-center text-[20px] font-[800] text-primary-main-600 tabular-nums">
                {displayLabel}
              </span>

              <motion.button
                onClick={handleIncrement}
                disabled={isIncrementDisabled}
                className={`
                  flex items-center justify-center w-[36px] h-[36px] rounded-[8px] border-[1.5px]
                  ${isIncrementDisabled
                    ? 'border-layout-gray-200 text-layout-gray-200 dark:border-layout-gray-500 dark:text-layout-gray-500'
                    : 'border-primary-main-600 text-primary-main-600'
                  }
                `}
                whileTap={isIncrementDisabled ? {} : { scale: 0.9 }}
              >
                <Plus size={16} />
              </motion.button>
            </div>
          </div>
        </div>

        {/* 향후 다른 학습 설정 항목이 이 아래에 추가됨 */}

      </div>

      {/* 저장 버튼 — 하단 고정 */}
      <div className="px-5 py-4 border-t border-border dark:border-border-dark bg-layout-white dark:bg-layout-black">
        <motion.button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full h-[48px] rounded-[10px] bg-primary-main-600 text-layout-white text-[16px] font-bold disabled:opacity-50"
          whileTap={isSaving ? {} : { scale: 0.97 }}
        >
          저장
        </motion.button>
      </div>
    </div>
  );
};

export default DailyNewLimitNewFullSheet;
