// src/components/takeTest/rewards/RewardGlow.jsx
//
// 주인공 그림 뒤의 빛 — 은은한 원형 글로우 + 천천히 도는 빛줄기.
// 부모(relative)의 한가운데에 놓인다. 켜고 끄는 것은 opacity, 도는 것은 transform 뿐이다.
// 빛줄기 레이어는 꺼져 있을 때도 그려 두고(회전만 멈춤) 켜질 때 새로 만들지 않는다.
import React from 'react';

const PINK = '255,112,212';
const GOLD = '242,183,19';

const raysBg = (rgb, a) =>
  `repeating-conic-gradient(from 0deg, rgba(${rgb},0) 0 12deg, rgba(${rgb},${a}) 15deg 17deg, rgba(${rgb},0) 20deg 30deg)`;
const RAYS_MASK = 'radial-gradient(circle, #000 0, rgba(0,0,0,.5) 28%, transparent 66%)';

const RewardGlow = ({ on = false, gold = false, className = '' }) => {
  const rgb = gold ? GOLD : PINK;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute left-1/2 top-1/2 h-0 w-0 transition-opacity duration-500 ${on ? 'opacity-100' : 'opacity-0'} ${className}`}
    >
      <div
        className='absolute -left-[210px] -top-[210px] h-[420px] w-[420px] rounded-full'
        style={{ background: `radial-gradient(circle, rgba(${rgb},${gold ? 0.36 : 0.3}) 0%, rgba(${rgb},.11) 44%, rgba(${rgb},0) 69%)` }}
      />
      {/* 빛줄기는 처음부터 그려 두고 켜질 때 돌리기만 한다. 예전에는 on 이 되는 순간(=메달 승급·파편·색종이와
          같은 프레임) 460px 원뿔 그라데이션 + 마스크 레이어를 새로 만들어 그 프레임이 길게 멈췄다(8차 QA). */}
      <div
        className={`absolute -left-[230px] -top-[230px] h-[460px] w-[460px] rounded-full animate-[spin_18s_linear_infinite] motion-reduce:animate-none [will-change:transform] ${on ? '' : '[animation-play-state:paused]'}`}
        style={{ background: raysBg(rgb, gold ? 0.42 : 0.3), WebkitMaskImage: RAYS_MASK, maskImage: RAYS_MASK }}
      />
    </div>
  );
};

export default RewardGlow;
