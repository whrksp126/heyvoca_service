// src/components/takeTest/planting/SoilMound.jsx
//
// 씨앗을 덮은 흙무덤 한 줌 — 밭 그림(field-base)의 흙보다 한 톤 밝은 갓 뒤집은 흙.
// 밭 그림은 라이트·다크에서 같은 그림을 쓰므로 여기 색도 테마를 타지 않는다.
import React from 'react';

const SoilMound = () => (
  <svg width='44' height='20' viewBox='0 0 44 20' fill='none' aria-hidden='true'>
    {/* 바닥 그림자 */}
    <ellipse cx='22' cy='15.5' rx='21' ry='4.5' fill='#4A2D14' opacity='.38' />
    {/* 무덤 몸통 */}
    <path d='M2 14C4 7.5 9 3.5 14 4.6c2.6-2.4 6.2-3 9-1.2 3.4-1.6 7.6-.4 9.6 2.2C37.6 6 41 9.6 42 14c0 2.9-9 5-20 5S2 16.9 2 14Z' fill='#A87850' />
    {/* 아래쪽 음영 */}
    <path d='M2 14c0 2.9 9 5 20 5s20-2.1 20-5c-.3-1.1-.7-2.2-1.2-3.1C39 13.8 31 15.6 22 15.6S5 13.8 3.2 10.9C2.7 11.8 2.3 12.9 2 14Z' fill='#855A36' />
    {/* 윗면 빛 */}
    <path d='M9.5 7.8c2-1.7 4.2-2.3 6-1.7M19.5 5.6c1.7-1 3.7-1.1 5.3-.3' stroke='#C99A70' strokeWidth='1.6' strokeLinecap='round' />
    {/* 흙 알갱이 */}
    <circle cx='31.5' cy='8.6' r='1.3' fill='#C99A70' />
    <circle cx='12' cy='12' r='1.1' fill='#6B4526' />
    <circle cx='27' cy='12.6' r='1' fill='#6B4526' />
    <circle cx='36' cy='12' r='.9' fill='#C99A70' />
  </svg>
);

export default SoilMound;
