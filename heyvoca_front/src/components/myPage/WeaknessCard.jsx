import React, { useEffect, useState } from 'react';
import { ChartBar } from '@phosphor-icons/react';
import { getMyWeakness } from '@/api/study';
import { QUESTION_TYPE_LABELS, getRateColorClasses } from '@/utils/questionTypeLabels';

// 가로 막대 그래프 한 행
const BarRow = ({ label, rate, samples }) => {
  const colors = getRateColorClasses(rate);
  const pct = Math.round(rate * 100);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-layout-black dark:text-layout-white truncate max-w-[55%]">
          {label}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[13px] font-bold ${colors.text}`}>{pct}%</span>
          <span className="text-[11px] text-[#aaa] dark:text-gray-500">{samples}문항</span>
        </div>
      </div>
      <div className="w-full h-[6px] rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// 약점 강조 행 (집중 연습 추천 영역)
const WeaknessRow = ({ label, rate, samples }) => {
  const colors = getRateColorClasses(rate);
  const pct = Math.round(rate * 100);

  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${colors.bg} ${colors.border}`}>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-layout-black dark:text-layout-white">
          {label}
        </span>
        <span className="text-[11px] text-[#aaa] dark:text-gray-500">{samples}문항 기준</span>
      </div>
      <span className={`text-[18px] font-bold ${colors.text}`}>{pct}%</span>
    </div>
  );
};

const WeaknessCard = () => {
  "use memo";

  const [loading, setLoading] = useState(true);
  const [weakness, setWeakness] = useState([]);
  const [all, setAll] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      try {
        const res = await getMyWeakness(5);
        if (cancelled) return;
        if (res?.data) {
          setWeakness(res.data.weakness ?? []);
          setAll(res.data.all ?? []);
        }
      } catch {
        // 에러 시 빈 상태로 처리 (콘솔 warn은 API 함수에서)
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, []);

  // 로딩 중
  if (loading) {
    return (
      <div className="mx-4 my-3 px-4 py-5 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-border dark:border-border-dark">
        <div className="flex items-center gap-2 mb-4">
          <ChartBar weight="fill" className="text-[20px] text-primary-main-600" />
          <span className="text-[15px] font-bold text-layout-black dark:text-layout-white">학습 분석</span>
        </div>
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[52px] rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // 데이터 없음 (학습량 부족)
  if (weakness.length === 0 && all.length === 0) {
    return (
      <div className="mx-4 my-3 px-4 py-5 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-border dark:border-border-dark">
        <div className="flex items-center gap-2 mb-3">
          <ChartBar weight="fill" className="text-[20px] text-primary-main-600" />
          <span className="text-[15px] font-bold text-layout-black dark:text-layout-white">학습 분석</span>
        </div>
        <p className="text-[13px] text-[#aaa] dark:text-gray-500 leading-relaxed">
          학습 데이터가 쌓이면 약점 유형이 표시돼요.{'\n'}
          각 문제 유형을 10문항 이상 풀어보세요!
        </p>
      </div>
    );
  }

  return (
    <div className="mx-4 my-3 px-4 py-5 rounded-2xl bg-gray-50 dark:bg-gray-900/50 border border-border dark:border-border-dark">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-4">
        <ChartBar weight="fill" className="text-[20px] text-primary-main-600" />
        <span className="text-[15px] font-bold text-layout-black dark:text-layout-white">학습 분석</span>
      </div>

      {/* 약점 섹션 */}
      {weakness.length > 0 && (
        <div className="mb-4">
          <p className="text-[12px] font-semibold text-[#aaa] dark:text-gray-500 mb-2 uppercase tracking-wide">
            집중 연습 추천
          </p>
          <div className="flex flex-col gap-2">
            {weakness.map((item) => (
              <WeaknessRow
                key={item.question_type}
                label={QUESTION_TYPE_LABELS[item.question_type] ?? item.question_type}
                rate={item.correct_rate}
                samples={item.samples}
              />
            ))}
          </div>
          {weakness.length > 0 && (
            <p className="text-[12px] text-[#aaa] dark:text-gray-500 mt-2">
              이 유형을 좀 더 연습해 볼까요?
            </p>
          )}
        </div>
      )}

      {/* 구분선 */}
      {weakness.length > 0 && all.length > 0 && (
        <div className="border-t border-border dark:border-border-dark my-3" />
      )}

      {/* 전체 유형 섹션 */}
      {all.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold text-[#aaa] dark:text-gray-500 mb-3 uppercase tracking-wide">
            전체 유형
          </p>
          <div className="flex flex-col gap-3">
            {all
              .slice()
              .sort((a, b) => b.correct_rate - a.correct_rate)
              .map((item) => (
                <BarRow
                  key={item.question_type}
                  label={QUESTION_TYPE_LABELS[item.question_type] ?? item.question_type}
                  rate={item.correct_rate}
                  samples={item.samples}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WeaknessCard;
