// src/components/admin/SummaryCards.jsx
import React from 'react';

const Card = ({ title, value, sub }) => (
  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
    <p className="text-gray-400 text-xs mb-1">{title}</p>
    <p className="text-white text-2xl font-bold">{value ?? '-'}</p>
    {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
  </div>
);

/**
 * 상단 요약 카드 3개
 * @param {{ summary: object }} props
 */
const SummaryCards = ({ summary = {} }) => {
  "use memo";

  const {
    total_logs = 0,
    total_sessions = 0,
    active_users_30d = 0,
  } = summary;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card title="전체 학습 로그" value={total_logs.toLocaleString()} sub="누적 복습 기록 수" />
      <Card title="전체 세션" value={total_sessions.toLocaleString()} sub="누적 학습 세션 수" />
      <Card title="활성 유저 (30일)" value={active_users_30d.toLocaleString()} sub="최근 30일 내 학습한 유저" />
    </div>
  );
};

export default SummaryCards;
