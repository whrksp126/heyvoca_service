import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EggCrack, Leaf, Plant, Carrot, Circle, X, CaretDown, ArrowRight } from '@phosphor-icons/react';
import { getWordInsightsApi } from '../../api/study';
import { vibrate } from '../../utils/osFunction';

// 백엔드 memory state 키(unlearned/short/medium/long) 기준
const STATE_INFO = {
  unlearned: { name: '미학습',   Icon: EggCrack, color: '#9D835A' },
  short:     { name: '단기 암기', Icon: Leaf,     color: '#77CE4F' },
  medium:    { name: '중기 암기', Icon: Plant,    color: '#38CE38' },
  long:      { name: '장기 암기', Icon: Carrot,   color: '#F68300' },
};

const TEST_TYPE_LABELS = {
  quick: 'AI 추천',
  test: '테스트',
  exam: '시험 모드',
  today: '오늘의 학습',
};

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

/**
 * 단어 상세 '나의 기억' 섹션 — 최근 결과 + 승급 진행 + 학습 기록 펼치기.
 * (승인된 프로토타입 C안: 요약 기본 노출, 타임라인은 탭 시 펼침)
 */
const WordMemorySection = ({ userVocaId }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [insights, setInsights] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!userVocaId) return;
    let cancelled = false;
    (async () => {
      const res = await getWordInsightsApi(userVocaId);
      if (!cancelled && res?.code === 200) setInsights(res.data);
    })();
    return () => { cancelled = true; };
  }, [userVocaId]);

  // 학습 기록이 아예 없으면 섹션 자체를 렌더하지 않음
  if (!insights || insights.total_count === 0) return null;

  const { recent_results = [], streak = 0, next_stage, timeline = [], total_count } = insights;
  // API는 최신순 → 왼쪽=과거, 오른쪽=최신으로 뒤집어 표시
  const recentChips = [...recent_results].reverse();
  const nextInfo = next_stage ? STATE_INFO[next_stage.state] : null;

  return (
    <div className="flex flex-col gap-[12px] pt-[12px] border-t border-layout-gray-100 dark:border-layout-gray-dark">
      <h4 className="text-[14px] font-[700] text-layout-black dark:text-layout-white">나의 기억</h4>

      {/* 최근 결과 칩 + 연속 정답 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[8px]">
          <span className="text-[12px] font-[500] text-layout-gray-300">최근 결과</span>
          <div className="flex items-center gap-[4px]">
            {recentChips.map((ok, i) => (
              <span
                key={i}
                className={`
                  flex items-center justify-center w-[18px] h-[18px] rounded-full
                  ${ok
                    ? 'bg-status-success-100 text-status-success-600'
                    : 'bg-status-error-100 dark:bg-status-error-dark text-status-error-600'}
                `}
              >
                {ok ? <Circle size={9} weight="bold" /> : <X size={9} weight="bold" />}
              </span>
            ))}
          </div>
        </div>
        {streak > 0 && (
          <span className="text-[12px] font-[600] text-primary-main-600">연속 정답 {streak}회</span>
        )}
      </div>

      {/* 다음 단계 진행 카드 — 최고 단계(장기 암기)면 숨김 */}
      {nextInfo && (
        <div className="flex flex-col gap-[8px] p-[12px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-[5px]">
              <nextInfo.Icon size={14} weight="fill" color={nextInfo.color} />
              <span className="text-[12px] font-[700] text-layout-black dark:text-layout-white">
                {nextInfo.name}까지
              </span>
            </div>
            <span className="text-[11px] font-[500] text-layout-gray-300">
              기억 안정도 {insights.memory?.stability ?? 0}일 / {next_stage.threshold_days}일
            </span>
          </div>
          <div className="relative w-full h-[6px] rounded-[6px] bg-layout-gray-100 dark:bg-layout-black overflow-hidden">
            <motion.div
              className="absolute left-0 top-0 h-full rounded-[6px]"
              style={{ backgroundColor: nextInfo.color }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.round((next_stage.progress ?? 0) * 100)}%` }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            />
          </div>
        </div>
      )}

      {/* 학습 기록 펼치기 */}
      <button
        type="button"
        className="flex items-center justify-center gap-[4px] py-[4px]"
        onClick={() => {
          vibrate({ duration: 5 });
          setExpanded(prev => !prev);
        }}
      >
        <span className="text-[12px] font-[600] text-layout-gray-300">
          학습 기록 {total_count}개 {expanded ? '접기' : '모두 보기'}
        </span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex text-layout-gray-300"
        >
          <CaretDown size={12} weight="bold" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-[10px] max-h-[220px] overflow-y-auto pr-[4px]">
              {timeline.map((entry, i) => {
                const change = entry.state_change;
                const fromInfo = change ? STATE_INFO[change.from] : null;
                const toInfo = change ? STATE_INFO[change.to] : null;
                const isPromotion = change && fromInfo && toInfo
                  && ['unlearned', 'short', 'medium', 'long'].indexOf(change.to)
                     > ['unlearned', 'short', 'medium', 'long'].indexOf(change.from);
                return (
                  <div key={i} className="flex gap-[8px]">
                    <div className="flex flex-col items-center pt-[5px]">
                      <span
                        className={`
                          w-[7px] h-[7px] rounded-full flex-shrink-0
                          ${entry.was_correct ? 'bg-status-success-500' : 'bg-status-error-500'}
                        `}
                      />
                      {i < timeline.length - 1 && (
                        <span className="flex-1 w-[1px] mt-[3px] bg-layout-gray-100 dark:bg-layout-gray-dark" />
                      )}
                    </div>
                    <div className="flex flex-col gap-[2px] pb-[2px]">
                      <span className="text-[12px] font-[500] text-layout-black dark:text-layout-white">
                        {formatDate(entry.created_at)}
                        <span className="text-layout-gray-300"> · {TEST_TYPE_LABELS[entry.test_type] ?? entry.test_type} · </span>
                        <span className={entry.was_correct ? 'text-status-success-600' : 'text-status-error-600'}>
                          {entry.was_correct ? '정답' : '오답'}
                        </span>
                      </span>
                      {change && fromInfo && toInfo && (
                        <span className="flex items-center gap-[4px] text-[11px] font-[500] text-layout-gray-300">
                          <fromInfo.Icon size={11} weight="fill" color={fromInfo.color} />
                          <ArrowRight size={9} weight="bold" />
                          <toInfo.Icon size={11} weight="fill" color={toInfo.color} />
                          <span>{toInfo.name} {isPromotion ? '승급' : '강등'}</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WordMemorySection;
