import React from 'react';

const ProgressBar = ({ value = 0, total = 0, label = '' }) => {
  "use memo";
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeValue = Math.min(safeTotal, Math.max(0, Number(value) || 0));
  const percent = safeTotal > 0 ? Math.round((safeValue / safeTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-[8px] w-full">
      {(label || safeTotal > 0) && (
        <div className="flex items-center justify-between text-[12px] text-layout-gray-400">
          <span className="truncate">{label}</span>
          {safeTotal > 0 && (
            <span className="shrink-0">
              {safeValue} / {safeTotal} ({percent}%)
            </span>
          )}
        </div>
      )}
      <div className="w-full h-[6px] rounded-full bg-layout-gray-100 overflow-hidden">
        <div
          className="h-full bg-primary-main-600 transition-all duration-200 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
