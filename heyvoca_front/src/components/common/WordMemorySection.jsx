import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { EggCrack, Leaf, Plant, Carrot, Circle, X, Timer, CircleNotch } from '@phosphor-icons/react';
import { getWordInsightsApi, getWordTimelineApi } from '../../api/study';

// 백엔드 memory state 키(unlearned/short/medium/long) 기준
// color=상단 라벨의 border/text(강조), bg=상단 라벨의 배경 틴트(프로그래스 채움색)
const STATE_INFO = {
  unlearned: { name: '미학습',   Icon: EggCrack, color: '#9D835A', bg: '#FFFCF3' },
  short:     { name: '단기 암기', Icon: Leaf,     color: '#77CE4F', bg: '#F2FFEB' },
  medium:    { name: '중기 암기', Icon: Plant,    color: '#38CE38', bg: '#EBFFEE' },
  long:      { name: '장기 암기', Icon: Carrot,   color: '#F68300', bg: '#FFF8E8' },
};

// 암기 생애주기 순서: 씨앗 → 새싹 → 잎 → 당근
const STATE_ORDER = ['unlearned', 'short', 'medium', 'long'];

// 백엔드 created_at은 timezone 없는 UTC — 로컬 표시를 위해 Z 보정
const parseUtc = (iso) => {
  if (!iso) return null;
  const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDate = (iso) => {
  const d = parseUtc(iso);
  if (!d) return '';
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// next_review(YYYY-MM-DD 또는 ISO) → 상대일 텍스트만 ("N일 후" / "오늘" / "N일 지남")
const formatReviewDue = (iso) => {
  if (!iso) return null;
  let d;
  if (typeof iso === 'string' && iso.includes('-') && !iso.includes('T')) {
    const [y, m, day] = iso.split('-');
    d = new Date(Number(y), Number(m) - 1, Number(day));
  } else {
    d = parseUtc(iso) ?? new Date(iso);
  }
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: `${-diff}일 지남`, overdue: true };
  if (diff === 0) return { text: '오늘', overdue: false };
  return { text: `${diff}일 후`, overdue: false };
};

/**
 * 단어 상세 '나의 기억' insights 로더 — 진행/기록 컴포넌트가 공유.
 * 학습 기록이 없으면 null 반환.
 */
export const useWordInsights = (userVocaId) => {
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    if (!userVocaId) return;
    let cancelled = false;
    (async () => {
      const res = await getWordInsightsApi(userVocaId);
      if (!cancelled && res?.code === 200) setInsights(res.data);
    })();
    return () => { cancelled = true; };
  }, [userVocaId]);

  return insights;
};

/**
 * 암기 진행 — 복습 예정일 + [다음단계까지 · 기억 안정도] / [현재 아이콘 — 프로그래스 — 다음 아이콘]
 * (예문 아래에 표시)
 */
