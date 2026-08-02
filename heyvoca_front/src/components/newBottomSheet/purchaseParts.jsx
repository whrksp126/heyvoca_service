import React from 'react';
import { motion } from 'framer-motion';
import iconGem from '../../assets/images/farm/icon-gem.png';

/**
 * 상점 구매 흐름 공용 조각.
 *
 * 시안 정본: shop-purchase.txt §3(확인 시트가 반드시 보여줘야 하는 세 값) · §5(실패 화면),
 *            shop-result.txt §5(리턴 화면의 공통 규격).
 *
 * 확인 시트 넷(단어장 · 빈 단어장 · 아이템 · 보석)과 리턴 시트 여덟 장이
 * **같은 값을 같은 형식**으로 적어야 한다는 게 두 시안의 공통 요구라, 조각을 한 곳에 둔다.
 * 화면마다 recv 상자를 다시 그리면 화살표 방향과 색이 곧 갈린다.
 */

// ── 보석 표기 ────────────────────────────────────────────────
/** 보석 아이콘 + 숫자 (시안 gm — 단위 글자 없음) */
export const Gem = ({ n, size = 'm', className = '' }) => {
  const px = size === 's' ? 'w-[14px] h-[14px]' : size === 'l' ? 'w-[20px] h-[20px]' : 'w-[17px] h-[17px]';
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`}>
      <img src={iconGem} alt="보석" draggable={false} className={`${px} shrink-0 object-contain select-none`} />
      {n}
    </span>
  );
};

// ── 시트 껍데기 ──────────────────────────────────────────────
/** 시안 .sheet — 폰 배경(#111)보다 밝아야 떠 보인다(시안 다크 §9) */
export const SHEET_SHELL = 'flex flex-col px-[20px] pt-[10px] pb-[20px] bg-layout-white dark:bg-[#1C1C1C]';

export const Grab = () => (
  <span className="w-[38px] h-[4px] mx-auto mb-[12px] rounded-full bg-layout-gray-100 dark:bg-[#3A3A3A]" />
);

// ── 버튼 ────────────────────────────────────────────────────
/** 시안 .btn — h48 · r10 · 15.5px 700. 보조가 왼쪽, 주 버튼이 오른쪽이다(shop-result §5) */
export const Btn = ({ tone = 'sec', onClick, disabled = false, wide = false, children }) => (
  <motion.button
    type="button"
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    whileTap={disabled ? undefined : { scale: 0.97 }}
    className={`${wide ? 'w-full' : 'flex-1'} h-[48px] rounded-[10px] flex items-center justify-center gap-[5px] text-[15.5px] font-[700] tracking-[-0.03em] ${
      tone === 'pri'
        ? 'bg-primary-main-600 text-layout-white'
        : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'
    } ${disabled ? 'opacity-40' : ''}`}
  >
    {children}
  </motion.button>
);

export const Btns = ({ children }) => <div className="flex gap-[10px] mt-[16px]">{children}</div>;

/** 주 버튼 안의 로딩 표시 — 글자만 바뀌고 버튼 자리는 그대로 */
export const BtnSpinner = () => (
  <span className="animate-spin rounded-full h-[20px] w-[20px] border-b-2 border-white" />
);

// ── 결제 요약 (시안 .recv) ───────────────────────────────────
/**
 * 화살표는 늘 "지금 → 산 뒤" 방향이다(§3).
 * 줄어드는 값은 주황(Down), 늘어나는 값은 초록(Up)으로 한 번만 칠한다.
 * 빨강을 쓰지 않는 건 보석이 줄어드는 게 오류가 아니라 정상이기 때문이다.
 */
export const RecvBox = ({ children }) => (
  <div className="mt-[14px] px-[14px] py-[12px] rounded-[12px] bg-[#FAFAFA] dark:bg-layout-gray-dark">
    {children}
  </div>
);

export const RecvRow = ({ k, tight = false, children }) => (
  <div className={`flex items-center gap-[8px] text-[12.5px] tracking-[-0.02em] ${tight ? '' : 'mt-[8px]'}`}>
    <span className="flex-1 font-[600] text-layout-gray-400 dark:text-layout-gray-300">{k}</span>
    <span className="flex items-center gap-[4px] font-[800] text-layout-black dark:text-layout-white">
      {children}
    </span>
  </div>
);

export const RecvHr = () => (
  <hr className="my-[10px] border-0 border-t border-[#EEEEEE] dark:border-white/[0.08]" />
);

export const Arrow = () => <span className="font-[700] text-layout-gray-200">→</span>;
export const Down = ({ children }) => <span className="text-secondary-yellow-600">{children}</span>;
export const Up = ({ children }) => <span className="text-status-success-600">{children}</span>;

// ── 안내 상자 (시안 .info) ───────────────────────────────────
export const Em = ({ children }) => (
  <b className="font-[700] text-layout-gray-500 dark:text-[#DDDDDD]">{children}</b>
);

export const EmBlue = ({ children }) => (
  <b className="font-[700] text-[#1849A9] dark:text-secondary-blue-300">{children}</b>
);

export const InfoBox = ({ tone = 'gray', icon, children }) => {
  const tint = {
    gray: 'bg-[#F7F7F7] dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-300',
    blue: 'bg-secondary-blue-100 dark:bg-secondary-blue-dark text-[#175CD3] dark:text-secondary-blue-400',
    warn: 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark text-[#B54708] dark:text-[#FDB022]',
  }[tone];
  return (
    <div className={`flex gap-[8px] mt-[12px] px-[11px] py-[10px] rounded-[10px] text-[11px] leading-[1.55] tracking-[-0.02em] ${tint}`}>
      <span className="shrink-0 mt-[1px]">{icon}</span>
      <span>{children}</span>
    </div>
  );
};

// ── 캡션 (시안 .hint) ────────────────────────────────────────
export const Hint = ({ center = false, className = '', children }) => (
  <p className={`text-[10.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-300 ${center ? 'text-center' : ''} ${className}`}>
    {children}
  </p>
);

export const HintB = ({ children }) => (
  <b className="font-[700] text-layout-gray-400 dark:text-layout-gray-200">{children}</b>
);

// ── 시트 머리 (시안 .shead) ──────────────────────────────────
export const SheetHead = ({ image, imageAlt = '', title, desc, right = null }) => (
  <div className="flex items-center gap-[12px]">
    {image && (
      <img src={image} alt={imageAlt} draggable={false} className="w-[62px] h-[62px] shrink-0 object-contain select-none" />
    )}
    <div className="flex-1 min-w-0">
      <div className="text-[17px] font-[800] tracking-[-0.04em] text-layout-black dark:text-layout-white">
        {title}
      </div>
      {desc && (
        <div className="mt-[3px] text-[12px] font-[500] leading-[1.5] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
          {desc}
        </div>
      )}
    </div>
    {right}
  </div>
);
