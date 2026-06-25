import React, { useEffect, useRef, useState } from 'react';
import { CaretLeft, EggCrack, Leaf, Plant, Carrot, WarningCircle } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { getReviewScheduleApi } from '../../api/study';
import { vibrate } from '../../utils/osFunction';
import ReviewScheduleCalendar from '../myPage/ReviewScheduleCalendar';

/**
 * 암기 상태 정의.
 * iconColor: 아이콘에만 적용되는 캐노니컬 hex.
 * Tailwind 클래스는 DOM 요소에만 사용.
 * "신규" 라벨은 UI상 "미학습"으로 표기 (데이터 키 distribution.new 는 그대로).
 */
const STATES = [
  {
    key: 'new',
    label: '미학습',
    icon: EggCrack,
    iconColor: '#9D835A',
    iconClass: 'text-[#9D835A]',
    twActiveRing: 'ring-[#9D835A]/50',
    twActiveBorder: 'border-[#9D835A]/60',
    description: '아직 학습하지 않은 단어예요. 오늘 새 단어 학습을 시작해보세요.',
  },
  {
    key: 'short',
    label: '단기기억',
    icon: Leaf,
    iconColor: '#77CE4F',
    iconClass: 'text-[#77CE4F]',
    twActiveRing: 'ring-[#77CE4F]/50',
    twActiveBorder: 'border-[#77CE4F]/60',
    description: '10일 미만 유지되는 단어예요. 꾸준한 복습으로 중기기억으로 넘어갈 수 있어요.',
  },
  {
    key: 'medium',
    label: '중기기억',
    icon: Plant,
    iconColor: '#38CE38',
    iconClass: 'text-[#38CE38]',
    twActiveRing: 'ring-[#38CE38]/50',
    twActiveBorder: 'border-[#38CE38]/60',
    description: '10~60일 유지되는 단어예요. 안정권에 접어들고 있어요.',
  },
  {
    key: 'long',
    label: '장기기억',
    icon: Carrot,
    iconColor: '#F68300',
    iconClass: 'text-[#F68300]',
    twActiveRing: 'ring-[#F68300]/50',
    twActiveBorder: 'border-[#F68300]/60',
    description: '60일 이상 안정적으로 기억하는 단어예요. 오래 기억할 가능성이 높아요.',
  },
];

/**
 * 통합 망각곡선 + 암기상태 구간 시각화 SVG.
 * 카드 래퍼 없이 인라인으로 렌더.
 */
