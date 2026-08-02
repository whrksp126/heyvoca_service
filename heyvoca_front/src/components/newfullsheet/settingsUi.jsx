import React from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';

/**
 * 설정 계열 풀시트 공용 조각 — 시안 "설정" 5·6절.
 *   행 규격: 아이콘 원 30px · 제목 14.5px/700 · 부제 11px/500 · 우측 값 12px 회색 · 캐럿
 *   색 규칙: 아이콘 원은 무채색(#F5F5F5 면 · #7B7B7B 글리프, 다크 #2A2A2A).
 *            분홍(#FF70D4)은 토글 켜짐 · 선택 체크박스 · 닉네임 연필에만 쓴다.
 */

/** 상단 바 — 시안 .shbar (52px · 타이틀 16px/700 가운데 · 뒤로가기 좌측) */
export const SheetBar = ({ title }) => {
  const { popNewFullSheet } = useNewFullSheetActions();
  return (
    <div
      data-page-header
      className="relative flex items-center justify-center h-[52px] shrink-0 px-[16px] bg-layout-white dark:bg-layout-black"
    >
      <motion.button
        onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
        className="absolute left-[12px] flex items-center text-layout-black dark:text-layout-white rounded-[8px]"
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        aria-label="뒤로"
      >
        <CaretLeft size={22} />
      </motion.button>
      <h1 className="text-[16px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
        {title}
      </h1>
    </div>
  );
};

/** 그룹 라벨 — 시안 .glabel (12px/700 회색 · 위 13px 아래 5px) */
export const GroupLabel = ({ children, first = false }) => (
  <div className={`${first ? 'pt-[2px]' : 'pt-[13px]'} pb-[5px] text-[12px] font-[700] tracking-[-0.02em] text-layout-gray-300`}>
    {children}
  </div>
);

/** 아이콘 원 — 무채색. 행을 구분할 뿐 강조하지 않는다 (시안 6절) */
export const IconCircle = ({ children }) => (
  <span className="w-[30px] h-[30px] shrink-0 rounded-[9px] bg-layout-gray-50 dark:bg-[#2A2A2A] flex items-center justify-center text-layout-gray-400">
    {children}
  </span>
);

/** 토글 — 켜짐만 분홍 (시안 .tg) */
export const Toggle = ({ on, onClick }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    onClick={onClick}
    className={`w-[48px] h-[28px] shrink-0 rounded-full p-[3px] flex items-center transition-colors ${
      on ? 'bg-primary-main-600 justify-end' : 'bg-layout-gray-100 dark:bg-[#3A3A3A]'
    }`}
  >
    <span className="block w-[22px] h-[22px] rounded-full bg-layout-white shadow-[0_1px_3px_rgba(0,0,0,.2)]" />
  </button>
);

/**
 * 설정 한 줄.
 * 구분선은 행 사이에만 그린다(시안 `.srow + .srow`) — 그룹 첫 줄 위에는 없다.
 */
export const SettingRow = ({ icon, title, sub, value, onClick, caret = true, toggle, first = false }) => (
  <div
    onClick={onClick ? () => { vibrate({ duration: 5 }); onClick(); } : undefined}
    className={`flex items-center gap-[11px] py-[11px] ${first ? '' : 'border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.07)]'}`}
  >
    <IconCircle>{icon}</IconCircle>
    <span className="flex-1 min-w-0 text-[14.5px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
      {title}
      {sub && (
        <small className="block mt-[2px] text-[11px] font-[500] tracking-[-0.02em] text-layout-gray-300">
          {sub}
        </small>
      )}
    </span>
    {toggle !== undefined ? (
      <Toggle on={toggle} onClick={onClick} />
    ) : (
      <>
        {value && <span className="shrink-0 text-[12px] font-[600] text-layout-gray-300">{value}</span>}
        {caret && <CaretRight size={13} className="shrink-0 text-layout-gray-200" />}
      </>
    )}
  </div>
);

/**
 * 안내 박스 — 시안 .info / .info.warn / .info.blue (11px · line-height 1.55).
 * 강조(b)는 톤마다 색이 따로 있다 — 회색 #404040 · 경고 #93370D · 파랑 #1849A9.
 */
export const InfoBox = ({ tone = 'gray', icon, children }) => {
  const tones = {
    gray: 'bg-[#F7F7F7] dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-300 [&_b]:font-[700] [&_b]:text-layout-gray-500 dark:[&_b]:text-layout-gray-100',
    warn: 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark text-[#B54708] dark:text-[#FDB022] [&_b]:font-[700] [&_b]:text-[#93370D] dark:[&_b]:text-[#FEC84B]',
    blue: 'bg-[#EFF8FF] dark:bg-secondary-blue-dark text-[#175CD3] dark:text-[#84CAFF] [&_b]:font-[700] [&_b]:text-[#1849A9] dark:[&_b]:text-[#B2DDFF]',
  };
  return (
    <div className={`flex gap-[8px] mt-[12px] px-[11px] py-[10px] rounded-[10px] text-[11px] leading-[1.55] tracking-[-0.02em] ${tones[tone]}`}>
      <span className="shrink-0 mt-[1px]">{icon}</span>
      <span>{children}</span>
    </div>
  );
};

/** 힌트 한 줄 — 시안 .hint (10.5px 회색) */
export const Hint = ({ children, className = '' }) => (
  <div className={`text-[10.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-300 ${className}`}>
    {children}
  </div>
);
