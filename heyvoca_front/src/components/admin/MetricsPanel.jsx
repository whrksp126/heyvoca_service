// src/components/admin/MetricsPanel.jsx
import React from 'react';

/**
 * 단순 분포 막대 차트 (텍스트 기반)
 * @param {{ label: string, items: { name: string, count: number }[] }} props
 */
const DistributionBar = ({ label, items = [] }) => {
  const total = items.reduce((s, i) => s + (i.count ?? 0), 0);
  if (!total) return null;

  return (
    <div className="mb-5">
      <p className="text-gray-400 text-xs font-medium mb-2">{label}</p>
      <div className="space-y-2">
        {items.map((item) => {
          const pct = total ? Math.round((item.count / total) * 100) : 0;
          return (
            <div key={item.name}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-gray-300 text-xs">{item.name}</span>
                <span className="text-gray-400 text-xs">{item.count.toLocaleString()} ({pct}%)</span>
              </div>
              <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * /admin/study/metrics 응답 시각화 패널
 * @param {{ data: object, days: number }} props
 */
const MetricsPanel = ({ data, days = 7 }) => {
  "use memo";

  if (!data) {
    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
        <p className="text-gray-500 text-sm">학습 지표 데이터를 불러오는 중...</p>
      </div>
    );
  }

  // 응답 구조를 유연하게 처리
  const questionDist = (() => {
    const raw = data.question_type_distribution ?? data.question_types ?? {};
    return Object.entries(raw).map(([name, count]) => ({ name, count: Number(count) }));
  })();

  const testTypeDist = (() => {
    const raw = data.test_type_distribution ?? data.test_types ?? {};
    return Object.entries(raw).map(([name, count]) => ({ name, count: Number(count) }));
  })();

  const fsrsStateDist = (() => {
    const raw = data.fsrs_state_distribution ?? data.fsrs_states ?? {};
    return Object.entries(raw).map(([name, count]) => ({ name, count: Number(count) }));
  })();

  const totalReviews = data.total_reviews ?? data.total_logs ?? 0;
  const avgScore = data.avg_score ?? data.average_score ?? null;
  const uniqueUsers = data.unique_users ?? data.active_users ?? 0;

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
      <h2 className="text-white font-semibold mb-4">학습 지표 (최근 {days}일)</h2>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">총 복습</p>
          <p className="text-white font-bold">{Number(totalReviews).toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">유저 수</p>
          <p className="text-white font-bold">{Number(uniqueUsers).toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">평균 점수</p>
          <p className="text-white font-bold">{avgScore !== null ? Number(avgScore).toFixed(2) : '-'}</p>
        </div>
      </div>

      {questionDist.length > 0 && (
        <DistributionBar label="질문 유형 분포" items={questionDist} />
      )}
      {testTypeDist.length > 0 && (
        <DistributionBar label="테스트 유형 분포" items={testTypeDist} />
      )}
      {fsrsStateDist.length > 0 && (
        <DistributionBar label="FSRS 상태 분포" items={fsrsStateDist} />
      )}

      {questionDist.length === 0 && testTypeDist.length === 0 && fsrsStateDist.length === 0 && (
        <p className="text-gray-500 text-sm">분포 데이터가 없습니다.</p>
      )}
    </div>
  );
};

export default MetricsPanel;
