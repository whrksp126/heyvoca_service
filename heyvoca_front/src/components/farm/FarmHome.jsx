// 실험실 farm_home — 마을 지도 홈. three.js 씬(farmScene)은 동적 import 로 이 컴포넌트가 마운트될 때만 불러온다.
// 밭은 정해진 터에 놓이고, 길게 누르면 "자리 바꾸기" 모드(작물 바꾸기 칩 포함)가 된다. 꾸미기 서랍·상점은 쓰지 않는다.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check, Warning, ArrowsClockwise } from '@phosphor-icons/react';
import { getFarmStateApi, saveFarmLayoutApi, setBookCropApi, unwrap } from '../../api/farmLab';
import { showToast, vibrate } from '../../utils/osFunction';

const Btn = ({ onClick, children, className = '', label }) => (
  <button
    type="button"
    aria-label={label}
    onClick={() => { vibrate({ duration: 5 }); onClick(); }}
    className={`inline-flex items-center justify-center gap-[6px] h-[36px] px-[14px] rounded-full bg-layout-white/90 dark:bg-layout-gray-dark/90 backdrop-blur-[8px] shadow-[0_2px_8px_rgba(96,80,52,.16)] dark:shadow-[0_2px_8px_rgba(0,0,0,.4)] text-[14px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white ${className}`}
  >
    {children}
  </button>
);

const FarmHome = ({ onTapField, onAddBook, onEditChange, className = '' }) => {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const tapFieldRef = useRef(onTapField);
  tapFieldRef.current = onTapField;
  const addBookRef = useRef(onAddBook);
  addBookRef.current = onAddBook;
  const editChangeRef = useRef(onEditChange);
  editChangeRef.current = onEditChange;

  const [phase, setPhase] = useState('loading'); // loading | ready | error
  const [state, setState] = useState(null); // {catalog, books}
  const [moving, setMoving] = useState(null); // {book_id} — 자리 바꾸기 모드
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const versionRef = useRef(0);
  const dirtyRef = useRef(false);

  const applyState = useCallback((data) => {
    versionRef.current = data.version ?? 0;
    setState({ catalog: data.catalog || [], books: data.books || [] });
  }, []);

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
          onAddBook: () => addBookRef.current?.(),
          onLockedTap: () => showToast('단어장을 더 추가하면 새 밭 터가 열려요'),
          onMoveStart: (sel) => {
            vibrate({ duration: 10 });
            dirtyRef.current = false;
            setMoving(sel);
            editChangeRef.current?.(true);
          },
          onLayoutChange: () => { dirtyRef.current = true; },
        });
        if (cancelled) { scene.destroy(); scene = null; return; }
        sceneRef.current = scene;
        applyState(data);
        scene.setData(data);
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

  const leaveMove = () => {
    setMoving(null); setConflict(false);
    editChangeRef.current?.(false);
  };
  const cancelMove = () => { sceneRef.current?.cancelMove(); leaveMove(); };

  const reload = async () => {
    const res = await getFarmStateApi();
    if (res?.code !== 200) { showToast(res?.message || '불러오지 못했어요'); return; }
    const data = unwrap(res);
    applyState(data);
    sceneRef.current?.setData(data);
    leaveMove();
  };

  const done = async () => {
    const s = sceneRef.current;
    if (!s || saving) return;
    if (!dirtyRef.current) { s.endMove(); leaveMove(); return; }
    setSaving(true);
    const res = await saveFarmLayoutApi({ layout: s.getLayout(), version: versionRef.current });
    setSaving(false);
    if (res?.code === 200) {
      const data = unwrap(res);
      versionRef.current = data?.version ?? versionRef.current + 1;
      s.endMove();
      leaveMove();
      showToast('밭 자리를 저장했어요');
    } else if (res?.code === 409) {
      setConflict(true);
    } else {
      showToast(res?.message || '저장하지 못했어요');
    }
  };

  const changeCrop = async (cropId) => {
    if (!moving?.book_id) return;
    const res = await setBookCropApi(moving.book_id, cropId);
    if (res?.code === 200) {
      sceneRef.current?.setBookCrop(moving.book_id, cropId);
      setState((prev) => ({ ...prev, books: prev.books.map((b) => (b.id === moving.book_id ? { ...b, crop_type: cropId } : b)) }));
    } else {
      showToast(res?.message || '작물을 바꾸지 못했어요');
    }
  };

  const cropItems = (state?.catalog || []).filter((c) => c.category === 'crop');
  const movingBook = moving?.book_id != null ? state?.books.find((b) => b.id === moving.book_id) : null;
  const topPos = 'top-[max(150px,calc(var(--status-bar-height)+106px))]';

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <div ref={hostRef} data-no-ptr className="absolute inset-0 touch-none select-none" />

      {phase === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-[14px] text-farm-ink/70 dark:text-layout-white/70 pointer-events-none">
          마을을 불러오는 중이에요
        </div>
      )}
      {phase === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[12px] px-[24px] text-center">
          <Warning size={28} className="text-layout-gray-300" />
          <p className="text-[14px] text-layout-gray-200 dark:text-layout-gray-300">마을을 불러오지 못했어요</p>
        </div>
      )}

      {moving && (
        <>
          <div className={`absolute left-[16px] ${topPos} z-[20]`}>
            <Btn onClick={cancelMove} label="취소"><X weight="bold" size={16} />취소</Btn>
          </div>
          <div className={`absolute right-[16px] ${topPos} z-[20]`}>
            <Btn onClick={done} label="완료" className="!bg-primary-main-500 !text-layout-white">
              <Check weight="bold" size={16} />{saving ? '저장 중' : '완료'}
            </Btn>
          </div>
          <div className={`absolute left-0 right-0 ${topPos} mt-[48px] z-[20] flex flex-col items-center gap-[8px] px-[12px] pointer-events-none`}>
            <p className="px-[12px] py-[6px] rounded-full bg-layout-black/60 text-layout-white text-[13px] font-[600]">
              옮길 열린 터를 눌러 자리를 바꿔요
            </p>
            {movingBook && cropItems.length > 0 && (
              <div className="pointer-events-auto max-w-full overflow-x-auto flex gap-[6px] rounded-full bg-layout-white/95 dark:bg-layout-gray-dark/95 px-[8px] py-[6px] shadow-[0_2px_8px_rgba(96,80,52,.16)] touch-pan-x">
                {cropItems.map((c) => {
                  const on = (movingBook.crop_type || 'carrot') === c.id;
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
            {conflict && (
              <div className="pointer-events-auto flex items-center gap-[8px] rounded-[12px] bg-layout-white dark:bg-layout-gray-dark border border-farm-line px-[14px] py-[10px] shadow-[0_2px_8px_rgba(96,80,52,.16)]">
                <span className="text-[13px] text-layout-black dark:text-layout-white leading-[1.4]">다른 기기에서 먼저 저장했어요.</span>
                <button type="button" onClick={reload} className="shrink-0 inline-flex items-center gap-[4px] h-[32px] px-[10px] rounded-full bg-primary-main-500 text-layout-white text-[13px] font-[700]">
                  <ArrowsClockwise weight="bold" size={14} />다시 불러오기
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FarmHome;
