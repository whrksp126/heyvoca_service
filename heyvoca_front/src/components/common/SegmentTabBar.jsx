// src/components/common/SegmentTabBar.jsx
//
// 헤더 바로 아래 두는 알약 세그먼트 탭 줄 — 회색 트랙 + 흰 알약 (학습장 "단어장|글자",
// 상점 "단어장|농장 도구|보석"이 공유한다. 2026-09-29 QA 전에는 두 화면이 각자 같은
// 모양을 따로 구현했는데, 헤더-탭 간격(mt)·탭 아래 여백(mb)이 미묘하게 달라 두 화면을
// 번갈아 보면 탭 줄이 살짝 움직이는 것처럼 보였다. 이 컴포넌트 하나로 규격
// (mt-[10px]·mx-[16px]·mb-[10px]·h-[36px]·p-[3px]·rounded-[10px])을 고정한다 —
// 여백까지 이 컴포넌트가 정하므로, 쓰는 쪽은 바로 위(헤더)·바로 아래(본문)에 별도
// 마진을 주지 않는다.
import React from 'react';

/**
 * @param {{key: string, label: string}[]} tabs
 * @param {string} activeKey
 * @param {(key: string) => void} onSelect
 */
const SegmentTabBar = ({ tabs, activeKey, onSelect, className = '' }) => (
  <div
    className={`
      shrink-0 mt-[10px] mx-[16px] mb-[10px] h-[36px]
      flex p-[3px] rounded-[10px]
      bg-layout-gray-50 dark:bg-layout-gray-dark
      ${className}
    `}
  >
    {tabs.map((tab) => {
      const on = tab.key === activeKey;
      return (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect(tab.key)}
          className={`flex-1 flex items-center justify-center rounded-[8px] text-[13px] font-[700] tracking-[-0.03em] ${
            on
              ? 'bg-layout-white dark:bg-primary-main-dark text-layout-black dark:text-layout-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:shadow-none'
              : 'text-layout-gray-400 dark:text-layout-gray-300'
          }`}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);

export default SegmentTabBar;
