// 실험실 '내 농장 꾸미기' — 홈 본문. three.js 행성 씬(farmScene)은 동적 import 로 이 컴포넌트가 마운트될 때만 불러온다.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PencilSimple, X, Check, ArrowClockwise, Package, Lock, Warning, ArrowsClockwise,
  Plant, Tree, House, Columns, Flower, MapTrifold, PawPrint, Storefront,
} from '@phosphor-icons/react';
import { getFarmStateApi, saveFarmLayoutApi, buyFarmItemApi, setBookCropApi, unwrap } from '../../api/farmLab';
import { showToast, vibrate } from '../../utils/osFunction';
import gemIcon from '../../assets/images/farm/icon-gem.png';

const TABS = [
  { key: 'field', label: '밭', icon: Plant },
  { key: 'building', label: '건물', icon: House },
  { key: 'tree', label: '나무', icon: Tree },
  { key: 'fence', label: '울타리', icon: Columns },
  { key: 'deco', label: '장식', icon: Flower },
  { key: 'ground', label: '땅', icon: MapTrifold },
  { key: 'animal', label: '동물', icon: PawPrint },
  { key: 'shop', label: '상점', icon: Storefront },
];
const TAB_ICON = Object.fromEntries(TABS.map((t) => [t.key, t.icon]));
const DRAWER_H = 168;
const NAV_H = 60;

const unlockText = (u) => {
  if (!u) return '';
  if (u.type === 'streak') return `연속 ${u.value}일 달성`;
  if (u.type === 'words_learned') return `단어 ${u.value}개 학습`;
  return '조건 달성';
};
const unlockMet = (u, stats) => {
  if (!u) return true;
  if (u.type === 'streak') return (stats?.streak || 0) >= u.value;
  if (u.type === 'words_learned') return (stats?.words_learned || 0) >= u.value;
  return false;
};

const IconBtn = ({ onClick, children, className = '', label }) => (
  <button
    type="button"
    aria-label={label}
    onClick={() => { vibrate({ duration: 5 }); onClick(); }}
    className={`inline-flex items-center justify-center gap-[6px] h-[36px] px-[12px] rounded-full bg-layout-white/90 dark:bg-layout-gray-dark/90 backdrop-blur-[8px] shadow-[0_2px_8px_rgba(96,80,52,.16)] dark:shadow-[0_2px_8px_rgba(0,0,0,.4)] text-[14px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white ${className}`}
  >
    {children}
  </button>
);

