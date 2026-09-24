import React from 'react';

// JLPT 급수 배지 — VerifyMark("미검증") 배지 스타일을 그대로 복제하고 색만 secondary.blue 계열.
// level: 'N5'..'N1' (그 외 값·null 이면 렌더하지 않음)
// size: 'md'(기본, 상세·결과) / 'sm'(목록 행·검색 제안처럼 좁은 자리)
const VALID = ['N5', 'N4', 'N3', 'N2', 'N1'];

const SIZE_CLASS = {
  md: 'rounded-[4px] px-[5px] py-[1px] text-[10px]',
  sm: 'rounded-[3px] px-[3px] py-0 text-[8.5px] leading-[13px]',
};

const JlptBadge = ({ level, size = 'md', className = '' }) => {
  const lv = typeof level === 'string' ? level.toUpperCase() : null;
  if (!lv || !VALID.includes(lv)) return null;
  return (
    <span
      className={`
        shrink-0 ${SIZE_CLASS[size] || SIZE_CLASS.md}
        font-[800] tracking-[-0.02em]
        text-secondary-blue-600
        bg-secondary-blue-100 dark:bg-secondary-blue-dark
        ${className}
      `}
      aria-label={`JLPT ${lv}`}
    >
      {lv}
    </span>
  );
};

export default JlptBadge;