const IntegratedCurveGraph = ({ activeKey }) => {
  "use memo";

  const W = 340;
  const H = 148;
  const PAD = { top: 14, right: 4, bottom: 30, left: 24 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const MAX_DAY = 90;

  const xScale = (day) => PAD.left + (day / MAX_DAY) * innerW;
  const yScale = (pct) => PAD.top + innerH - (pct / 100) * innerH;

  // ── 에빙하우스 곡선 (복습 없을 때) ──
  const ebbingPoints = [];
  for (let d = 0; d <= MAX_DAY; d += 1) {
    const pct = 100 * Math.exp(-d / 5);
    ebbingPoints.push([xScale(d), yScale(Math.max(pct, 8))]);
  }
  const ebbingPath = ebbingPoints
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  // ── 헤이보카 간격반복 곡선 ──
  const segments = [
    { start: 0,  end: 1,  startPct: 100, k: 6 },
    { start: 1,  end: 3,  startPct: 92,  k: 9 },
    { start: 3,  end: 7,  startPct: 90,  k: 14 },
    { start: 7,  end: 14, startPct: 89,  k: 22 },
    { start: 14, end: 30, startPct: 88,  k: 40 },
    { start: 30, end: 60, startPct: 87,  k: 80 },
    { start: 60, end: 90, startPct: 86,  k: 200 },
  ];
  const reviewDays = [1, 3, 7, 14, 30, 60];

  const spaceRepPoints = [];
  for (const seg of segments) {
    for (let d = seg.start; d <= seg.end; d += 0.5) {
      const offset = d - seg.start;
      const pct = seg.startPct * Math.exp(-offset / seg.k);
      spaceRepPoints.push([xScale(d), yScale(Math.min(100, Math.max(pct, 15)))]);
    }
  }
  const spaceRepPath = spaceRepPoints
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');

  // 복습 회복 점프
  const recoverySegments = [
    { day: 1,  from: 100 * Math.exp(-1 / 5), to: 92 },
    { day: 3,  from: 92 * Math.exp(-2 / 9),  to: 90 },
    { day: 7,  from: 90 * Math.exp(-4 / 14), to: 89 },
    { day: 14, from: 89 * Math.exp(-7 / 22), to: 88 },
    { day: 30, from: 88 * Math.exp(-16 / 40), to: 87 },
    { day: 60, from: 87 * Math.exp(-30 / 80), to: 86 },
  ];

  // ── 상태 구간 zone 정의 ──
  const zones = [
    { key: 'short',  x1: xScale(0),  x2: xScale(10), fill: '#77CE4F' },
    { key: 'medium', x1: xScale(10), x2: xScale(60), fill: '#38CE38' },
    { key: 'long',   x1: xScale(60), x2: xScale(90), fill: '#F68300' },
  ];

  // x축 눈금
  const xTicks = [0, 10, 30, 60, 90];
  const yTicks = [0, 50, 100];

  // zone opacity 계산
  const getZoneOpacity = (zoneKey) => {
    if (!activeKey || activeKey === 'new') return 0.12;
    return activeKey === zoneKey ? 0.22 : 0.04;
  };

  // 곡선 opacity
  const curveOpacity = activeKey === 'new' ? 0.4 : 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxHeight: 160 }}
      aria-label="망각곡선과 암기 상태 구간 그래프"
    >
      {/* 상태 구간 zone 배경 */}
      {zones.map(z => (
        <rect
          key={z.key}
          x={z.x1}
          y={PAD.top}
          width={z.x2 - z.x1}
          height={innerH}
          fill={z.fill}
          opacity={getZoneOpacity(z.key)}
          style={{ transition: 'opacity 0.25s ease' }}
        />
      ))}

      {/* y축 그리드 */}
      {yTicks.map(tick => (
        <g key={`y-${tick}`}>
          <line
            x1={PAD.left} y1={yScale(tick)}
            x2={PAD.left + innerW} y2={yScale(tick)}
            stroke="#dddddd" strokeWidth="0.7"
            className="dark:stroke-[#333]"
          />
          <text
            x={PAD.left - 4} y={yScale(tick) + 3.5}
            textAnchor="end" fontSize="8.5"
            fill="#aaaaaa"
          >
            {tick}%
          </text>
        </g>
      ))}

      {/* x축 */}
      <line
        x1={PAD.left} y1={yScale(0)}
        x2={PAD.left + innerW} y2={yScale(0)}
        stroke="#cccccc" strokeWidth="1"
      />

      {/* x축 눈금 */}
      {xTicks.map(tick => (
        <text
          key={`x-${tick}`}
          x={xScale(tick)} y={H - PAD.bottom + 13}
          textAnchor="middle" fontSize="8.5"
          fill="#aaaaaa"
        >
          {tick}일
        </text>
      ))}

      {/* 구간 경계선 (10일, 60일) */}
      {[10, 60].map(d => (
        <line
          key={`zone-${d}`}
          x1={xScale(d)} y1={PAD.top}
          x2={xScale(d)} y2={yScale(0)}
          stroke="#cccccc" strokeWidth="0.8"
          strokeDasharray="3,3"
          opacity={activeKey && activeKey !== 'new' ? 0.6 : 0.35}
          style={{ transition: 'opacity 0.25s ease' }}
        />
      ))}

      {/* 복습 시점 세로선 */}
      {reviewDays.map(d => (
        <line
          key={`rv-${d}`}
          x1={xScale(d)} y1={PAD.top}
          x2={xScale(d)} y2={yScale(0)}
          stroke="#FF70D4" strokeWidth="0.7"
          strokeDasharray="2,3"
          opacity={curveOpacity * 0.5}
          style={{ transition: 'opacity 0.25s ease' }}
        />
      ))}

      {/* 회복 점프 선 */}
      {recoverySegments.map((seg, i) => {
        const x = xScale(seg.day);
        const y1 = yScale(Math.max(seg.from, 8));
        const y2 = yScale(Math.min(seg.to, 100));
        return (
          <line
            key={`jump-${i}`}
            x1={x} y1={y1} x2={x} y2={y2}
            stroke="#FF70D4" strokeWidth="1.2"
            opacity={curveOpacity}
            style={{ transition: 'opacity 0.25s ease' }}
          />
        );
      })}

      {/* 에빙하우스 곡선 (점선) */}
      <path
        d={ebbingPath}
        fill="none"
        stroke="#cccccc" strokeWidth="1.4"
        strokeDasharray="4,3"
        opacity={curveOpacity * 0.8}
        style={{ transition: 'opacity 0.25s ease' }}
      />

      {/* 헤이보카 간격반복 곡선 (실선) */}
      <path
        d={spaceRepPath}
        fill="none"
        stroke="#FF70D4" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        opacity={curveOpacity}
        style={{ transition: 'opacity 0.25s ease' }}
      />

      {/* 구간 라벨 (단기/중기/장기) — 그래프 내부 상단 */}
      {[
        { key: 'short',  x: xScale(5),  label: '단기' },
        { key: 'medium', x: xScale(35), label: '중기' },
        { key: 'long',   x: xScale(75), label: '장기' },
      ].map(z => {
        const isActive = activeKey === z.key;
        const opacity = !activeKey || activeKey === 'new'
          ? 0.5
          : isActive ? 1 : 0.2;
        const color = z.key === 'short' ? '#5BAB35'
          : z.key === 'medium' ? '#28A828'
          : '#D17200';
        return (
          <text
            key={z.key}
            x={z.x} y={PAD.top + 9}
            textAnchor="middle" fontSize="8"
            fill={color}
            fontWeight={isActive ? '700' : '500'}
            opacity={opacity}
            style={{ transition: 'opacity 0.25s ease' }}
          >
            {z.label}
          </text>
        );
      })}

      {/* 그래프 내 범례 */}
      <line
        x1={PAD.left} y1={H - 3}
        x2={PAD.left + 16} y2={H - 3}
        stroke="#cccccc" strokeWidth="1.4" strokeDasharray="4,2"
      />
      <text x={PAD.left + 20} y={H} fontSize="8" fill="#aaaaaa">복습 없을 때</text>
      <line
        x1={PAD.left + 72} y1={H - 3}
        x2={PAD.left + 88} y2={H - 3}
        stroke="#FF70D4" strokeWidth="2"
      />
      <text x={PAD.left + 92} y={H} fontSize="8" fill="#FF70D4">헤이보카</text>
    </svg>
  );
};

