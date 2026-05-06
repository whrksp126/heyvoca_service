import React, { useEffect, useRef, useState } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';

// AddWordNewBottomSheet의 단어장 셀렉트와 동일한 시각 스타일.
// options 항목에 preview가 하나라도 있으면 커스텀 드롭다운으로 동작 — 키와 샘플 값을
// 다른 폰트(monospace)로 함께 보여줘 사용자 인식을 돕는다.
const CustomSelect = ({
  value,
  onChange,
  options = [],
  disabled = false,
  placeholder = '선택',
  size = 'md',
  className = '',
  hasError = false,
}) => {
  "use memo";

  const heightClass = size === 'sm' ? 'h-[36px]' : 'h-[45px]';
  const paddingClass = size === 'sm' ? 'px-[12px]' : 'px-[15px]';
  const fontClass = size === 'sm' ? 'text-[13px]' : 'text-[14px]';

  const borderClass = hasError
    ? 'border-red-500'
    : disabled
    ? 'border-layout-gray-200'
    : 'border-layout-gray-200 focus:border-primary-main-600';
  const bgClass = disabled
    ? 'bg-layout-gray-50 text-[#999999]'
    : 'bg-layout-white dark:bg-layout-black text-layout-black dark:text-layout-white';

  const hasPreview = options.some((o) => o && o.preview);

  // ── 네이티브 모드 ──
  if (!hasPreview) {
    return (
      <div className={`relative ${className}`}>
        <select
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange?.(e.target.value)}
          className={`
            w-full ${heightClass} ${paddingClass}
            border-[1px] rounded-[8px]
            font-[400] ${fontClass}
            outline-none transition-colors
            appearance-none pr-[36px]
            ${borderClass} ${bgClass}
          `}
        >
          {placeholder !== null && placeholder !== undefined && (
            <option value="">{placeholder}</option>
          )}
          {options.map((opt) => (
            <option key={String(opt.value)} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-[12px] top-1/2 -translate-y-1/2 pointer-events-none text-layout-gray-200 text-[18px]">
          <CaretDown />
        </div>
      </div>
    );
  }

  // ── 커스텀 드롭다운 모드 (preview 있음) ──
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find((o) => String(o.value) === String(value));
  const placeholderActive = placeholder !== null && placeholder !== undefined;

  const handlePick = (v) => {
    onChange?.(v);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((p) => !p)}
        className={`
          w-full ${heightClass} ${paddingClass}
          border-[1px] rounded-[8px]
          font-[400] ${fontClass}
          outline-none transition-colors
          appearance-none pr-[36px]
          flex items-center justify-start text-left
          ${borderClass} ${bgClass}
        `}
      >
        {selected ? (
          <span className="flex items-baseline gap-[8px] truncate">
            <span className="font-[600] text-layout-black dark:text-layout-white shrink-0">{selected.label}</span>
            {selected.preview && (
              <span className="font-mono text-[12px] text-layout-gray-400 truncate">{selected.preview}</span>
            )}
          </span>
        ) : (
          <span className="text-[#999999]">{placeholder || ''}</span>
        )}
      </button>
      <div className="absolute right-[12px] top-1/2 -translate-y-1/2 pointer-events-none text-layout-gray-200 text-[18px]">
        <CaretDown />
      </div>

      {open && (
        <div
          className="
            absolute z-30 left-0 right-0 mt-[4px]
            max-h-[260px] overflow-y-auto
            border-[1px] border-layout-gray-200 rounded-[8px]
            bg-layout-white dark:bg-layout-black
            shadow-[0_4px_16px_rgba(0,0,0,0.08)]
          "
        >
          {placeholderActive && (
            <button
              type="button"
              onClick={() => handlePick('')}
              className={`
                w-full px-[15px] py-[10px] text-left
                flex items-center justify-between gap-[8px]
                hover:bg-primary-main-100
                ${(!value || value === '') ? 'bg-primary-main-100' : ''}
              `}
            >
              <span className="text-[14px] text-[#999999]">{placeholder}</span>
              {(!value || value === '') && (
                <Check size={14} weight="bold" className="text-primary-main-600 shrink-0" />
              )}
            </button>
          )}
          {options.map((opt) => {
            const active = String(opt.value) === String(value);
            return (
              <button
                type="button"
                key={String(opt.value)}
                onClick={() => handlePick(opt.value)}
                className={`
                  w-full px-[15px] py-[10px] text-left
                  flex items-center justify-between gap-[8px]
                  hover:bg-primary-main-100
                  ${active ? 'bg-primary-main-100' : ''}
                `}
              >
                <span className="flex items-baseline gap-[8px] min-w-0">
                  <span className="text-[14px] font-[600] text-layout-black dark:text-layout-white shrink-0">{opt.label}</span>
                  {opt.preview && (
                    <span className="font-mono text-[12px] text-layout-gray-400 truncate">{opt.preview}</span>
                  )}
                </span>
                {active && (
                  <Check size={14} weight="bold" className="text-primary-main-600 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
