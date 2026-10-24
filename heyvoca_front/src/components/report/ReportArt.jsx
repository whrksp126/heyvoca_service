import React, { useId } from 'react';

/**
 * 오류 신고 그림 — 크림 말풍선 + 코랄 느낌표 + 노란 별. 스피커(SpeakerArt)·카메라와 같은 입체 그림이라
 * 색이 그림 안에 있다(라이트·다크 공통).
 */
const ReportArt = ({ size = 24, className = '' }) => {
  const uid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" aria-hidden className={`shrink-0 select-none ${className}`}>
      <defs>
        <linearGradient id={`rpBody${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF4DC" /><stop offset="1" stopColor="#F3D9AE" />
        </linearGradient>
        <linearGradient id={`rpStar${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE27A" /><stop offset="1" stopColor="#F6B93B" />
        </linearGradient>
      </defs>
      <path d="M12 6H34Q42.5 6 42.5 14.5V27Q42.5 35.5 34 35.5H22L13.5 42.5Q11.5 44 11.5 41.5V35.3Q4.5 34.3 4.5 27V14.5Q4.5 6 12 6Z" fill={`url(#rpBody${uid})`} stroke="#D9A77A" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 12.5Q11 10 14 10H22" stroke="#fff" strokeOpacity="0.9" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M23.5 13.5V22.5" stroke="#EC6A5C" strokeWidth="5" strokeLinecap="round" />
      <circle cx="23.5" cy="29" r="2.8" fill="#EC6A5C" />
      <path d="M40 2.5L41.3 5.7L44.5 7L41.3 8.3L40 11.5L38.7 8.3L35.5 7L38.7 5.7Z" fill={`url(#rpStar${uid})`} stroke="#E5A024" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
};

export default ReportArt;
