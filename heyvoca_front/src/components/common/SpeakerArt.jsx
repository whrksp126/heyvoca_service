import React, { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * 발음 듣기 스피커 그림 — 카메라·물뿌리개(itemArt)와 같은 입체 그림(크림 몸통 + 코랄 나팔 + 노란 음파).
 * 색이 그림 안에 있어 currentColor 를 쓰지 않는다(라이트·다크 공통).
 * Phosphor SpeakerHigh 자리를 그대로 대체하려고 weight·color 같은 옛 props 는 받아서 버린다.
 *
 * @param {number|string} size  크기(px). 생략하면 1em(부모 글자 크기를 따른다)
 * @param {boolean} playing     재생 중이면 음파 두 줄이 번갈아 출렁인다
 */
const WAVE_IDLE = [0.5, 0.3];

const SpeakerArt = ({ size = '1em', playing = false, className = '' }) => {
  const uid = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const animateWaves = playing && !reduced;

  const wave = (i) => ({
    initial: false,
    animate: animateWaves
      ? { opacity: [0.25, 1, 0.25], x: [0, 1.2, 0] }
      : { opacity: playing ? 1 : WAVE_IDLE[i], x: 0 },
    transition: animateWaves
      ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }
      : { duration: 0.2 },
  });

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      aria-hidden
      className={`shrink-0 select-none ${className}`}
    >
      <defs>
        <linearGradient id={`spCone${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FB9A84" /><stop offset="1" stopColor="#EC6A5C" />
        </linearGradient>
        <linearGradient id={`spBox${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF4DC" /><stop offset="1" stopColor="#EBCFA5" />
        </linearGradient>
      </defs>
      <path d="M17 15.5L26.2 7.6Q30 4.6 30 9.5V38.5Q30 43.4 26.2 40.4L17 32.5Z" fill={`url(#spCone${uid})`} stroke="#D9584C" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="5" y="14.5" width="14" height="19" rx="5" fill={`url(#spBox${uid})`} stroke="#D9A77A" strokeWidth="1.5" />
      <path d="M9 19V25" stroke="#fff" strokeOpacity="0.85" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M22.5 14.5L26 11.6" stroke="#fff" strokeOpacity="0.6" strokeWidth="2.2" strokeLinecap="round" />
      <motion.path d="M35 18.5Q38 24 35 29.5" stroke="#F6B93B" strokeWidth="3.4" strokeLinecap="round" {...wave(0)} />
      <motion.path d="M39.5 13.5Q45.5 24 39.5 34.5" stroke="#F6B93B" strokeWidth="3.4" strokeLinecap="round" {...wave(1)} />
    </svg>
  );
};

export default SpeakerArt;
