// src/components/admin/HealthPanel.jsx
import React from 'react';

/**
 * 수치 행 하나
 */
const StatRow = ({ label, value, highlight = false }) => (
  <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
    <span className="text-gray-400 text-sm">{label}</span>
    <span className={`text-sm font-semibold ${highlight ? 'text-yellow-400' : 'text-white'}`}>
      {value ?? '-'}
    </span>
  </div>
);

/**
 * 파티션별 row 수 테이블
 */
const PartitionTable = ({ partitions = {} }) => {
  const entries = Object.entries(partitions);
  if (!entries.length) return null;

  return (
    <div className="mt-4">
      <p className="text-gray-400 text-xs font-medium mb-2">파티션별 Row 수</p>
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left text-gray-400 font-medium px-3 py-2">파티션</th>
              <th className="text-right text-gray-400 font-medium px-3 py-2">행 수</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, count]) => (
              <tr key={name} className="border-b border-gray-700/50 last:border-0">
                <td className="text-gray-300 px-3 py-2 font-mono text-xs">{name}</td>
                <td className="text-white text-right px-3 py-2">{Number(count).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/**
 * /admin/fsrs/health 응답 시각화 패널
 * @param {{ data: object }} props
 */
const HealthPanel = ({ data }) => {
  "use memo";

  if (!data) {
    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
        <p className="text-gray-500 text-sm">FSRS 헬스 데이터를 불러오는 중...</p>
      </div>
    );
  }

  // 응답 구조 유연하게 처리
  const lapseRate   = data.lapse_rate ?? data.lapses_rate ?? null;
  const avgStability = data.avg_stability ?? data.average_stability ?? null;
  const avgDifficulty = data.avg_difficulty ?? data.average_difficulty ?? null;
  const avgRetrievability = data.avg_retrievability ?? data.average_retrievability ?? null;
  const totalCards  = data.total_cards ?? data.total_user_vocas ?? 0;
  const newCards    = data.new_cards ?? data.new_count ?? 0;
  const learningCards = data.learning_cards ?? data.learning_count ?? 0;
  const reviewCards = data.review_cards ?? data.review_count ?? 0;
  const relearningCards = data.relearning_cards ?? data.relearning_count ?? 0;
  const partitions  = data.partitions ?? data.partition_rows ?? {};

  const pct = (v) => (v !== null && v !== undefined ? `${(Number(v) * 100).toFixed(1)}%` : '-');
  const num = (v, dec = 2) => (v !== null && v !== undefined ? Number(v).toFixed(dec) : '-');

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
      <h2 className="text-white font-semibold mb-4">FSRS 헬스체크</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">전체 카드</p>
          <p className="text-white font-bold">{Number(totalCards).toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">신규</p>
          <p className="text-blue-400 font-bold">{Number(newCards).toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">학습 중</p>
          <p className="text-yellow-400 font-bold">{Number(learningCards).toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <p className="text-gray-400 text-xs mb-1">복습</p>
          <p className="text-green-400 font-bold">{Number(reviewCards).toLocaleString()}</p>
        </div>
      </div>

      {relearningCards > 0 && (
        <div className="bg-gray-800 rounded-xl p-3 text-center mb-4">
          <p className="text-gray-400 text-xs mb-1">재학습</p>
          <p className="text-red-400 font-bold">{Number(relearningCards).toLocaleString()}</p>
        </div>
      )}

      <div className="border-t border-gray-800 pt-4">
        <StatRow
          label="Lapse Rate (망각률)"
          value={pct(lapseRate)}
          highlight={lapseRate !== null && Number(lapseRate) > 0.2}
        />
        <StatRow label="평균 Stability" value={num(avgStability)} />
        <StatRow label="평균 Difficulty" value={num(avgDifficulty)} />
        <StatRow label="평균 Retrievability" value={pct(avgRetrievability)} />
      </div>

      <PartitionTable partitions={partitions} />
    </div>
  );
};

export default HealthPanel;