/**
 * 암기 상태 칩 — 아이콘에만 고유색 적용. 항상 1개 활성 유지.
 * - 활성: 테두리/링으로 구분, 숫자는 기본 텍스트색
 * - 비활성: 테두리 없음, 아이콘도 고유색 유지
 * - 라벨 텍스트 없음 (아이콘 + 숫자만)
 */
const StateChip = ({ state, count, isActive, onTap }) => {
  const Icon = state.icon;
  return (
    <motion.button
      type="button"
      onClick={onTap}
      whileTap={{ scale: 0.94 }}
      className={`
        flex flex-col items-center justify-center gap-[4px]
        flex-1 py-[10px] px-[4px] rounded-[10px] border
        transition-all duration-200
        ${isActive
          ? `bg-layout-gray-50 dark:bg-layout-gray-dark ${state.twActiveBorder} ring-[1.5px] ${state.twActiveRing}`
          : 'bg-layout-gray-50 dark:bg-layout-gray-dark border-transparent'
        }
      `}
      aria-pressed={isActive}
    >
      <Icon
        size={18}
        weight="fill"
        className={`shrink-0 ${state.iconClass}`}
      />
      <span className="text-[15px] font-[800] tabular-nums leading-none text-layout-black dark:text-layout-white">
        {count}
      </span>
    </motion.button>
  );
};

/**
 * 활성 상태 설명 패널 — 항상 렌더(활성 상태가 바뀌면 내용 교체).
 * 박스 배경/테두리는 중립, 아이콘에만 고유색 적용.
 * 개수는 칩에 이미 표시되므로 여기서는 제거.
 */
