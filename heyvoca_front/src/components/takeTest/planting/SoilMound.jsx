// src/components/takeTest/planting/SoilMound.jsx
//
// 씨앗을 덮은 흙무덤 — 밭 그림(field-base)의 흙을 그대로 봉긋하게 올린 모양이다.
// 색은 밭 흙(#946A40 ~ #855C38)과 같은 계열만 쓰고, 빛은 밭·작물 그림처럼 위쪽에서 온다.
// 아래 가장자리는 투명하게 풀어 밭 흙에 스며들게 한다(딱 떨어지는 외곽선·그림자 없음).
// 밭 그림은 라이트·다크에서 같은 그림을 쓰므로 여기 색도 테마를 타지 않는다.
// 무덤이 땅에 닿는 가운데는 (MOUND_GROUND_X, MOUND_GROUND_Y) 다.
import React, { useId } from 'react';

export const MOUND_W = 56;
export const MOUND_H = 30;
export const MOUND_GROUND_X = 28;
export const MOUND_GROUND_Y = 20;

const SoilMound = () => {
  const id = useId();
  const patch = `${id}patch`;
  const shade = `${id}shade`;
  const body = `${id}body`;
  const foot = `${id}foot`;
  const lit = `${id}lit`;
  return (
    <svg width={MOUND_W} height={MOUND_H} viewBox='0 0 56 30' fill='none' aria-hidden='true' className='block'>
      <defs>
        {/* 뒤집힌 흙 자국 — 밭보다 살짝 짙고 가장자리는 밭으로 사라진다 */}
        <radialGradient id={patch} cx='28' cy='20.5' r='27' gradientUnits='userSpaceOnUse' gradientTransform='translate(0 13.6) scale(1 .34)'>
          <stop offset='0' stopColor='#5E3C1F' stopOpacity='.5' />
          <stop offset='.62' stopColor='#6B4526' stopOpacity='.26' />
          <stop offset='1' stopColor='#7A5230' stopOpacity='0' />
        </radialGradient>
        {/* 무덤이 땅에 드리우는 부드러운 그림자(빛이 위에서 오므로 앞쪽 아래로) */}
        <radialGradient id={shade} cx='28' cy='23.5' r='21' gradientUnits='userSpaceOnUse' gradientTransform='translate(0 16.9) scale(1 .28)'>
          <stop offset='0' stopColor='#3F2812' stopOpacity='.42' />
          <stop offset='.7' stopColor='#3F2812' stopOpacity='.14' />
          <stop offset='1' stopColor='#3F2812' stopOpacity='0' />
        </radialGradient>
        {/* 몸통 — 위는 밭보다 밝고 아래로 갈수록 밭 색을 지나 어두워진다 */}
        <linearGradient id={body} x1='28' y1='9.5' x2='28' y2='25' gradientUnits='userSpaceOnUse'>
          <stop offset='0' stopColor='#B0845A' />
          <stop offset='.42' stopColor='#9A7046' />
          <stop offset='.8' stopColor='#855C38' />
          <stop offset='1' stopColor='#754E2D' />
        </linearGradient>
        {/* 발치 — 몸통 아래 가장자리를 밭 흙 색으로 풀어 경계를 지운다 */}
        <linearGradient id={foot} x1='28' y1='19' x2='28' y2='25.5' gradientUnits='userSpaceOnUse'>
          <stop offset='0' stopColor='#855C38' stopOpacity='0' />
          <stop offset='1' stopColor='#855C38' stopOpacity='.55' />
        </linearGradient>
        {/* 윗면에 떨어지는 빛 */}
        <radialGradient id={lit} cx='25' cy='13.4' r='13' gradientUnits='userSpaceOnUse' gradientTransform='translate(0 9.1) scale(1 .32)'>
          <stop offset='0' stopColor='#D9B48A' stopOpacity='.6' />
          <stop offset='1' stopColor='#D9B48A' stopOpacity='0' />
        </radialGradient>
      </defs>
      <ellipse cx='28' cy='20.5' rx='27' ry='9.2' fill={`url(#${patch})`} />
      <ellipse cx='28' cy='23.5' rx='21' ry='5.9' fill={`url(#${shade})`} />
      <path d='M9.5 20C9.5 14 18 9.5 28 9.5S46.5 14 46.5 20c0 3-8.3 5.3-18.5 5.3S9.5 23 9.5 20Z' fill={`url(#${body})`} />
      <path d='M9.5 20C9.5 14 18 9.5 28 9.5S46.5 14 46.5 20c0 3-8.3 5.3-18.5 5.3S9.5 23 9.5 20Z' fill={`url(#${foot})`} />
      <ellipse cx='25' cy='13.4' rx='13' ry='4.2' fill={`url(#${lit})`} />
      {/* 흙 알갱이 — 무덤 위 몇 알, 발치에 굴러 내린 몇 알 */}
      <ellipse cx='36' cy='14.6' rx='1.5' ry='1.1' fill='#B98C5E' />
      <ellipse cx='18' cy='16.8' rx='1.3' ry='1' fill='#7A5230' />
      <ellipse cx='30.5' cy='19.4' rx='1.2' ry='.900' fill='#7A5230' />
      <ellipse cx='6.5' cy='22.3' rx='1.7' ry='1.2' fill='#9A7046' />
      <ellipse cx='6.3' cy='22.9' rx='1.7' ry='.800' fill='#6B4526' opacity='.5' />
      <ellipse cx='49.8' cy='21.4' rx='1.4' ry='1' fill='#A47548' />
      <ellipse cx='44' cy='25.6' rx='1.2' ry='.85' fill='#9A7046' />
    </svg>
  );
};

export default SoilMound;
