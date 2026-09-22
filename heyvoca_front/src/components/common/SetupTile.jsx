import { motion } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';

/**
 * 설정 시트(테스트 설정 · 학습 설정)의 선택 타일.
 *
 * 선택 = primary 테두리(1.5px) + 우상단 primary 체크 배지 + 아이콘 primary. 라벨은 검정/흰색 유지.
 * 면은 칠하지 않는다(면까지 물들이면 시트 전체가 분홍이 된다 — 1차 시안 피드백).
 * 처음엔 흑백 테두리만 썼는데 "너무 밋밋하다"는 피드백으로 포인트 컬러를 이만큼만 되돌렸다.
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
    data-selected={selected ? 'true' : 'false'}
    whileTap={{ scale: 0.96 }}
    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    onPointerDown={(e) => e.stopPropagation()}
    onClick={() => {
      vibrate({ duration: 5 });
      onClick?.();
    }}
    className={`
      group relative flex flex-col flex-1 items-center justify-center gap-[8px]
      rounded-[12px] px-[6px] py-[10px]
      bg-layout-white dark:bg-[#1A1A1A]
      ${selected
        ? 'border-[1.5px] border-primary-main-600 text-primary-main-600'
        : 'border-[1px] border-layout-gray-200 dark:border-[#3A3A3A] text-layout-gray-300'}
      ${className}
    `}
  >
    {selected && (
      <span
        aria-hidden
        className="absolute top-[8px] right-[8px] flex items-center justify-center w-[18px] h-[18px] rounded-full bg-primary-main-600"
      >
        <Check size={11} weight="bold" className="text-layout-white" />
      </span>
    )}
    {children}
  </motion.button>
);

export default SetupTile;