const StateDescPanel = ({ activeState }) => {
  return (
    <div className="flex items-start gap-[8px] w-full px-[10px] py-[10px] rounded-[10px] border border-border dark:border-border-dark bg-layout-gray-50 dark:bg-layout-gray-dark min-h-[56px]">
      <activeState.icon
        size={14}
        weight="fill"
        className={`mt-[2px] shrink-0 ${activeState.iconClass}`}
      />
      <p className="text-[12px] leading-relaxed font-[500] text-layout-black dark:text-layout-white">
        <span className="font-[700]">{activeState.label}</span>
        {' '}— {activeState.description}
      </p>
    </div>
  );
};

/**
 * 활성 날짜의 복습 예정 단어 리스트.
 * min-h: 약 5개 항목이 보이는 높이(~250px). 단어 없으면 빈 상태 메시지(날짜 라벨 없음).
 */
const DateWordList = ({ words = [], activeDate = '' }) => {
  return (
    <div className="flex flex-col min-h-[250px]">
      {words.length === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[250px]">
          <p className="text-[13px] text-layout-gray-300 dark:text-layout-gray-400 text-center leading-relaxed">
            {activeDate ? '복습 예정 단어가 없어요.' : '날짜를 선택해주세요.'}
          </p>
        </div>
      ) : (
        words.map((item, idx) => (
          <div
            key={item.user_voca_id ?? idx}
            className={`flex items-center justify-between px-[4px] py-[12px] gap-[12px] ${idx < words.length - 1 ? 'border-b border-border dark:border-border-dark' : ''}`}
          >
            <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white truncate">
              {item.word}
            </span>
            <span className="text-[13px] text-layout-gray-300 dark:text-layout-gray-400 shrink-0 max-w-[50%] text-right truncate">
              {item.meaning}
            </span>
          </div>
        ))
      )}
    </div>
  );
};

const STATES_KEYS = STATES.map(s => s.key);
const AUTO_PLAY_INTERVAL_MS = 3500;