export const WordMemoryProgress = ({ insights }) => {
  "use memo";
  if (!insights || insights.total_count === 0) return null;

  const { next_stage } = insights;
  const review = formatReviewDue(insights.memory?.next_review);

  const currentKey = insights.memory?.state ?? 'unlearned';
  const nextPercent = Math.round((next_stage?.progress ?? 0) * 100);
  const onCorrect = next_stage?.on_correct ?? null;
  const gainPercent = Math.round((onCorrect?.gain ?? 0) * 100);

  // 생애주기 프로그래스: 현재 인덱스 + 강조(크게)할 다음 노드
  const curIdx = Math.max(0, STATE_ORDER.indexOf(currentKey));
  const bigIdx = next_stage ? curIdx + 1 : curIdx; // 다음(없으면 최고 단계=당근)

  return (
    <div className="flex flex-col gap-[10px] pt-[12px] border-t border-layout-gray-100 dark:border-layout-gray-dark">
      {/* 상단: 다음 복습(좌) + 정답 시 예측(우, 승급이면 '성장' / 아니면 '+N%') */}
      {(review || (onCorrect && (onCorrect.promotes || gainPercent >= 1))) && (
        <div className="flex items-center justify-between">
          {review ? (
            <span className="flex items-center gap-[6px]">
              <span className={`flex items-center justify-center w-[16px] h-[16px] rounded-full ${review.overdue ? 'bg-status-error-500' : 'bg-layout-gray-200 dark:bg-layout-gray-dark'}`}>
                <Timer size={10} weight="fill" className="text-layout-white" />
              </span>
              <span className={`text-[13px] font-[600] ${review.overdue ? 'text-status-error-600' : 'text-layout-black dark:text-layout-white'}`}>
                {review.text} 복습
              </span>
            </span>
          ) : <span />}
          {onCorrect && (onCorrect.promotes || gainPercent >= 1) && (
            <span className="text-[12px] font-[600] text-layout-gray-400 dark:text-layout-gray-200">
              복습 시 <strong className={`font-[700] ${onCorrect.promotes ? 'text-status-success-600' : 'text-primary-main-600'}`}>{onCorrect.promotes ? '성장' : `+${gainPercent}%`}</strong>
            </span>
          )}
        </div>
      )}

      {/* 생애주기 프로그래스 — 호리병 스타일(둥근 bulb + 얇은 neck), 구간별로 해당 상태 색 */}
      <div className="flex items-center pt-[2px]">
        {STATE_ORDER.map((key, i) => {
          const info = STATE_INFO[key];
          const isBig = i === bigIdx;                 // 다음 노드만 크게
          return (
            <React.Fragment key={key}>
              {i > 0 && (() => {
                const seg = i - 1;                    // bulb(i-1) ↔ bulb(i) 사이 구간
                const fillW = seg < curIdx ? 100 : seg === curIdx ? nextPercent : 0;
                const fromInfo = STATE_INFO[STATE_ORDER[seg]]; // 시작 노드
                const toInfo = info;                           // 끝 노드(=bulb i)
                const isCurSeg = next_stage && seg === curIdx;
                // 트랙=틴트 그라데이션, 채움=강조색 그라데이션 (둘 다 구간 시작→끝 기준)
                const trackGrad = `linear-gradient(to right, ${fromInfo.bg}, ${toInfo.bg})`;
                const fillGrad = `linear-gradient(to right, ${fromInfo.color}, ${toInfo.color})`;
                return (
                  <div className="relative flex-1 mx-[3px]">
                    {/* 연결선(neck) */}
                    <div className="relative h-[4px] rounded-[50px] overflow-hidden" style={{ background: trackGrad }}>
                      {/* 채움: 클립(폭=fillW%) + 내부 그라데이션(구간 전체폭 고정)으로 위치 기반 그라데이션 유지 */}
                      {fillW > 0 && (
                        <motion.div
                          className="absolute inset-y-0 left-0 overflow-hidden"
                          initial={{ width: 0 }}
                          animate={{ width: `${fillW}%` }}
                          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                        >
                          <div className="h-full" style={{ width: `${10000 / fillW}%`, background: fillGrad }} />
                        </motion.div>
                      )}
                    </div>
                    {/* 현재 → 다음 진행률 % (해당 구간 아래) */}
                    {isCurSeg && (
                      <span className="absolute top-full mt-[4px] left-1/2 -translate-x-1/2 text-[10px] font-[700] text-[#7b7b7b] whitespace-nowrap">
                        {nextPercent}%
                      </span>
                    )}
                  </div>
                );
              })()}
              {/* 노드: 달성한 단계만 테두리(링). 미달성은 테두리 없이 아이콘만 */}
              {(() => {
                const isAchieved = i <= curIdx; // 현재 단계까지 달성
                return (
                  <div
                    className="flex items-center justify-center flex-shrink-0 rounded-full bg-layout-white dark:bg-layout-black"
                    style={{
                      width: isBig ? 38 : 30,
                      height: isBig ? 38 : 30,
                      border: isAchieved ? `${isBig ? 2.5 : 2}px solid ${info.color}` : 'none',
                    }}
                  >
                    <info.Icon size={isBig ? 22 : 14} weight="fill" color={info.color} />
                  </div>
                );
              })()}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

/**
 * 학습 기록 — 헤더(연속 정답 n회) + [날짜 좌 / 기록 우] 그룹 목록 + 무한 스크롤.
 * 최근 기록부터 세팅하고, 하단 센티넬이 보이면 과거 기록을 페이지 단위로 추가 로드.
 * 각 기록 = [정답=초록 동그라미 / 오답=빨간 X] [채점 직후 암기 상태 아이콘]. (예문 아래에 표시)
 */
export const WordMemoryHistory = ({ insights, userVocaId }) => {
  "use memo";
  const streak = insights?.streak ?? 0;
  const totalCount = insights?.total_count ?? 0;

  const [entries, setEntries] = useState(() => insights?.timeline ?? []);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false); // 동시/중복 로드 방지

  // insights(단어) 변경 시 최근 페이지로 리셋
  useEffect(() => {
    const t = insights?.timeline ?? [];
    setEntries(t);
    setCursor(t.length ? t[t.length - 1].created_at : null);
    setHasMore((insights?.total_count ?? 0) > t.length);
  }, [insights]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !userVocaId || !cursor) return;
    loadingRef.current = true;
    setLoading(true);
    const res = await getWordTimelineApi(userVocaId, cursor, 20);
    if (res?.code === 200) {
      const more = res.data?.timeline ?? [];
      setEntries((prev) => [...prev, ...more]);
      setCursor(res.data?.next_before ?? null);
      setHasMore(Boolean(res.data?.has_more));
    } else {
      setHasMore(false);
    }
    setLoading(false);
    loadingRef.current = false;
  }, [hasMore, userVocaId, cursor]);

  // 센티넬이 뷰포트에 들어오면 다음 페이지 로드 (200px 선반영)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((obs) => {
      if (obs[0]?.isIntersecting) loadMore();
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore]);

  if (!insights || totalCount === 0) return null;

  // 일자별로 묶기 (누적 entries 기준 — 페이지 경계 같은 날짜도 자동 병합)
  const groups = [];
  const byDate = new Map();
  entries.forEach((entry) => {
    const d = formatDate(entry.created_at);
    if (!byDate.has(d)) { byDate.set(d, []); groups.push(d); }
    byDate.get(d).push(entry);
  });

  // 최근부터 연속 정답(스트릭)에 해당하는 기록 = entries의 앞쪽 streak개
  const streakSet = streak > 0 ? new Set(entries.slice(0, streak)) : null;

  return (
    <div className="flex flex-col gap-[12px] pt-[12px]">
      {/* [날짜 좌 / 기록 우] 그룹 — 내부 스크롤 없음(시트 전역 스크롤) */}
      <div className="flex flex-col gap-[14px]">
        {groups.map((date, gi) => (
          <div key={date} className="flex items-start gap-[10px]">
            {/* 날짜 (그룹당 1회, 좌측 고정) */}
            <span className="shrink-0 w-[38px] pt-[4px] text-[12px] font-[700] text-layout-gray-400 dark:text-layout-gray-200">{date}</span>
            {/* 기록 (우측, 넘치면 줄바꿈). 각 기록 = [채점 결과][채점 직후 암기 상태] */}
            <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[8px] flex-1 min-w-0">
              {byDate.get(date).map((entry, i) => {
                const stInfo = STATE_INFO[entry.state] ?? STATE_INFO.unlearned;
                // 가장 최근 기록(첫 그룹의 첫 항목) 왼쪽에 현재 연속 정답 수 표시
                const isLatest = gi === 0 && i === 0;
                // 스트릭(최근 연속 정답)에 해당하는 기록은 포인트 배경
                const inStreak = streakSet?.has(entry);
                return (
                  <React.Fragment key={i}>
                    {isLatest && streak > 0 && (
                      <span className="text-[11px] font-[600] text-layout-gray-400 dark:text-layout-gray-200">
                        연속 정답 {streak}회
                      </span>
                    )}
                    <div className={`flex items-center gap-[4px] pl-[6px] pr-[7px] py-[3px] rounded-full ${inStreak ? 'bg-primary-main-50 dark:bg-primary-main-dark' : 'bg-layout-gray-50 dark:bg-layout-gray-dark'}`}>
                      {/* 정답=초록 동그라미 / 오답=빨간 X */}
                      {entry.was_correct
                        ? <Circle size={13} weight="bold" className="text-status-success-500 flex-shrink-0" />
                        : <X size={13} weight="bold" className="text-status-error-500 flex-shrink-0" />}
                      {/* 채점 직후 암기 상태 아이콘 (최상단 라벨처럼 작게) */}
                      <stInfo.Icon size={11} weight="fill" color={stInfo.color} className="flex-shrink-0" />
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ))}

        {/* 무한 스크롤 센티넬 + 로딩 스피너 */}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-[6px]">
            {loading && <CircleNotch size={16} className="text-layout-gray-300 animate-spin" />}
          </div>
        )}
      </div>
    </div>
  );
};
