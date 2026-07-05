import React, { useEffect, useRef, useState } from 'react';
import { EggCrack, Leaf, Plant, Carrot, WarningCircle } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { getReviewScheduleApi } from '../../api/study';
import { vibrate } from '../../utils/osFunction';
import ReviewScheduleCalendar from './ReviewScheduleCalendar';

/**
 * 암기 상태 정의.
 */
const STATES = [
  { key: 'new',    label: '미학습',   icon: EggCrack, iconColor: '#9D835A', iconClass: 'text-[#9D835A]', twActiveRing: 'ring-[#9D835A]/50', twActiveBorder: 'border-[#9D835A]/60', description: '아직 학습하지 않은 단어예요. 오늘 새 단어 학습을 시작해보세요.' },
  { key: 'short',  label: '단기기억', icon: Leaf,     iconColor: '#77CE4F', iconClass: 'text-[#77CE4F]', twActiveRing: 'ring-[#77CE4F]/50', twActiveBorder: 'border-[#77CE4F]/60', description: '10일 미만 유지되는 단어예요. 꾸준한 복습으로 중기기억으로 넘어갈 수 있어요.' },
  { key: 'medium', label: '중기기억', icon: Plant,    iconColor: '#38CE38', iconClass: 'text-[#38CE38]', twActiveRing: 'ring-[#38CE38]/50', twActiveBorder: 'border-[#38CE38]/60', description: '10~60일 유지되는 단어예요. 안정권에 접어들고 있어요.' },
  { key: 'long',   label: '장기기억', icon: Carrot,   iconColor: '#F68300', iconClass: 'text-[#F68300]', twActiveRing: 'ring-[#F68300]/50', twActiveBorder: 'border-[#F68300]/60', description: '60일 이상 안정적으로 기억하는 단어예요. 오래 기억할 가능성이 높아요.' },
];

