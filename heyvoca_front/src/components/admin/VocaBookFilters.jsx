// src/components/admin/VocaBookFilters.jsx
// 단어장 목록 상단 필터/검색/정렬 바.
import React from 'react';

const SOURCE_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'AI 생성', label: 'AI 생성' },
  { value: '직접 제작', label: '직접 제작' },
];

const SORT_OPTIONS = [
  { value: 'updated_at', label: '최신순 (갱신일)' },
  { value: 'id', label: 'ID 내림차순' },
];

const VocaBookFilters = ({ source, q, sort, sourceCounts, onChange }) => {
  "use memo";
  const labelFor = (opt) => {
    if (opt.value === 'all') {
      const total = Object.values(sourceCounts || {}).reduce((a, b) => a + b, 0);
      return total ? `전체 (${total})` : '전체';
    }
    const cnt = sourceCounts?.[opt.value];
    return cnt !== undefined ? `${opt.label} (${cnt})` : opt.label;
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={source}
        onChange={(e) => onChange({ source: e.target.value })}
        className="bg-gray-900 border border-gray-700 text-sm text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
      >
        {SOURCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{labelFor(opt)}</option>
        ))}
      </select>

      <input
        type="text"
        placeholder="단어장 이름 검색"
        value={q}
        onChange={(e) => onChange({ q: e.target.value })}
        className="bg-gray-900 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:border-blue-500"
      />

      <select
        value={sort}
        onChange={(e) => onChange({ sort: e.target.value })}
        className="bg-gray-900 border border-gray-700 text-sm text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
      >
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
};

export default VocaBookFilters;
