// src/components/home/InfoStrip.jsx
//
// 한 줄 스트립 — 시안 §8.
//
// 카드 하나를 쓸 만큼은 아니지만 지금 알려야 하는 단일 항목을 위한 컴포넌트다.
// 아이콘 · 문장 · CaretRight 한 줄이 전부이고, 누르면 해당 목록으로 간다.
// (연속 학습도 한때 이 컴포넌트였지만 담을 정보가 늘면서 카드로 승격했다.)
//
//   변형   배경                             문구 예시
//   seed   #ECFDF3 (status-success-100)     새 씨앗 24개가 밭에 도착했어요
//   water  #FFEEFA (primary-main-100)       오늘 안에 물이 필요한 작물 2개
//   amber  #FFF3E4                          썩은 작물 3개를 되살릴 수 있어요
//
// 규격: radius 12 · padding 11px 14px · 14px/700 · 아이콘 상자 26px(에셋 24px) · 캐럿 12px

import React from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';

const VARIANT_CLASS = {
  seed: 'bg-status-success-100 dark:bg-status-success-dark',
  water: 'bg-primary-main-100 dark:bg-primary-main-dark',
  amber: 'bg-[#FFF3E4] dark:bg-secondary-yellow-dark',
};

const InfoStrip = ({ variant = 'seed', icon, label, sub, onClick }) => {
  "use memo";

  const handleClick = () => {
    if (!onClick) return;
    vibrate({ duration: 5 });
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        flex items-center gap-[12px] w-full text-left
        rounded-[12px] px-[14px] py-[11px]
        text-[14px] font-[700] tracking-[-0.02em]
        text-layout-black dark:text-layout-white
        ${VARIANT_CLASS[variant] ?? VARIANT_CLASS.seed}
      `}
    >
      <span className="flex items-center justify-center w-[26px] flex-shrink-0">
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        {label}
        {sub && (
          <span className="block text-[12px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 mt-[2px] tracking-[-0.02em]">
            {sub}
          </span>
        )}
      </span>
      <CaretRight size={12} weight="fill" className="flex-shrink-0 text-layout-gray-200" />
    </button>
  );
};

export default InfoStrip;
