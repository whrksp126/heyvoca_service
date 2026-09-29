// src/components/common/LangFlagIcon.jsx
//
// 학습 언어 타일의 국기 배지 — 실사 이모지/외부 이미지 대신 단순화한 플랫 인라인 SVG
// (heyvoca 디자인 시스템 톤: 둥근 모서리, 채도를 살짝 낮춘 색, 다크 모드에서 흰 면이 튀지
// 않게 순백 대신 아이보리 톤을 쓴다). 학습 언어 배지 전용이라 en/ja 두 개만 갖는다.

import React from 'react';

// 순백 대신 살짝 톤 다운한 아이보리 — 다크 배경 위 타일에서도 밝은 면이 튀지 않는다.
const IVORY = '#F2EEE6';
const RED = '#C9414F';
const NAVY = '#33507A';

const UsFlagIcon = ({ size = 40, className = '' }) => (
  <svg
    viewBox="0 0 40 30"
    width={size}
    height={size * 0.75}
    className={className}
    role="img"
    aria-label="미국 국기"
  >
    <rect width="40" height="30" rx="6" fill={IVORY} />
    {[0, 1, 2, 3, 4, 5, 6].map((i) => (
      i % 2 === 0 && (
        <rect key={i} x="0" y={i * (30 / 7)} width="40" height={30 / 7} fill={RED} />
      )
    ))}
    <rect x="0" y="0" width="20" height={30 * 4 / 7} fill={NAVY} rx="0" />
    {/* 좌상단만 둥글게(카드 라운딩과 맞춤) */}
    <path d={`M6,0 H20 V${30 * 4 / 7} H0 V6 A6,6 0 0 1 6,0 Z`} fill={NAVY} />
    {/* 별 자리 — 2x3 점으로 단순화 */}
    {[0, 1].map((row) => (
      [0, 1, 2].map((col) => (
        <circle
          key={`${row}-${col}`}
          cx={4 + col * 6}
          cy={5 + row * 7}
          r="1"
          fill={IVORY}
        />
      ))
    ))}
  </svg>
);

const JpFlagIcon = ({ size = 40, className = '' }) => (
  <svg
    viewBox="0 0 40 30"
    width={size}
    height={size * 0.75}
    className={className}
    role="img"
    aria-label="일본 국기"
  >
    <rect width="40" height="30" rx="6" fill={IVORY} />
    <circle cx="20" cy="15" r="7.5" fill={RED} />
  </svg>
);

const LangFlagIcon = ({ lang, size = 40, className = '' }) => {
  if (lang === 'ja') return <JpFlagIcon size={size} className={className} />;
  return <UsFlagIcon size={size} className={className} />;
};

export default LangFlagIcon;
