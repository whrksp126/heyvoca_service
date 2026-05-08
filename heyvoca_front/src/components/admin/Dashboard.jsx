// src/components/admin/Dashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { fetchProgress, fetchMetrics, fetchHealth } from '@/api/admin';
import SummaryCards from './SummaryCards';
import PhaseCard from './PhaseCard';
import MetricsPanel from './MetricsPanel';
import HealthPanel from './HealthPanel';

const STORAGE_KEY = 'heyvoca_admin_token';
const REFRESH_INTERVAL_MS = 30_000;

/**
 * 메인 어드민 대시보드.
 * 마운트 시 3개 엔드포인트를 병렬로 호출하고, 30초마다 자동 새로고침.
 *
 * @param {{ token: string, onLogout: () => void }} props
 */
const Dashboard = ({ token, onLogout }) => {
  "use memo";

  const [progress, setProgress] = useState(null);
  const [metrics, setMetrics]   = useState(null);
  const [health, setHealth]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [pRes, mRes, hRes] = await Promise.allSettled([
        fetchProgress(token),
        fetchMetrics(token, 7),
        fetchHealth(token),
      ]);

      // 401이면 토큰 만료 처리
      for (const res of [pRes, mRes, hRes]) {
        if (res.status === 'rejected' && res.reason?.status === 401) {
          localStorage.removeItem(STORAGE_KEY);
          onLogout();
          return;
        }
      }

      if (pRes.status === 'fulfilled') setProgress(pRes.value?.data ?? pRes.value);
      if (mRes.status === 'fulfilled') setMetrics(mRes.value?.data ?? mRes.value);
      if (hRes.status === 'fulfilled') setHealth(hRes.value?.data ?? hRes.value);

      setLastUpdated(new Date());
    } catch (err) {
      setError(`데이터 로드 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  // 초기 로드 + 30초 자동 새로고침
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const handleManualRefresh = () => {
    setLoading(true);
    load();
  };

  const phases = progress?.phases ?? [];
  const summary = progress?.summary ?? {};

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 bg-gray-950/90 backdrop-blur border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">heyvoca Admin</h1>
            {lastUpdated && (
              <p className="text-gray-500 text-xs mt-0.5">
                마지막 갱신: {lastUpdated.toLocaleTimeString('ko-KR')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleManualRefresh}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 transition-colors"
            >
              {loading ? '로딩 중...' : '새로고침'}
            </button>
            <button
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                onLogout();
              }}
              className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-300 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* 본문 */}
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {error && (
          <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* 요약 카드 */}
        <section>
          <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wide mb-3">
            Overview
          </h2>
          <SummaryCards summary={summary} />
        </section>

        {/* Phase 카드 목록 */}
        {phases.length > 0 && (
          <section>
            <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wide mb-3">
              개발 로드맵 진행 현황
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {phases.map((phase) => (
                <PhaseCard key={phase.id} phase={phase} />
              ))}
            </div>
          </section>
        )}

        {/* 학습 지표 + FSRS 헬스 */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MetricsPanel data={metrics} days={7} />
          <HealthPanel data={health} />
        </section>

        {/* 하단 안내 */}
        <div className="text-center text-gray-700 text-xs pb-8">
          30초마다 자동 새로고침됩니다. 이 페이지는 운영자 전용이며 메뉴에 노출되지 않습니다.
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
