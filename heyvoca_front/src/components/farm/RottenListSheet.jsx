import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CaretLeft, Check } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { vibrate } from '../../utils/osFunction';
import {
  getRottenPlantsApi,
  getFarmItemsApi,
  recoverPlantsApi,
  replantApi,
  cancelReplantApi,
} from '../../api/farm';
import { cropLabel } from '../../utils/crop';
import CropImage, { CROP_ASSETS } from './CropImage';
import ReplantConfirmNewBottomSheet from '../newBottomSheet/ReplantConfirmNewBottomSheet';
import RecoverConfirmNewBottomSheet from '../newBottomSheet/RecoverConfirmNewBottomSheet';
import { addPendingReplantIds, removePendingReplantIds } from '../../utils/replantPending';

const PAGE_SIZE = 20;
/** 기획 7.4 — 한 번에 몰아치지 않는다. 오늘 가볍게 돌볼 기본 묶음 */
const GENTLE_PICK = 10;
/** 되돌리기 기본 창 — 서버 CANCEL_WINDOW_SECONDS 와 같은 값 */
const UNDO_WINDOW_MS = 10000;

/**
 * 되돌리기 마감 시각(ms).
 * 서버 `cancel_until` 은 타임존이 없는 UTC 문자열이라 브라우저가 로컬 시각으로 읽어
 * 몇 시간 앞으로 밀린다 → 값이 상식 범위(0~60초) 안일 때만 쓰고, 아니면 10초로 둔다.
 */
const cancelUntil = (raw) => {
  const parsed = Date.parse(raw ?? '');
  if (!Number.isNaN(parsed)) {
    const left = parsed - Date.now();
    if (left > 0 && left <= 60000) return parsed;
  }
  return Date.now() + UNDO_WINDOW_MS;
};

/**
 * 당근 농장 V2 — 돌볼 작물(부패) 목록 풀시트.
 *
 * 기획 7.4 를 따른다: **부패 개수를 첫 화면에 크게 노출하지 않는다.**
 * 총 개수 대신 "오늘은 10개만 가볍게 돌봐볼까요?" 로 시작하고,
 * 사용자가 고른 만큼만 회복제 / 삽을 쓴다.
 *
 * @param {function} props.onChanged  회복·다시 심기가 성공했을 때 호출 (호출부 목록 갱신용)
 * @param {function} props.onOpenShop 상점으로 보내고 싶을 때 호출 ('SHOVEL' | 'NUTRIENT')
 */
