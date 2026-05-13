// src/components/admin/AdminTabs.jsx
// 어드민 대시보드 상단 탭 헤더.
import React from 'react';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'voca-books', label: '단어장 관리' },
];

const AdminTabs = ({ activeTab, onChange }) => {
  "use memo";
  return (
    <nav className="border-b border-gray-800 bg-gray-950/90 backdrop-blur sticky top-[57px] z-10">
      <div className="max-w-6xl mx-auto px-6 flex gap-1">
        {TABS.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={
                'px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] ' +
                (active
                  ? 'text-white border-blue-500'
                  : 'text-gray-500 hover:text-gray-300 border-transparent')
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default AdminTabs;
