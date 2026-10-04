// src/lib/feel/ShineSweep.jsx
//
// 빛줄기(shine sweep) — 부모(relative + overflow-hidden)를 가로질러 대각선 하이라이트가 한 번 지나간다.
// 부모 요소에 `relative overflow-hidden` 이 있어야 한다. `play` 가 true 가 되는 순간 한 번 재생한다.
// delay(s): 소리 임팩트 프레임에 맞추려면 0.05~0.09 정도.
import React from 'react';
import { motion } from 'framer-motion';

const ShineSweep = ({ play = false, delay = 0.04, duration = 0.55 }) => {
  if (!play) return null;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-[45%] -skew-x-12 bg-gradient-to-r from-transparent via-layout-white to-transparent"
      initial={{ x: '-120%', opacity: 0 }}
      animate={{ x: '320%', opacity: [0, 0.7, 0] }}
      transition={{ duration, delay, ease: 'easeOut' }}
    />
  );
};

export default ShineSweep;
