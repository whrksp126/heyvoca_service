import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, WarningCircle } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { getFarmApi } from '../../api/game';
import { vibrate } from '../../utils/osFunction';
import PlantIllustration from '../common/PlantIllustration';
import { farmStatusText, TONE_CLASS } from '../common/farmStatus';
import ReviveFarmNewBottomSheet from '../newBottomSheet/ReviveFarmNewBottomSheet';
import gemImg from '../../assets/images/gem.png';

// 상태 필터 정의 (밭 그리드 상단 칩)
const FILTERS = [
  { key: 'all',    label: '전체' },
  { key: 'carrot', label: '당근' },
  { key: 'leaf',   label: '잎' },
  { key: 'sprout', label: '새싹' },
  { key: 'seed',   label: '씨앗' },
  { key: 'wilting', label: '시드는 중' },
  { key: 'dead',   label: '죽음' },
];

const matchesFilter = (p, key) => {
  if (key === 'all') return true;
  if (key === 'dead') return p.wilt === 'dead';
  if (key === 'wilting') return p.wilt === 'wilt1' || p.wilt === 'wilt2';
  return p.wilt !== 'dead' && p.stage === key;
};

const FarmNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const aliveRef = useRef(true);

  const load = async () => {
    const res = await getFarmApi();
    if (!aliveRef.current) return;
    if (res?.code === 200) {
      setData(res.data);
      setError(null);
    } else {
      setError('농장을 불러오지 못했어요.');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const plants = data?.plants ?? [];
  const summary = data?.summary ?? { by_stage: {}, wilting: 0, dead: 0 };

  const filtered = useMemo(
    () => plants.filter((p) => matchesFilter(p, filter)),
    [plants, filter]
  );

  const handleReviveTap = async (plant) => {
    vibrate({ duration: 5 });
    const result = await pushAwaitNewBottomSheet(
      ReviveFarmNewBottomSheet,
      { plant, reviveItemCnt: data?.revive_item_cnt ?? 0, gemCnt: data?.gem_cnt ?? 0 },
      { hideUnderlying: false }
    );
    if (result?.revived) {
      // 부활 성공 → 농장 새로고침
      load();
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* 헤더 */}
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-border dark:border-border-dark bg-layout-white dark:bg-layout-black"
      >
        <motion.button
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white whitespace-nowrap">
          나의 당근 농장
        </h1>
        <div className="flex items-center gap-[5px] text-[13px] font-[700] text-layout-gray-400 dark:text-layout-gray-200">
          <img src={gemImg} alt="보석" className="w-[16px] h-[14px]" />
          {data?.gem_cnt ?? 0}
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto px-[16px] py-[16px] gap-[14px]">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[14px] text-layout-gray-300">불러오는 중...</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-[8px]">
            <WarningCircle size={32} className="text-status-error-500" />
            <p className="text-[14px] text-layout-gray-300">{error}</p>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* 요약 카드 */}
            <div className="flex items-center justify-around p-[14px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
              {[
                { n: summary.by_stage?.carrot ?? 0, label: '당근', color: '' },
                { n: summary.by_stage?.leaf ?? 0, label: '잎', color: '' },
                { n: summary.by_stage?.sprout ?? 0, label: '새싹', color: '' },
                { n: summary.wilting ?? 0, label: '시드는 중', color: 'text-[#E8890C]' },
                { n: summary.dead ?? 0, label: '죽음', color: 'text-status-error-600' },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-[3px]">
                  <b className={`text-[17px] font-[800] ${s.color || 'text-layout-black dark:text-layout-white'}`}>{s.n}</b>
                  <span className="text-[11px] text-layout-gray-300">{s.label}</span>
                </div>
              ))}
            </div>

            {/* 부활템 보유 안내 */}
            <div className="flex items-center justify-between px-[4px]">
              <span className="text-[12px] font-[500] text-layout-gray-300">
                부활템 {data?.revive_item_cnt ?? 0}개 보유
              </span>
            </div>

            {/* 상태 필터 */}
            <div className="flex gap-[6px] overflow-x-auto pb-[2px]">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => { vibrate({ duration: 5 }); setFilter(f.key); }}
                  className={`
                    px-[12px] py-[6px] rounded-[16px] text-[12px] font-[600] whitespace-nowrap flex-shrink-0
                    ${filter === f.key
                      ? 'bg-primary-main-600 text-layout-white'
                      : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'}
                  `}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 밭 그리드 */}
            {filtered.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-[40px]">
                <p className="text-[13px] text-layout-gray-300">해당하는 단어가 없어요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-[10px]">
                {filtered.map((p) => {
                  const status = farmStatusText(p);
                  const isDead = p.wilt === 'dead';
                  return (
                    <div
                      key={p.user_voca_id}
                      className="flex flex-col items-center gap-[3px] p-[10px_6px_8px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
                    >
                      <PlantIllustration stage={p.stage} wilt={p.wilt} size={52} />
                      <span className="text-[12px] font-[700] text-layout-black dark:text-layout-white max-w-full truncate">
                        {p.word}
                      </span>
                      <span className={`text-[10px] font-[500] ${TONE_CLASS[status.tone]}`}>
                        {status.text}
                      </span>
                      {isDead && (
                        <button
                          type="button"
                          onClick={() => handleReviveTap(p)}
                          className="mt-[4px] px-[10px] py-[3px] rounded-[12px] bg-primary-main-600 text-layout-white text-[10px] font-[700]"
                        >
                          부활
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default FarmNewFullSheet;