const FarmHome = ({ onTapField, onEditChange, onGemChange, className = '' }) => {
  const hostRef = useRef(null);
  const drawerRef = useRef(null);
  const sceneRef = useRef(null);
  const tapFieldRef = useRef(onTapField);
  tapFieldRef.current = onTapField;

  const [phase, setPhase] = useState('loading'); // loading | ready | error
  const [state, setState] = useState(null); // {catalog, inventory, books, stats, gem, version}
  const [layout, setLayout] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('field');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const savedLayoutRef = useRef([]);
  const versionRef = useRef(0);

  const applyState = useCallback((data) => {
    versionRef.current = data.version ?? 0;
    savedLayoutRef.current = data.layout || [];
    setState({
      catalog: data.catalog || [],
      inventory: data.inventory || {},
      books: data.books || [],
      stats: data.stats || {},
      gem: data.gem ?? 0,
    });
    setLayout(data.layout || []);
  }, []);

  // 마운트 — 씬 모듈(동적 import)과 상태 조회를 함께 시작
  useEffect(() => {
    let cancelled = false;
    let scene = null;
    (async () => {
      try {
        const [mod, res] = await Promise.all([import('./farmScene'), getFarmStateApi()]);
        if (cancelled) return;
        if (res?.code !== 200) { setPhase('error'); return; }
        const data = unwrap(res);
        scene = await mod.createFarmScene(hostRef.current, {
          onTapField: (bookId) => tapFieldRef.current?.(bookId),
          onSelect: (sel) => setSelected(sel),
          onLayoutChange: (l) => setLayout(l),
        });
        if (cancelled) { scene.destroy(); scene = null; return; }
        sceneRef.current = scene;
        applyState(data);
        scene.setData({ catalog: data.catalog, layout: data.layout, books: data.books, grid: data.grid });
        setPhase('ready');
      } catch (e) {
        console.error('농장 로드 실패:', e);
        if (!cancelled) setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      if (scene) scene.destroy();
      sceneRef.current = null;
    };
  }, [applyState]);

  const catalogMap = useMemo(() => new Map((state?.catalog || []).map((c) => [c.id, c])), [state]);

  const placedCount = useMemo(() => {
    const m = {};
    layout.forEach((l) => { m[l.item_id] = (m[l.item_id] || 0) + 1; });
    return m;
  }, [layout]);
  const placedBooks = useMemo(() => new Set(layout.filter((l) => l.book_id).map((l) => l.book_id)), [layout]);
  const unplacedBooks = useMemo(() => (state?.books || []).filter((b) => !placedBooks.has(b.id)), [state, placedBooks]);

  const enterEdit = () => {
    setEditing(true); setConflict(false); setTab('field');
    onEditChange?.(true);
    const s = sceneRef.current;
    if (s) { s.setBottomInset(DRAWER_H + NAV_H); s.setEditMode(true); }
  };
  const leaveEdit = () => {
    setEditing(false); setConflict(false);
    onEditChange?.(false);
    const s = sceneRef.current;
    if (s) { s.setEditMode(false); s.setBottomInset(0); }
  };
  const cancelEdit = () => {
    sceneRef.current?.resetLayout(savedLayoutRef.current);
    setLayout(savedLayoutRef.current);
    leaveEdit();
  };

  const reload = async () => {
    const res = await getFarmStateApi();
    if (res?.code !== 200) { showToast(res?.message || '불러오지 못했어요'); return; }
    const data = unwrap(res);
    applyState(data);
    sceneRef.current?.setData({ catalog: data.catalog, layout: data.layout, books: data.books, grid: data.grid });
    setConflict(false);
  };

  const save = async () => {
    const s = sceneRef.current;
    if (!s || saving) return;
    if (s.hasInvalid()) { showToast('놓을 수 없는 자리가 있어요'); return; }
    setSaving(true);
    const next = s.getLayout();
    const res = await saveFarmLayoutApi({ layout: next, version: versionRef.current });
    setSaving(false);
    if (res?.code === 200) {
      const data = unwrap(res);
      versionRef.current = data?.version ?? versionRef.current + 1;
      savedLayoutRef.current = next;
      leaveEdit();
      showToast('농장을 저장했어요');
    } else if (res?.code === 409) {
      setConflict(true);
    } else {
      showToast(res?.message || '저장하지 못했어요');
    }
  };

  const changeCrop = async (cropId) => {
    if (!selected?.book_id) return;
    const res = await setBookCropApi(selected.book_id, cropId);
    if (res?.code === 200) {
      sceneRef.current?.setBookCrop(selected.book_id, cropId);
      setState((prev) => ({ ...prev, books: prev.books.map((b) => (b.id === selected.book_id ? { ...b, crop_type: cropId } : b)) }));
    } else {
      showToast(res?.message || '작물을 바꾸지 못했어요');
    }
  };

  const buy = async (item) => {
    vibrate({ duration: 5 });
    const res = await buyFarmItemApi(item.id);
    if (res?.code === 200) {
      const data = unwrap(res) || {};
      setState((prev) => ({
        ...prev,
        inventory: data.inventory && typeof data.inventory === 'object' ? data.inventory : { ...prev.inventory, [item.id]: (prev.inventory[item.id] || 0) + 1 },
        gem: typeof data.gem === 'number' ? data.gem : Math.max(0, prev.gem - (item.price_gem || 0)),
      }));
      onGemChange?.();
      showToast(`${item.name}을(를) 샀어요`);
    } else if (res?.data?.reason === 'gem_short') {
      showToast('보석이 부족해요');
    } else if (res?.data?.reason === 'locked') {
      showToast('아직 해금되지 않았어요');
    } else {
      showToast(res?.message || '구매하지 못했어요');
    }
  };

  // 서랍 칩 — 탭하면 화면 가운데 놓기, 위로 끌면 캔버스로 끌어다 놓기
  const chipDown = (e, itemId, bookId) => {
    const s = sceneRef.current;
    if (!s) return;
    const sx = e.clientX; const sy = e.clientY;
    let dragging = false;
    const move = (ev) => {
      if (!dragging) {
        const dx = ev.clientX - sx; const dy = ev.clientY - sy;
        if (Math.hypot(dx, dy) > 10 && Math.abs(dy) > Math.abs(dx)) { dragging = true; s.beginExternalDrag(itemId, bookId, ev.clientX, ev.clientY); }
      } else {
        s.moveExternalDrag(ev.clientX, ev.clientY);
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const up = (ev) => {
      cleanup();
      if (dragging) s.endExternalDrag(ev.clientX, ev.clientY);
      else if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10 && !s.addAtCenter(itemId, bookId)) showToast('놓을 빈 자리가 없어요');
    };
    const cancel = (ev) => { cleanup(); if (dragging) s.endExternalDrag(ev.clientX, -1); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const Chip = ({ itemId, bookId, name, qty, Icon }) => (
    <button
      type="button"
      disabled={qty <= 0}
      onPointerDown={(e) => chipDown(e, itemId, bookId)}
      className="relative shrink-0 w-[72px] h-[84px] flex flex-col items-center justify-center gap-[6px] rounded-[12px] border border-farm-line bg-farm-canvas text-layout-black dark:text-layout-white touch-pan-x select-none disabled:opacity-40"
    >
      <Icon weight="fill" size={26} className="text-primary-main-600" />
      <span className="max-w-[64px] truncate text-[12px] font-[600]">{name}</span>
      {qty > 1 && (
        <span className="absolute top-[4px] right-[4px] min-w-[18px] h-[18px] px-[4px] rounded-full bg-primary-main-500 text-layout-white text-[11px] font-[700] flex items-center justify-center">
          {qty}
        </span>
      )}
    </button>
  );

  const cropItems = (state?.catalog || []).filter((c) => c.category === 'crop');
  const shopItems = (state?.catalog || []).filter((c) => !['crop', 'field'].includes(c.category));
  const tabItems = (state?.catalog || []).filter((c) => c.category === tab && c.category !== 'field');
  const selectedBook = selected?.book_id ? state?.books.find((b) => b.id === selected.book_id) : null;
  const topPos = 'top-[max(48px,calc(var(--status-bar-height)+4px))]';

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <div ref={hostRef} className="absolute inset-0 touch-none select-none" />

      {phase === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-[14px] text-farm-ink/70 dark:text-layout-white/70 pointer-events-none">
          농장을 불러오는 중이에요
        </div>
      )}
      {phase === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[12px] px-[24px] text-center">
          <Warning size={28} className="text-layout-gray-300" />
          <p className="text-[14px] text-layout-gray-200 dark:text-layout-gray-300">농장을 불러오지 못했어요</p>
        </div>
      )}

      {phase === 'ready' && !editing && (
        <div className="absolute left-[16px] top-[max(96px,calc(var(--status-bar-height)+52px))] z-[10]">
          <IconBtn onClick={enterEdit} label="농장 꾸미기"><PencilSimple weight="bold" size={16} />꾸미기</IconBtn>
        </div>
      )}

      {editing && (
        <>
          <div className={`absolute left-[16px] ${topPos} z-[20]`}>
            <IconBtn onClick={cancelEdit} label="취소"><X weight="bold" size={16} />취소</IconBtn>
          </div>
          <div className={`absolute right-[16px] ${topPos} z-[20]`}>
            <IconBtn onClick={save} label="저장" className="!bg-primary-main-500 !text-layout-white">
              <Check weight="bold" size={16} />{saving ? '저장 중' : '저장'}
            </IconBtn>
          </div>

          {conflict && (
            <div className="absolute left-[16px] right-[16px] top-[max(96px,calc(var(--status-bar-height)+52px))] z-[20] flex items-center justify-between gap-[8px] rounded-[12px] bg-layout-white dark:bg-layout-gray-dark border border-farm-line px-[14px] py-[10px] shadow-[0_2px_8px_rgba(96,80,52,.16)]">
              <span className="text-[13px] text-layout-black dark:text-layout-white leading-[1.4]">다른 기기에서 먼저 저장했어요. 다시 불러온 뒤 꾸며 주세요.</span>
              <button type="button" onClick={reload} className="shrink-0 inline-flex items-center gap-[4px] h-[32px] px-[10px] rounded-full bg-primary-main-500 text-layout-white text-[13px] font-[700]">
                <ArrowsClockwise weight="bold" size={14} />다시 불러오기
              </button>
            </div>
          )}

          {/* 선택한 물건 도구 + 밭이면 작물 종류 */}
          {selected && (
            <div
              className="absolute left-[12px] right-[12px] z-[20] flex flex-col gap-[8px] items-center bottom-[calc(60px+var(--safe-area-bottom)+176px)]"
            >
              {selected.category === 'field' && selectedBook && (
                <div className="max-w-full overflow-x-auto flex gap-[6px] rounded-full bg-layout-white/95 dark:bg-layout-gray-dark/95 px-[8px] py-[6px] shadow-[0_2px_8px_rgba(96,80,52,.16)] touch-pan-x">
                  {cropItems.map((c) => {
                    const on = (selectedBook.crop_type || 'carrot') === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => changeCrop(c.id)}
                        className={`shrink-0 h-[30px] px-[12px] rounded-full text-[13px] font-[700] ${on ? 'bg-primary-main-500 text-layout-white' : 'bg-farm-canvas text-layout-black dark:text-layout-white border border-farm-line'}`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center gap-[8px]">
                {selected.valid === false && (
                  <span className="inline-flex items-center gap-[4px] h-[36px] px-[12px] rounded-full bg-health-rotten text-layout-white text-[13px] font-[700]">
                    <Warning weight="fill" size={14} />여기엔 놓을 수 없어요
                  </span>
                )}
                <IconBtn onClick={() => sceneRef.current?.rotateSelected()} label="회전"><ArrowClockwise weight="bold" size={16} />회전</IconBtn>
                <IconBtn onClick={() => sceneRef.current?.storeSelected()} label="보관"><Package weight="bold" size={16} />보관</IconBtn>
              </div>
            </div>
          )}

          {/* 하단 서랍 */}
          <div
            ref={drawerRef}
            className="absolute left-0 right-0 z-[20] bg-layout-white dark:bg-layout-gray-dark rounded-t-[16px] border-t border-farm-line shadow-[0_-4px_12px_rgba(96,80,52,.12)] bottom-[calc(60px+var(--safe-area-bottom))] h-[168px] flex flex-col"
          >
            <div className="flex overflow-x-auto px-[8px] pt-[8px] gap-[2px] touch-pan-x">
              {TABS.map((t) => {
                const Icon = t.icon;
                const on = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`shrink-0 inline-flex items-center gap-[4px] h-[32px] px-[12px] rounded-full text-[13px] font-[700] ${on ? 'bg-primary-main-500 text-layout-white' : 'text-layout-gray-200 dark:text-layout-gray-300'}`}
                  >
                    <Icon weight={on ? 'fill' : 'regular'} size={15} />{t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex-1 min-h-0 overflow-x-auto flex items-center gap-[8px] px-[12px] touch-pan-x">
              {tab === 'field' && (unplacedBooks.length === 0
                ? <p className="text-[13px] text-layout-gray-200 dark:text-layout-gray-300 px-[4px]">모든 단어장 밭이 농장에 있어요</p>
                : unplacedBooks.map((b) => <Chip key={b.id} itemId="field" bookId={b.id} name={b.name} qty={1} Icon={Plant} />))}
              {tab !== 'field' && tab !== 'shop' && (() => {
                const list = tabItems.filter((c) => (state.inventory[c.id] || 0) > 0);
                if (!list.length) return <p className="text-[13px] text-layout-gray-200 dark:text-layout-gray-300 px-[4px]">보관 중인 물건이 없어요. 상점에서 살 수 있어요</p>;
                return list.map((c) => (
                  <Chip key={c.id} itemId={c.id} name={c.name} qty={(state.inventory[c.id] || 0) - (placedCount[c.id] || 0)} Icon={TAB_ICON[c.category] || Flower} />
                ));
              })()}
              {tab === 'shop' && shopItems.map((c) => {
                const owned = state.inventory[c.id] || 0;
                const met = unlockMet(c.unlock, state.stats);
                const free = (c.price_gem || 0) === 0;
                const Icon = TAB_ICON[c.category] || Flower;
                return (
                  <div key={c.id} className="shrink-0 w-[104px] h-[100px] flex flex-col items-center justify-between rounded-[12px] border border-farm-line bg-farm-canvas p-[8px]">
                    <div className="flex flex-col items-center gap-[2px] w-full">
                      <Icon weight="fill" size={20} className="text-primary-main-600" />
                      <span className="max-w-full truncate text-[12px] font-[700] text-layout-black dark:text-layout-white">{c.name}</span>
                      {c.unlock && (
                        <span className={`text-[11px] leading-none ${met ? 'text-layout-gray-300' : 'text-health-rotten'}`}>{unlockText(c.unlock)}</span>
                      )}
                    </div>
                    {free ? (
                      <span className="text-[11px] text-layout-gray-300">{owned > 0 ? `보유 ${owned}` : '해금 시 자동 지급'}</span>
                    ) : (
                      <button
                        type="button"
                        disabled={!met}
                        onClick={() => buy(c)}
                        className="w-full h-[28px] inline-flex items-center justify-center gap-[4px] rounded-full bg-primary-main-500 text-layout-white text-[13px] font-[700] disabled:bg-layout-gray-100 dark:disabled:bg-layout-gray-300"
                      >
                        {met ? <img src={gemIcon} alt="" draggable={false} className="w-[14px] h-[14px] object-contain" /> : <Lock weight="fill" size={12} />}
                        {c.price_gem}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FarmHome;
