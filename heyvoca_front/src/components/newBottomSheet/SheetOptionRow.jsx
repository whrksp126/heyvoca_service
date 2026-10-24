import React from 'react';
import { motion } from 'framer-motion';
import { CaretRight, Lock } from '@phosphor-icons/react';

/*
  선택 시트의 한 줄 — 제목 + 설명 한 줄 + 오른쪽 화살표.
  '학습 고르기'(StudyPick)와 '어떻게 돌볼까요?'(BookStudyType)가 같은 규격을 쓴다(이슈 #16 후속).
  왼쪽 아이콘·그림은 두지 않는다. 잠긴 항목은 화살표 자리에 자물쇠만 보인다.
*/
export const SheetOptionRow = ({ title, desc, onClick, faded = false, locked = false, danger = false, first = false }) => (
  <motion.button
    type="button"
    onClick={onClick}
    whileTap={{ scale: 0.99, backgroundColor: 'rgba(0,0,0,0.03)' }}
    className={`
      flex items-center gap-[12px] w-full py-[14px] text-left rounded-[8px]
      ${first ? '' : 'border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.07)]'}
    `}
  >
    <span className={`flex-1 min-w-0 ${faded || locked ? 'opacity-45' : ''}`}>
      <span className={`block text-[15px] font-[700] tracking-[-0.03em] ${danger ? 'text-status-error-600' : 'text-layout-black dark:text-layout-white'}`}>
        {title}
      </span>
      <small className="block mt-[2px] text-[12px] font-[600] tracking-[-0.02em] leading-[1.5] text-layout-gray-300">
        {desc}
      </small>
    </span>

    {locked
      ? <Lock size={14} weight="bold" className="shrink-0 text-layout-gray-300" />
      : <CaretRight size={13} weight="bold" className="shrink-0 text-layout-gray-200" />}
  </motion.button>
);

export default SheetOptionRow;
