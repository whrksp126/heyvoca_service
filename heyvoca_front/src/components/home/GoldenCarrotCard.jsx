// src/components/home/GoldenCarrotCard.jsx
//
// 홈 — 성과 카드 ② "황금 당근" (시안 §10 · §1 기본/위험 프레임).
//
//   rowhead   제목 14px/700 + 우측 "온실" 12px/700 #999999 + CaretRight 10px
//   본문      50px 황금 당근 에셋(§14 item-icon-system) + 개수 20px/800, 단위 "개" 13px #9A9A9A
//
// §14 — 소프트 3D 에셋에는 배경 칩을 두지 않는다. 자체 볼륨과 그림자가 있어
// 배경을 깔면 색이 겹쳐 탁해진다. 배경을 없애고 에셋을 키우는 쪽이 훨씬 선명하다.

import React from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { CROP_ASSETS } from '../farm/CropImage';

const GoldenCarrotCard = ({ count = 0, onMore }) => {
  "use memo";

  return (
    <div className="
      rounded-[12px] p-[16px]
      bg-layout-white dark:bg-layout-gray-dark
      border border-farm-line dark:border-transparent
    ">
      <div className="flex items-center justify-between gap-[8px]">
        <h4 className="flex-1 text-layout-black dark:text-layout-white text-[14px] font-[700] tracking-[-0.02em]">
          황금 당근
        </h4>
        <button
          type="button"
          onClick={onMore}
          className="flex items-center gap-[3px] flex-shrink-0 text-layout-gray-300 text-[12px] font-[700]"
        >
          온실
          <CaretRight size={10} weight="fill" className="text-layout-gray-200" />
        </button>
      </div>

      <div className="flex items-center gap-[13px] mt-[12px]">
        <span className="flex items-center justify-center w-[52px] flex-shrink-0">
          <img
            src={CROP_ASSETS.goldenCarrot}
            alt=""
            draggable={false}
            className="block w-[50px] h-[50px] object-contain select-none"
          />
        </span>
        <div className="text-layout-black dark:text-layout-white text-[20px] font-[800] tracking-[-0.03em]">
          {count}
          <span className="text-[13px] font-[700] text-[#9A9A9A]">개</span>
        </div>
      </div>
    </div>
  );
};

export default GoldenCarrotCard;