/** 통합 망각곡선 + 암기상태 구간 시각화 SVG. */
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

  const ebbingPoints = [];
  for (let d = 0; d <= MAX_DAY; d += 1) {
    const pct = 100 * Math.exp(-d / 5);
    ebbingPoints.push([xScale(d), yScale(Math.max(pct, 8))]);
  }
  const ebbingPath = ebbingPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

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
  const spaceRepPath = spaceRepPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const recoverySegments = [
    { day: 1,  from: 100 * Math.exp(-1 / 5), to: 92 },
    { day: 3,  from: 92 * Math.exp(-2 / 9),  to: 90 },
    { day: 7,  from: 90 * Math.exp(-4 / 14), to: 89 },
    { day: 14, from: 89 * Math.exp(-7 / 22), to: 88 },
    { day: 30, from: 88 * Math.exp(-16 / 40), to: 87 },
    { day: 60, from: 87 * Math.exp(-30 / 80), to: 86 },
  ];

  const zones = [
    { key: 'short',  x1: xScale(0),  x2: xScale(10), fill: '#77CE4F' },
    { key: 'medium', x1: xScale(10), x2: xScale(60), fill: '#38CE38' },
    { key: 'long',   x1: xScale(60), x2: xScale(90), fill: '#F68300' },
  ];

  const xTicks = [0, 10, 30, 60, 90];
  const yTicks = [0, 50, 100];

  const getZoneOpacity = (zoneKey) => {
    if (!activeKey || activeKey === 'new') return 0.12;
    return activeKey === zoneKey ? 0.22 : 0.04;
  };
  const curveOpacity = activeKey === 'new' ? 0.4 : 1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }} aria-label="망각곡선과 암기 상태 구간 그래프">
      {zones.map(z => (
        <rect key={z.key} x={z.x1} y={PAD.top} width={z.x2 - z.x1} height={innerH} fill={z.fill} opacity={getZoneOpacity(z.key)} style={{ transition: 'opacity 0.25s ease' }} />
      ))}
      {yTicks.map(tick => (
        <g key={`y-${tick}`}>
          <line x1={PAD.left} y1={yScale(tick)} x2={PAD.left + innerW} y2={yScale(tick)} stroke="#dddddd" strokeWidth="0.7" className="dark:stroke-[#333]" />
          <text x={PAD.left - 4} y={yScale(tick) + 3.5} textAnchor="end" fontSize="8.5" fill="#aaaaaa">{tick}%</text>
        </g>
      ))}
      <line x1={PAD.left} y1={yScale(0)} x2={PAD.left + innerW} y2={yScale(0)} stroke="#cccccc" strokeWidth="1" />
      {xTicks.map(tick => (
        <text key={`x-${tick}`} x={xScale(tick)} y={H - PAD.bottom + 13} textAnchor="middle" fontSize="8.5" fill="#aaaaaa">{tick}일</text>
      ))}
      {[10, 60].map(d => (
        <line key={`zone-${d}`} x1={xScale(d)} y1={PAD.top} x2={xScale(d)} y2={yScale(0)} stroke="#cccccc" strokeWidth="0.8" strokeDasharray="3,3" opacity={activeKey && activeKey !== 'new' ? 0.6 : 0.35} style={{ transition: 'opacity 0.25s ease' }} />
      ))}
      {reviewDays.map(d => (
        <line key={`rv-${d}`} x1={xScale(d)} y1={PAD.top} x2={xScale(d)} y2={yScale(0)} stroke="#FF70D4" strokeWidth="0.7" strokeDasharray="2,3" opacity={curveOpacity * 0.5} style={{ transition: 'opacity 0.25s ease' }} />
      ))}
      {recoverySegments.map((seg, i) => {
        const x = xScale(seg.day);
        const y1 = yScale(Math.max(seg.from, 8));
        const y2 = yScale(Math.min(seg.to, 100));
        return <line key={`jump-${i}`} x1={x} y1={y1} x2={x} y2={y2} stroke="#FF70D4" strokeWidth="1.2" opacity={curveOpacity} style={{ transition: 'opacity 0.25s ease' }} />;
      })}
      <path d={ebbingPath} fill="none" stroke="#cccccc" strokeWidth="1.4" strokeDasharray="4,3" opacity={curveOpacity * 0.8} style={{ transition: 'opacity 0.25s ease' }} />
      <path d={spaceRepPath} fill="none" stroke="#FF70D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={curveOpacity} style={{ transition: 'opacity 0.25s ease' }} />
      {[
        { key: 'short',  x: xScale(5),  label: '단기' },
        { key: 'medium', x: xScale(35), label: '중기' },
        { key: 'long',   x: xScale(75), label: '장기' },
      ].map(z => {
        const isActive = activeKey === z.key;
        const opacity = !activeKey || activeKey === 'new' ? 0.5 : isActive ? 1 : 0.2;
        const color = z.key === 'short' ? '#5BAB35' : z.key === 'medium' ? '#28A828' : '#D17200';
        return (
          <text key={z.key} x={z.x} y={PAD.top + 9} textAnchor="middle" fontSize="8" fill={color} fontWeight={isActive ? '700' : '500'} opacity={opacity} style={{ transition: 'opacity 0.25s ease' }}>{z.label}</text>
        );
      })}
      <line x1={PAD.left} y1={H - 3} x2={PAD.left + 16} y2={H - 3} stroke="#cccccc" strokeWidth="1.4" strokeDasharray="4,2" />
      <text x={PAD.left + 20} y={H} fontSize="8" fill="#aaaaaa">복습 없을 때</text>
      <line x1={PAD.left + 72} y1={H - 3} x2={PAD.left + 88} y2={H - 3} stroke="#FF70D4" strokeWidth="2" />
      <text x={PAD.left + 92} y={H} fontSize="8" fill="#FF70D4">헤이보카</text>
    </svg>
  );
};

const StateChip = ({ state, count, isActive, onTap }) => {
  const Icon = state.icon;
  return (
    <motion.button
      type="button" onClick={onTap} whileTap={{ scale: 0.94 }}
      className={`flex flex-col items-center justify-center gap-[4px] flex-1 py-[10px] px-[4px] rounded-[10px] border transition-all duration-200 ${isActive ? `bg-layout-gray-50 dark:bg-layout-gray-dark ${state.twActiveBorder} ring-[1.5px] ${state.twActiveRing}` : 'bg-layout-gray-50 dark:bg-layout-gray-dark border-transparent'}`}
      aria-pressed={isActive}
    >
      <Icon size={18} weight="fill" className={`shrink-0 ${state.iconClass}`} />
      <span className="text-[15px] font-[800] tabular-nums leading-none text-layout-black dark:text-layout-white">{count}</span>
    </motion.button>
  );
};

const StateDescPanel = ({ activeState }) => (
  <div className="flex items-start gap-[8px] w-full px-[10px] py-[10px] rounded-[10px] border border-border dark:border-border-dark bg-layout-gray-50 dark:bg-layout-gray-dark min-h-[56px]">
    <activeState.icon size={14} weight="fill" className={`mt-[2px] shrink-0 ${activeState.iconClass}`} />
    <p className="text-[12px] leading-relaxed font-[500] text-layout-black dark:text-layout-white">
      <span className="font-[700]">{activeState.label}</span>{' '}— {activeState.description}
    </p>
  </div>
);

