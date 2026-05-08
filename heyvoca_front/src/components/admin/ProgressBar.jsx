// src/components/admin/ProgressBar.jsx
import React from 'react';

/**
 * 진행률 게이지 컴포넌트
 * @param {{ percent: number, met: boolean, label: string }} props
 */
const ProgressBar = ({ percent = 0, met = false, label = '' }) => {
  "use memo";

  const safePercent = Math.min(100, Math.max(0, isNaN(percent) ? 0 : percent));

  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">{label}</span>
          <span className={`text-xs font-semibold ${met ? 'text-green-400' : 'text-gray-300'}`}>
            {met ? '달성' : `${Math.round(safePercent)}%`}
          </span>
        </div>
      )}
      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${met ? 'bg-green-500' : 'bg-gray-500'}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;
