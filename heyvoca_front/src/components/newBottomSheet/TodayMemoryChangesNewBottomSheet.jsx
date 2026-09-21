import React from 'react';
import { ArrowRight, TrendUp, Sparkle } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import { memoryStateVisualStage } from '../../utils/vocaCrop';
import { cropLabelDetail, cropTextClass } from '../../utils/crop';
import CropImage from '../farm/CropImage';

const ChangeRow = ({ entry }) => {
  // '신규' 목록(from===unlearned)은 오늘 처음 학습한 단어임이 백엔드 분류로 보장돼 있어
  // 진짜 미학습(UNPLANTED_SEED)으로 그린다. 그 외 from은 memoryStateVisualStage의 근사(씨앗~당근)를 쓴다.
  const fromStage = entry.from === 'unlearned' ? 'UNPLANTED_SEED' : memoryStateVisualStage(entry.from);
  // to는 백엔드가 오늘 승급/신규 판정 시점의 실제 visual_stage를 내려준다(entry.stage) — 있으면 그대로 쓴다.
  const toStage = entry.stage || memoryStateVisualStage(entry.to);
  return (
    <div className="flex items-center justify-between py-[10px] px-[14px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark">
      <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white truncate">
        {entry.word}
      </span>
      <span className="flex items-center gap-[6px] flex-shrink-0 ml-[10px]">
        <CropImage stage={fromStage} size={18} align="center" className="flex-shrink-0" />
        <ArrowRight size={12} weight="bold" className="text-layout-gray-300" />
        <CropImage stage={toStage} size={20} align="center" className="flex-shrink-0" />
        <span className={`text-[12px] font-[600] ${cropTextClass(toStage)}`}>
          {cropLabelDetail(toStage)}
        </span>
      </span>
    </div>
  );
};

/**
 * 홈 '오늘의 기억 변화' 상세 — 오늘 승급/신규 단어 목록 바텀시트.
 * changes: GET /insights/today-changes 응답 data (홈에서 이미 조회한 값 전달)
 */
const TodayMemoryChangesNewBottomSheet = ({ changes }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewBottomSheet } = useNewBottomSheetActions();
  const promoted = changes?.promoted ?? [];
  const newWords = changes?.new ?? [];

  return (
    <div className="flex flex-col gap-[15px] p-[20px] pb-[28px]">
      <h1 className="text-[18px] font-[800] text-layout-black dark:text-layout-white">
        오늘의 기억 변화
      </h1>

      <div className="flex flex-col gap-[15px] max-h-[60vh] overflow-y-auto">
        {promoted.length > 0 && (
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center gap-[5px]">
              <TrendUp size={14} weight="bold" className="text-primary-main-600" />
              <span className="text-[13px] font-[700] text-layout-black dark:text-layout-white">
                승급한 단어 {promoted.length}개
              </span>
            </div>
            {promoted.map((entry) => (
              <ChangeRow key={entry.user_voca_id} entry={entry} />
            ))}
          </div>
        )}

        {newWords.length > 0 && (
          <div className="flex flex-col gap-[8px]">
            <div className="flex items-center gap-[5px]">
              <Sparkle size={14} weight="bold" className="text-primary-main-600" />
              <span className="text-[13px] font-[700] text-layout-black dark:text-layout-white">
                새로 학습한 단어 {newWords.length}개
              </span>
            </div>
            {newWords.map((entry) => (
              <ChangeRow key={entry.user_voca_id} entry={entry} />
            ))}
          </div>
        )}
      </div>

      <motion.button
        type="button"
        className="w-full py-[14px] rounded-[8px] bg-layout-gray-200 text-layout-white dark:text-layout-black text-[16px] font-[700]"
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          vibrate({ duration: 5 });
          popNewBottomSheet();
        }}
      >
        닫기
      </motion.button>
    </div>
  );
};

export default TodayMemoryChangesNewBottomSheet;
