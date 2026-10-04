// src/lib/feel/Burst.jsx
//
// 작은 파편(파티클) 흩어짐 — 정답 채점 패널에서 쓴다. 토큰 색 6~8개 원이 부모 중앙에서 퍼져 사라진다.
// 부모는 relative 여야 하며, 파편은 pointer-events 를 막지 않는다. 각도·거리는 인덱스로 결정(렌더마다 안 바뀜).
import React from 'react';
import { motion } from 'framer-motion';

const COLORS = [
  'bg-primary-main-400',
  'bg-secondary-yellow-400',
  'bg-status-success-400',
  'bg-secondary-mint-400',
  'bg-primary-main-300',
  'bg-secondary-yellow-300',
  'bg-status-success-300',
  'bg-secondary-mint-300',
];

const Burst = ({ play = false, count = 8, radius = 46, delay = 0.08, className = '' }) => {
  if (!play) return null;
  const n = Math.max(6, Math.min(8, count));
  return (
    <span aria-hidden className={`pointer-events-none absolute left-1/2 top-1/2 h-0 w-0 ${className}`}>
      {Array.from({ length: n }).map((_, i) => {
        const angle = (i / n) * Math.PI * 2 + (i % 2 ? 0.25 : 0);
        const dist = radius * (i % 2 ? 0.75 : 1);
        return (
          <motion.span
            key={i}
            className={`absolute left-0 top-0 h-[6px] w-[6px] rounded-full ${COLORS[i % COLORS.length]}`}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
            animate={{
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist - 8,
              scale: [0.4, 1, 0.6],
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 0.65, delay, ease: 'easeOut' }}
          />
        );
      })}
    </span>
  );
};

export default Burst;