const RottenListSheet = ({ onChanged, onOpenShop }) => {
  const { popNewFullSheet } = useNewFullSheetActions();
  const { pushAwaitNewBottomSheet } = useNewBottomSheet();

  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [owned, setOwned] = useState({ SHOVEL: 0, NUTRIENT: 0, SHIELD: 0 });
  // 다시 심기 되돌리기 — 첫 진단이 시작되기 전(cancel_until) 까지만 (기획 7.2)
  const [undoState, setUndoState] = useState(null); // { ids, rows, until }
  const [undoLeft, setUndoLeft] = useState(0);      // 남은 초

  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);

  // 보유 아이템 — 확인 시트에 정확한 수량을 넘겨야 부족분 안내가 맞는다
  // 갱신된 보유량을 그대로 돌려준다 — 확인 시트를 띄우기 직전에 다시 읽어야
  // 상점(이 시트 위에 얹힌다)에서 방금 산 도구가 수량에 반영된다.
  const loadItems = useCallback(async () => {
    const res = await getFarmItemsApi();
    if (res?.code === 200) {
      const next = { SHOVEL: 0, NUTRIENT: 0, SHIELD: 0, ...(res?.data?.items || {}) };
      setOwned(next);
      return next;
    }
    return null;
  }, []);

  const loadPage = useCallback(async (nextCursor) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const res = await getRottenPlantsApi({ limit: PAGE_SIZE, cursor: nextCursor });
    if (res?.code === 200) {
      const data = res?.data || {};
      const list = Array.isArray(data.items) ? data.items : [];
      setItems((prev) => (nextCursor ? [...prev, ...list] : list));
      setCursor(data.next_cursor ?? null);
      setHasMore(!!data.next_cursor && list.length > 0);
    } else {
      setHasMore(false);
      setNotice(res?.message || '목록을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    }

    setLoading(false);
    loadingRef.current = false;
  }, []);

  useEffect(() => {
    loadPage(null);
    loadItems();
  }, [loadPage, loadItems]);

  // 센티넬이 뷰포트에 들어오면 다음 페이지 (200px 선반영)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((obs) => {
      if (obs[0]?.isIntersecting) loadPage(cursor);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
    // items.length — 회복 후 목록이 줄면 센티넬을 다시 관찰해야 다음 페이지가 이어진다
  }, [hasMore, cursor, loadPage, items.length]);

  const toggle = (id) => {
    vibrate({ duration: 5 });
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickGentle = () => {
    vibrate({ duration: 5 });
    setSelected(new Set(items.slice(0, GENTLE_PICK).map((it) => it.user_voca_id)));
  };

  const pickAll = () => {
    vibrate({ duration: 5 });
    setSelected(new Set(items.map((it) => it.user_voca_id)));
  };

  const clearPick = () => {
    vibrate({ duration: 5 });
    setSelected(new Set());
  };

  const selectedIds = items
    .map((it) => it.user_voca_id)
    .filter((id) => selected.has(id));
  const selectedCount = selectedIds.length;

  /** 성공한 id 를 목록에서 걷어내고 선택도 비운다 */
  const dropDone = (doneIds) => {
    const done = new Set(doneIds);
    setItems((prev) => prev.filter((it) => !done.has(it.user_voca_id)));
    setSelected((prev) => {
      const next = new Set(prev);
      done.forEach((id) => next.delete(id));
      return next;
    });
  };

  const handleRecover = async () => {
    if (busy || selectedCount === 0) return;
    vibrate({ duration: 5 });

    const fresh = (await loadItems()) || owned;
    const answer = await pushAwaitNewBottomSheet(
      RecoverConfirmNewBottomSheet,
      { count: selectedCount, nutrientCnt: fresh.NUTRIENT },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true },
    );
    if (answer?.action === 'shop') {
      onOpenShop?.('NUTRIENT');
      return;
    }
    if (answer?.action !== 'confirm') return;

    const targets = selectedIds.slice(0, answer.count);
    if (targets.length === 0) return;

    setBusy(true);
    const res = await recoverPlantsApi(targets);
    setBusy(false);

    if (res?.code === 200) {
      const done = res?.data?.recovered || targets;
      dropDone(done);
      setOwned((prev) => ({ ...prev, NUTRIENT: res?.data?.nutrient_left ?? prev.NUTRIENT }));
      setNotice(`작물 ${done.length}개가 다시 자라기 시작했어요.`);
      onChanged?.();
    } else {
      setNotice(res?.message || '잠시 뒤 다시 시도해 주세요.');
    }
  };

  const handleReplant = async () => {
    if (busy || selectedCount === 0) return;
    vibrate({ duration: 5 });

    const fresh = (await loadItems()) || owned;
    const answer = await pushAwaitNewBottomSheet(
      ReplantConfirmNewBottomSheet,
      { count: selectedCount, shovelCnt: fresh.SHOVEL },
      { isBackdropClickClosable: true, isDragToCloseEnabled: true },
    );
    if (answer?.action === 'shop') {
      onOpenShop?.('SHOVEL');
      return;
    }
    if (answer?.action !== 'confirm') return;

    const targets = selectedIds.slice(0, answer.count);
    if (targets.length === 0) return;

    setBusy(true);
    const res = await replantApi(targets);
    setBusy(false);

    if (res?.code === 200) {
      const done = res?.data?.reserved || targets;
      const doneSet = new Set(done);
      // 되돌리기용으로 목록에서 걷어낼 행을 먼저 챙겨 둔다
      const removedRows = items.filter((it) => doneSet.has(it.user_voca_id));
      dropDone(done);
      setOwned((prev) => ({ ...prev, SHOVEL: res?.data?.shovel_left ?? prev.SHOVEL }));
      setNotice(`작물 ${done.length}개를 다시 심었어요. 오늘 학습에서 진단 문제로 만나요.`);
      // 학습 시안 §6 — 다음 학습에서 이 단어를 "다시 심기 진단"으로 그린다.
      // 서버가 진단 표시를 내려주지 않아 예약 id 를 기기에 적어 둔다(utils/replantPending 참조).
      addPendingReplantIds(done);
      setUndoState({ ids: done, rows: removedRows, until: cancelUntil(res?.data?.cancel_until) });
      onChanged?.();
    } else {
      setNotice(res?.message || '잠시 뒤 다시 시도해 주세요.');
    }
  };

  // 되돌리기 창 카운트다운. 창이 지나면 조용히 사라진다(경고하듯 알리지 않는다).
  useEffect(() => {
    if (!undoState) {
      setUndoLeft(0);
      return;
    }
    const tick = () => {
      const left = Math.ceil((undoState.until - Date.now()) / 1000);
      if (left <= 0) {
        setUndoState(null);
        setUndoLeft(0);
        return;
      }
      setUndoLeft(left);
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [undoState]);

  const handleUndoReplant = async () => {
    if (!undoState || busy) return;
    vibrate({ duration: 5 });
    setBusy(true);
    const res = await cancelReplantApi(undoState.ids);
    setBusy(false);

    if (res?.code === 200) {
      // 목록으로 되돌리고 삽 보유량도 다시 읽는다(반환된 개수는 서버가 정본)
      const rows = undoState.rows;
      setItems((prev) => {
        const has = new Set(prev.map((it) => it.user_voca_id));
        return [...rows.filter((it) => !has.has(it.user_voca_id)), ...prev];
      });
      removePendingReplantIds(undoState.ids);
      setUndoState(null);
      setNotice('다시 심기를 되돌렸어요. 삽도 그대로 돌려놓았어요.');
      loadItems();
      onChanged?.();
    } else {
      setUndoState(null);
      setNotice(res?.message || '되돌릴 수 있는 시간이 지났어요.');
    }
  };

  const empty = !loading && items.length === 0;

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-border dark:border-border-dark bg-layout-white dark:bg-layout-black"
      >
        <motion.button
          type="button"
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileTap={{ scale: 0.95 }}
          aria-label="닫기"
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white whitespace-nowrap">
          돌볼 작물
        </h1>
        <div />
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 인사 — 개수 대신 오늘 할 만큼을 먼저 말한다 (기획 7.4) */}
        <div className="flex items-center gap-[12px] px-[16px] pt-[16px] pb-[14px]">
          <img
            src={CROP_ASSETS.mascotWatering}
            alt=""
            draggable={false}
            className="w-[56px] h-[56px] object-contain select-none flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-[14px] font-[700] text-layout-black dark:text-layout-white leading-[1.45]">
              농장은 그대로 보관해두었어요.
            </p>
            <p className="text-[12.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 leading-[1.5] mt-[2px]">
              오늘은 {GENTLE_PICK}개만 가볍게 돌봐볼까요?
              <br />
              지금까지 자란 단계와 학습 기록은 그대로 남아 있어요.
            </p>
          </div>
        </div>

        {/* 고르기 도우미 */}
        <div className="flex gap-[6px] px-[16px] pb-[10px] overflow-x-auto scrollbar-hide">
          <motion.button
            type="button"
            onClick={pickGentle}
            whileTap={{ scale: 0.96 }}
            className="flex-shrink-0 h-[30px] px-[11px] rounded-full bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600 text-[12.5px] font-[700] whitespace-nowrap"
          >
            오늘 {GENTLE_PICK}개 고르기
          </motion.button>
          <motion.button
            type="button"
            onClick={pickAll}
            whileTap={{ scale: 0.96 }}
            className="flex-shrink-0 h-[30px] px-[11px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200 text-[12.5px] font-[700] whitespace-nowrap"
          >
            지금 보이는 작물 모두 선택
          </motion.button>
          {selectedCount > 0 && (
            <motion.button
              type="button"
              onClick={clearPick}
              whileTap={{ scale: 0.96 }}
              className="flex-shrink-0 h-[30px] px-[11px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200 text-[12.5px] font-[700] whitespace-nowrap"
            >
              선택 해제
            </motion.button>
          )}
        </div>

        {notice && (
          <div className="mx-[16px] mb-[10px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark px-[13px] py-[10px]">
            <p className="text-[12.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 leading-[1.55]">
              {notice}
            </p>
          </div>
        )}

        <div className="px-[16px]">
          {items.map((it) => {
            const id = it.user_voca_id;
            const on = selected.has(id);
            return (
              <button
                type="button"
                key={id}
                onClick={() => toggle(id)}
                className="flex items-center gap-[11px] w-full h-[58px] border-b border-[#F4F4F4] dark:border-border-dark text-left"
              >
                <CropImage
                  stage={it.crop || it.highest_stage}
                  health="ROTTEN"
                  size={30}
                  className="flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[5px]">
                    <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white truncate">
                      {it.word}
                    </span>
                    <span className="flex-shrink-0 text-[10px] font-[800] text-layout-gray-400 dark:text-layout-gray-200 bg-layout-gray-50 dark:bg-layout-gray-dark px-[5px] py-[1px] rounded-[4px]">
                      {cropLabel(it.crop || it.highest_stage)}까지
                    </span>
                  </div>
                  <div className="text-[12px] text-layout-gray-400 truncate mt-[1px]">
                    {it.meaning}
                  </div>
                </div>
                <span
                  className={`
                    flex items-center justify-center flex-shrink-0 w-[22px] h-[22px] rounded-full border-[1.5px]
                    ${on
                      ? 'bg-primary-main-600 border-primary-main-600'
                      : 'bg-transparent border-layout-gray-100 dark:border-border-dark'}
                  `}
                >
                  {on && <Check size={13} weight="bold" className="text-layout-white" />}
                </span>
              </button>
            );
          })}

          {loading && (
            <div className="py-[18px] text-center text-[12.5px] font-[400] text-layout-gray-300">
              불러오는 중이에요
            </div>
          )}

          {empty && (
            <div className="flex flex-col items-center gap-[10px] py-[48px]">
              <img
                src={CROP_ASSETS.mascotHouse}
                alt=""
                draggable={false}
                className="w-[80px] h-[80px] object-contain select-none"
              />
              <p className="text-[13.5px] font-[700] text-layout-black dark:text-layout-white">
                지금 돌볼 작물이 없어요
              </p>
              <p className="text-[12.5px] font-[400] text-layout-gray-300 text-center leading-[1.55]">
                오늘의 학습을 이어가면 농장이 계속 촉촉해져요.
              </p>
            </div>
          )}

          <div ref={sentinelRef} className="h-[1px]" />
        </div>

        <div className="h-[24px]" />
      </div>

      {/* 되돌리기 — 진단이 시작되기 전 취소 창 안에서만 뜬다 (기획 7.2) */}
      {undoState && undoLeft > 0 && (
        <div className="flex-shrink-0 mx-[16px] mb-[10px] flex items-center gap-[10px] px-[13px] py-[11px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
          <p className="flex-1 min-w-0 text-[12.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 leading-[1.5]">
            방금 {undoState.ids.length}개를 다시 심었어요.
          </p>
          <motion.button
            type="button"
            onClick={handleUndoReplant}
            whileTap={{ scale: 0.96 }}
            disabled={busy}
            className="flex-shrink-0 h-[30px] px-[12px] rounded-full bg-layout-white dark:bg-layout-black text-[12.5px] font-[700] text-primary-main-600 disabled:opacity-40"
          >
            되돌리기 {undoLeft}
          </motion.button>
        </div>
      )}

      {/* 하단 액션 — 삽과 회복제는 대등한 선택지라 나란히 놓는다 (기획 7.1) */}
      {items.length > 0 && (
        <div className="flex-shrink-0 border-t border-border dark:border-border-dark bg-layout-white dark:bg-layout-black px-[16px] pt-[12px]">
          <p className="text-center text-[12px] font-[400] text-layout-gray-300 mb-[10px]">
            {selectedCount > 0 ? `${selectedCount}개 선택했어요` : '돌볼 작물을 골라 주세요'}
          </p>
          <div className="flex gap-[9px]">
            <motion.button
              type="button"
              onClick={handleRecover}
              whileTap={selectedCount > 0 && !busy ? { scale: 0.97 } : undefined}
              disabled={selectedCount === 0 || busy}
              className="
                flex-1 flex flex-col items-center gap-[4px]
                py-[11px] rounded-[12px] border-[1.5px] border-primary-main-300
                disabled:opacity-40
              "
            >
              <img src={CROP_ASSETS.nutrient} alt="" className="w-[34px] h-[34px] object-contain" />
              <span className="text-[13px] font-[800] text-layout-black dark:text-layout-white">
                영양 회복제로 살리기
              </span>
              <span className="text-[11px] font-[700] text-primary-main-600">
                보유 {owned.NUTRIENT}개
              </span>
            </motion.button>
            <motion.button
              type="button"
              onClick={handleReplant}
              whileTap={selectedCount > 0 && !busy ? { scale: 0.97 } : undefined}
              disabled={selectedCount === 0 || busy}
              className="
                flex-1 flex flex-col items-center gap-[4px]
                py-[11px] rounded-[12px] border-[1.5px] border-primary-main-300
                disabled:opacity-40
              "
            >
              <img src={CROP_ASSETS.shovel} alt="" className="w-[34px] h-[34px] object-contain" />
              <span className="text-[13px] font-[800] text-layout-black dark:text-layout-white">
                삽으로 다시 심기
              </span>
              <span className="text-[11px] font-[700] text-primary-main-600">
                보유 {owned.SHOVEL}개
              </span>
            </motion.button>
          </div>
          <div style={{ height: 'calc(var(--safe-area-bottom) + 12px)' }} />
        </div>
      )}
    </div>
  );
};

export default RottenListSheet;