const ReviewScheduleNewFullSheet = () => {
  "use memo";

  const { popNewFullSheet } = useNewFullSheetActions();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // 섹션 A: 암기 상태 칩 — 항상 1개 활성 유지. 초기값은 첫 번째 상태(미학습).
  const [activeKey, setActiveKey] = useState('new');
  const intervalRef = useRef(null);

  // 섹션 B: 활성 날짜 및 단어 목록
  const [activeDate, setActiveDate] = useState(null);
  const [activeDateWords, setActiveDateWords] = useState([]);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    getReviewScheduleApi()
      .then(res => {
        if (!alive) return;
        if (res?.code === 200) {
          const d = res.data;
          setData(d);
          // 기본 활성 날짜 = 오늘
          const todayStr = d?.today ?? null;
          if (todayStr) {
            setActiveDate(todayStr);
            const todayEntry = (d?.days ?? []).find(entry => entry.date === todayStr);
            setActiveDateWords(todayEntry?.words ?? []);
          }
        } else {
          setError('복습 일정을 불러오지 못했어요.');
        }
      })
      .catch(() => {
        if (alive) setError('복습 일정을 불러오지 못했어요.');
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });
    return () => { alive = false; };
  }, []);

  // 자동 순환: 3.5초마다 다음 상태로 이동
  const startAutoPlay = (currentKey) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveKey(prev => {
        const idx = STATES_KEYS.indexOf(prev);
        return STATES_KEYS[(idx + 1) % STATES_KEYS.length];
      });
    }, AUTO_PLAY_INTERVAL_MS);
  };

  useEffect(() => {
    startAutoPlay(activeKey);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dist = data?.distribution ?? {};
  const total = data?.total ?? 0;
  const days = data?.days ?? [];
  const today = data?.today ?? null;

  // 칩 탭 시 해당 상태로 전환 + 타이머 리셋 (그 지점부터 다시 순환)
  const handleChipTap = (key) => {
    vibrate({ duration: 5 });
    setActiveKey(key);
    startAutoPlay(key);
  };

  // 캘린더 날짜 선택
  const handleSelectDate = (dateStr, words) => {
    setActiveDate(dateStr);
    setActiveDateWords(words);
  };

  const activeState = STATES.find(s => s.key === activeKey);
  const activeCount = dist[activeKey] ?? 0;

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* 헤더 — 탭 이름과 동일한 "복습 일정/분포" */}
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-border dark:border-border-dark bg-layout-white dark:bg-layout-black"
      >
        <div className="flex items-center gap-[4px]">
          <motion.button
            onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
            className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
            whileHover={{ backgroundColor: 'rgba(0,0,0,0.05)', scale: 1.05 }}
            whileTap={{ scale: 0.95, backgroundColor: 'rgba(0,0,0,0.1)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <CaretLeft size={24} />
          </motion.button>
        </div>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white whitespace-nowrap">
          복습 일정/분포
        </h1>
        <div />
      </div>

      {/* 콘텐츠 */}
      <div className="flex flex-col flex-1 overflow-y-auto px-[16px] py-[20px] gap-[28px]">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[14px] text-layout-gray-300 dark:text-layout-gray-400">불러오는 중...</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-[8px]">
            <WarningCircle size={32} className="text-status-error-500" />
            <p className="text-[14px] text-layout-gray-300 dark:text-layout-gray-400">{error}</p>
          </div>
        )}

        {!isLoading && !error && data && (
          <>
            {/* ══════════════════════════════════
                섹션 A — 암기 상태 분포
            ══════════════════════════════════ */}
            <div className="flex flex-col gap-[14px]">
              {/* 섹션 제목 */}
              <div className="flex items-baseline justify-between">
                <h2 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">암기 상태 분포</h2>
                <span className="text-[11px] text-layout-gray-300 dark:text-layout-gray-400">
                  전체 {total}개
                </span>
              </div>

              {/* 상태 칩 행 (아이콘 + 숫자만, 항상 1개 활성) */}
              <div className="flex gap-[6px]">
                {STATES.map(state => (
                  <StateChip
                    key={state.key}
                    state={state}
                    count={dist[state.key] ?? 0}
                    isActive={activeKey === state.key}
                    onTap={() => handleChipTap(state.key)}
                  />
                ))}
              </div>

              {/* 망각곡선 (카드 래퍼 없이 인라인) — 칩 바로 아래 */}
              <div className="flex flex-col gap-[6px]">
                <IntegratedCurveGraph activeKey={activeKey} />
                <p className="text-[11px] text-layout-gray-300 dark:text-layout-gray-400 text-center leading-snug">
                  헤이보카가 최적 타이밍에 복습을 제안해 기억이 오래 유지됩니다.
                </p>
              </div>

              {/* 상세 설명 패널 (곡선 아래, 중립 배경, 아이콘만 색) */}
              {activeState && (
                <StateDescPanel
                  activeState={activeState}
                />
              )}
            </div>

            {/* 섹션 구분선 */}
            <div className="h-[1px] bg-border dark:bg-border-dark" />

            {/* ══════════════════════════════════
                섹션 B — 복습 예정 (캘린더)
            ══════════════════════════════════ */}
            <div className="flex flex-col gap-[14px]">
              {/* 섹션 제목 */}
              <div className="flex items-baseline justify-between">
                <h2 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">복습 예정</h2>
                {days.length > 0 && (
                  <span className="text-[11px] text-layout-gray-300 dark:text-layout-gray-400">
                    날짜를 눌러 단어를 확인하세요
                  </span>
                )}
              </div>

              {/* 캘린더 + 단어 리스트 (갭 없이 바로 붙임) */}
              <div className="flex flex-col">
                <ReviewScheduleCalendar
                  days={days}
                  today={today}
                  activeDate={activeDate}
                  onSelectDate={handleSelectDate}
                />
                {/* 단어 리스트 — 캘린더 바로 아래, 날짜 헤더 행 없음 */}
                <div className="border border-border dark:border-border-dark rounded-[12px] px-[14px] py-[4px] mt-[2px]">
                  <DateWordList words={activeDateWords} activeDate={activeDate} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReviewScheduleNewFullSheet;
