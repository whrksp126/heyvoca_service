// src/components/takeTest/rewards/RewardHint.jsx
//
// 연출이 끝난 뒤 뜨는 한 줄 — 주인공 그림을 눌러 볼 수 있다는 안내.
import React from 'react';
import { HandTap } from '@phosphor-icons/react';

const RewardHint = ({ show, children, className = '' }) => (
  <p
    className={`flex items-center justify-center gap-[3px] text-[11px] font-[600] text-layout-gray-300 dark:text-layout-gray-400 transition-opacity duration-500 ${show ? 'opacity-100' : 'opacity-0'} ${className}`}
  >
    <HandTap size={13} weight="fill" />
    {children}
  </p>
);

export default RewardHint;
