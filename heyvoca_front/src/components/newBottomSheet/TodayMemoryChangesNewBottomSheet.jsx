import React from 'react';
import { EggCrack, Leaf, Plant, Carrot, ArrowRight, TrendUp, Sparkle } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

// 백엔드 memory state 키(unlearned/short/medium/long) 기준
const STATE_INFO = {
  unlearned: { name: '미학습',   Icon: EggCrack, color: '#9D835A' },
  short:     { name: '단기 암기', Icon: Leaf,     color: '#77CE4F' },
  medium:    { name: '중기 암기', Icon: Plant,    color: '#38CE38' },
  long:      { name: '장기 암기', Icon: Carrot,   color: '#F68300' },
};

const ChangeRow = ({ entry }) => {
  const fromInfo = STATE_INFO[entry.from] ?? STATE_INFO.unlearned;
  const toInfo = STATE_INFO[entry.to] ?? STATE_INFO.short;
  return (
    <div className="flex items-center justify-between py-[10px] px-[14px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark">
      <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white truncate">
        {entry.word}
      </span>
      <span className="flex items-center gap-[6px] flex-shrink-0 ml-[10px]">
        <fromInfo.Icon size={14} weight="fill" color={fromInfo.color} />
        <ArrowRight size={12} weight="bold" className="text-layout-gray-300" />
        <toInfo.Icon size={16} weight="fill" color={toInfo.color} />
        <span className="text-[12px] font-[600]" style={{ color: toInfo.color }}>
          {toInfo.name}
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
