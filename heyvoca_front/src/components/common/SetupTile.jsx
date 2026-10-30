import { motion } from 'framer-motion';
import { vibrate } from '../../utils/osFunction';

/**
 * 설정 시트(테스트 설정 · 학습 설정)의 선택 타일.
 *
 * 선택 = 옅은 primary-50 면 + primary-300 테두리(1.5px) + 아이콘·라벨 검정(다크: 흰색).
 * 비선택 = 흰 면 + gray-200 테두리 + gray-400.
 * 진한 primary-600 은 시트의 시작 버튼·토글 ON 에만 쓴다 — 타일까지 진분홍이면 거부감이 크고,
 * 흑백 테두리만 쓰면 너무 밋밋하다는 피드백 사이의 절충(2026-10-30, 이슈 #21). 체크 배지는 뺐다.
 * direction='row' 는 가로형(왼쪽 아이콘 + 오른쪽 라벨) 타일.
 */
const SetupTile = ({
  selected = false,
  onClick,
  className = '',
  children,
  'aria-label': ariaLabel,
  role = 'checkbox',
  direction = 'col',
}) => (
  <motion.button
    type="button"
    role={role}
    aria-checked={selected}
    aria-label={ariaLabel}
    data-selected={selected ? 'true' : 'false'}
    whileTap={{ scale: 0.96 }}
    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    onPointerDown={(e) => e.stopPropagation()}
    onClick={() => {
      vibrate({ duration: 5 });
      onClick?.();
    }}
    className={`
      group relative flex flex-1 items-center
      ${direction === 'row' ? 'flex-row justify-start gap-[10px] px-[12px]' : 'flex-col justify-center gap-[8px] px-[6px] py-[10px]'}
      rounded-[12px]
      ${selected
        ? 'border-[1.5px] border-primary-main-300 dark:border-[#6B3A5D] bg-primary-main-50 dark:bg-primary-main-dark text-layout-black dark:text-layout-white'
        : 'border-[1px] border-layout-gray-200 dark:border-[#3A3A3A] bg-layout-white dark:bg-[#1A1A1A] text-layout-gray-400 dark:text-layout-gray-300'}
      ${className}
    `}
  >
    {children}
  </motion.button>
);

export default SetupTile;
