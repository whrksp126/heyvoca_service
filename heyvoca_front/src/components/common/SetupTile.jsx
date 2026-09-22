import { motion } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';

/**
 * 설정 시트(테스트 설정 · 학습 설정)의 선택 타일.
 *
 * 브랜드색을 쓰지 않는다 — 선택은 검은 테두리 + 우상단 체크 배지로만 표시한다.
 * (시트 안에서 primary 는 시작 CTA 와 듣기 스위치 ON 에만 남긴다.)
 * 선택 시 테두리가 1 → 1.5px 로 굵어진다 — 0.5px 흔들림은 의도된 강조다.
 */
const SetupTile = ({
  selected = false,
  onClick,
  className = '',
  children,
  'aria-label': ariaLabel,
  role = 'checkbox',
}) => (
  <motion.button
    type="button"
    role={role}
    aria-checked={selected}
    aria-label={ariaLabel}
    whileTap={{ scale: 0.96 }}
    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    onPointerDown={(e) => e.stopPropagation()}
    onClick={() => {
      vibrate({ duration: 5 });
      onClick?.();
    }}
    className={`
      relative flex flex-col flex-1 items-center justify-center gap-[8px]
      rounded-[12px] px-[6px] py-[10px]
      bg-layout-white dark:bg-[#1A1A1A]
      ${selected
        ? 'border-[1.5px] border-layout-black dark:border-layout-white text-layout-black dark:text-layout-white'
        : 'border-[1px] border-layout-gray-200 dark:border-[#3A3A3A] text-layout-gray-300'}
      ${className}
    `}
  >
    {selected && (
      <span
        aria-hidden
        className="absolute top-[8px] right-[8px] flex items-center justify-center w-[18px] h-[18px] rounded-full bg-layout-black dark:bg-layout-white"
      >
        <Check size={11} weight="bold" className="text-layout-white dark:text-layout-black" />
      </span>
    )}
    {children}
  </motion.button>
);

export default SetupTile;
