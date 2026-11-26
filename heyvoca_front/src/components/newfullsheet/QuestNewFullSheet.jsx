// 농장 홈 퀘스트 패널 — 오늘 할 일을 게임풍 카드(리본 제목·진행 막대·바로가기)로 보여 준다.
import React from 'react';
import { X, Drop, Plant, Leaf, Check, CaretRight } from '@phosphor-icons/react';
import { useStats } from '../../context/StatsContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';
import { getQuestItems } from '../farm/questItems';

const ICONS = { wilted: Leaf, care: Drop, new_seed: Plant };

const QuestNewFullSheet = ({ onGo }) => {
  "use memo";
  const { todayTasks } = useStats();
  const { popNewFullSheet } = useNewFullSheetActions();
  const items = getQuestItems(todayTasks);
  const allDone = items.length > 0 && items.every((q) => q.done >= q.total);

  const close = () => { vibrate({ duration: 5 }); popNewFullSheet(); };
  const go = () => { vibrate({ duration: 5 }); popNewFullSheet(); onGo?.(); };

  return (
    <div className="flex flex-col h-full w-full bg-farm-canvas dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }} />
      <div className="relative flex items-center justify-center h-[64px] px-[16px]">
        <button
          type="button"
          aria-label="닫기"
          onClick={close}
          className="absolute left-[12px] top-1/2 -translate-y-1/2 w-[36px] h-[36px] rounded-full bg-layout-white dark:bg-layout-gray-dark shadow-[0_2px_8px_rgba(96,80,52,.16)] flex items-center justify-center text-layout-black dark:text-layout-white"
        >
          <X weight="bold" size={18} />
        </button>
        <div className="relative px-[34px] h-[40px] rounded-[10px] bg-primary-main-500 shadow-[0_3px_0_rgba(0,0,0,.18)] flex items-center">
          <span className="absolute -left-[10px] top-[6px] w-[16px] h-[34px] rounded-[4px] bg-primary-main-600 -z-[1]" />
          <span className="absolute -right-[10px] top-[6px] w-[16px] h-[34px] rounded-[4px] bg-primary-main-600 -z-[1]" />
          <h1 className="text-[18px] font-[800] tracking-[-0.02em] text-layout-white">오늘의 퀘스트</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[20px] pt-[12px] pb-[calc(24px+var(--safe-area-bottom))]">
        <div className="rounded-[20px] border-2 border-farm-line bg-layout-white dark:bg-layout-gray-dark p-[12px] flex flex-col gap-[10px] shadow-[0_4px_0_rgba(96,80,52,.12)]">
          {items.length === 0 && (
            <p className="py-[32px] text-center text-[14px] text-layout-gray-200 dark:text-layout-gray-300">오늘 남은 퀘스트가 없어요</p>
          )}
          {items.map((q) => {
            const Icon = ICONS[q.key] || Plant;
            const done = q.done >= q.total;
            const pct = Math.min(100, Math.round((q.done / Math.max(1, q.total)) * 100));
            return (
              <div key={q.key} className="rounded-[14px] border border-farm-line bg-farm-canvas dark:bg-layout-black p-[12px] flex items-center gap-[12px]">
                <div className={`shrink-0 w-[44px] h-[44px] rounded-[12px] flex items-center justify-center ${done ? 'bg-primary-main-500 text-layout-white' : 'bg-layout-white dark:bg-layout-gray-dark text-primary-main-500 border border-farm-line'}`}>
                  {done ? <Check weight="bold" size={22} /> : <Icon weight="fill" size={24} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-[700] tracking-[-0.02em] text-farm-ink dark:text-layout-white truncate">{q.title}</p>
                  <p className="text-[12px] text-layout-gray-200 dark:text-layout-gray-300 truncate">{q.desc}</p>
                  <div className="mt-[6px] flex items-center gap-[8px]">
                    <div className="flex-1 h-[10px] rounded-full bg-layout-gray-100 dark:bg-layout-gray-dark overflow-hidden border border-farm-line">
                      <div className="h-full rounded-full bg-primary-main-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="shrink-0 text-[12px] font-[700] text-farm-ink dark:text-layout-white">{q.done}/{q.total}</span>
                  </div>
                </div>
                {!done && (
                  <button
                    type="button"
                    onClick={go}
                    className="shrink-0 inline-flex items-center gap-[2px] h-[34px] px-[12px] rounded-full bg-primary-main-500 text-layout-white text-[13px] font-[700] shadow-[0_2px_0_rgba(0,0,0,.18)]"
                  >
                    바로가기<CaretRight weight="bold" size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {allDone && <p className="mt-[16px] text-center text-[14px] font-[700] text-primary-main-500">오늘 퀘스트를 모두 끝냈어요</p>}
      </div>
    </div>
  );
};

export default QuestNewFullSheet;
