// src/components/takeTest/planting/SoilHole.jsx
//
// 씨앗을 넣으려고 판 구멍 — 밭 흙을 눌러 판 것처럼 보이게, 밭과 같은 흙 색 계열로만 그린다.
// 빛이 위에서 오므로 구멍 안은 뒤쪽(위)이 깊게 어둡고 앞쪽(아래) 벽이 빛을 받는다.
// 둘레에는 파낸 흙이 얇게 둘러 있고, 가장자리는 밭으로 사라진다.
import React, { useId } from 'react';

export const HOLE_W = 44;
export const HOLE_H = 22;

const SoilHole = () => {
  const id = useId();
  const rim = `${id}rim`;
  const pit = `${id}pit`;
  return (
    <svg width={HOLE_W} height={HOLE_H} viewBox='0 0 44 22' fill='none' aria-hidden='true' className='block'>
      <defs>
        <radialGradient id={rim} cx='22' cy='11' r='22' gradientUnits='userSpaceOnUse' gradientTransform='translate(0 5.5) scale(1 .5)'>
          <stop offset='.55' stopColor='#B0845A' stopOpacity='.7' />
          <stop offset='.8' stopColor='#A47548' stopOpacity='.35' />
          <stop offset='1' stopColor='#9A7046' stopOpacity='0' />
        </radialGradient>
        <linearGradient id={pit} x1='22' y1='4.5' x2='22' y2='17.5' gradientUnits='userSpaceOnUse'>
          <stop offset='0' stopColor='#3A230F' />
          <stop offset='.55' stopColor='#54361B' />
          <stop offset='1' stopColor='#74502E' />
        </linearGradient>
      </defs>
      <ellipse cx='22' cy='11' rx='22' ry='11' fill={`url(#${rim})`} />
      <ellipse cx='22' cy='11' rx='15.5' ry='6.5' fill={`url(#${pit})`} />
      {/* 앞쪽 턱에 걸리는 빛 */}
      <path d='M9.5 14.2c3 2.3 7.5 3.3 12.5 3.3s9.5-1 12.5-3.3' stroke='#C29A70' strokeOpacity='.55' strokeWidth='1' strokeLinecap='round' />
    </svg>
  );
};

export default SoilHole;