const DateWordList = ({ words = [], activeDate = '' }) => (
  <div className="flex flex-col min-h-[250px]">
    {words.length === 0 ? (
      <div className="flex-1 flex items-center justify-center min-h-[250px]">
        <p className="text-[13px] text-layout-gray-300 dark:text-layout-gray-400 text-center leading-relaxed">
          {activeDate ? '복습 예정 단어가 없어요.' : '날짜를 선택해주세요.'}
        </p>
      </div>
    ) : (
      words.map((item, idx) => (
        <div key={item.user_voca_id ?? idx} className={`flex items-center justify-between px-[4px] py-[12px] gap-[12px] ${idx < words.length - 1 ? 'border-b border-border dark:border-border-dark' : ''}`}>
          <span className="text-[14px] font-[700] text-layout-black dark:text-layout-white truncate">{item.word}</span>
          <span className="text-[13px] text-layout-gray-300 dark:text-layout-gray-400 shrink-0 max-w-[50%] text-right truncate">{item.meaning}</span>
        </div>
      ))
    )}
  </div>
);

const STATES_KEYS = STATES.map(s => s.key);
const AUTO_PLAY_INTERVAL_MS = 3500;

/**
 * 통계(복습 일정/분포) 본문 — 풀시트/마이페이지 인라인 공용.
 * 헤더/래퍼 없이 콘텐츠만 렌더.
 */
const ReviewScheduleContent = () => {
  "use memo";

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeKey, setActiveKey] = useState('new');
  const intervalRef = useRef(null);
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
      .catch(() => { if (alive) setError('복습 일정을 불러오지 못했어요.'); })
      .finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; };
  }, []);

  const startAutoPlay = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveKey(prev => {
        const idx = STATES_KEYS.indexOf(prev);
        return STATES_KEYS[(idx + 1) % STATES_KEYS.length];
      });
    }, AUTO_PLAY_INTERVAL_MS);
  };

  useEffect(() => {
    startAutoPlay();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dist = data?.distribution ?? {};
  const total = data?.total ?? 0;
  const days = data?.days ?? [];
  const today = data?.today ?? null;

  const handleChipTap = (key) => {
    vibrate({ duration: 5 });
    setActiveKey(key);
    startAutoPlay();
  };

  const handleSelectDate = (dateStr, words) => {
    setActiveDate(dateStr);
    setActiveDateWords(words);
  };

  const activeState = STATES.find(s => s.key === activeKey);

  if (isLoading) {
    return <div className="flex items-center justify-center py-[40px]"><p className="text-[14px] text-layout-gray-300 dark:text-layout-gray-400">불러오는 중...</p></div>;
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-[8px] py-[40px]">
        <WarningCircle size={32} className="text-status-error-500" />
        <p className="text-[14px] text-layout-gray-300 dark:text-layout-gray-400">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex flex-col gap-[28px]">
      {/* 섹션 A — 암기 상태 분포 */}
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">암기 상태 분포</h2>
          <span className="text-[11px] text-layout-gray-300 dark:text-layout-gray-400">전체 {total}개</span>
        </div>
        <div className="flex gap-[6px]">
          {STATES.map(state => (
            <StateChip key={state.key} state={state} count={dist[state.key] ?? 0} isActive={activeKey === state.key} onTap={() => handleChipTap(state.key)} />
          ))}
        </div>
        <div className="flex flex-col gap-[6px]">
          <IntegratedCurveGraph activeKey={activeKey} />
          <p className="text-[11px] text-layout-gray-300 dark:text-layout-gray-400 text-center leading-snug">
            헤이보카가 최적 타이밍에 복습을 제안해 기억이 오래 유지됩니다.
          </p>
        </div>
        {activeState && <StateDescPanel activeState={activeState} />}
      </div>

      <div className="h-[1px] bg-border dark:bg-border-dark" />

      {/* 섹션 B — 복습 예정 (캘린더) */}
      <div className="flex flex-col gap-[14px]">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">복습 예정</h2>
          {days.length > 0 && (
            <span className="text-[11px] text-layout-gray-300 dark:text-layout-gray-400">날짜를 눌러 단어를 확인하세요</span>
          )}
        </div>
        <div className="flex flex-col">
          <ReviewScheduleCalendar days={days} today={today} activeDate={activeDate} onSelectDate={handleSelectDate} />
          <div className="border border-border dark:border-border-dark rounded-[12px] px-[14px] py-[4px] mt-[2px]">
            <DateWordList words={activeDateWords} activeDate={activeDate} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReviewScheduleContent;
