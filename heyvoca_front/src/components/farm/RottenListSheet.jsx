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
import CropImage, { CROP_ASSETS } from './CropImage';
import ReplantConfirmNewBottomSheet from '../newBottomSheet/ReplantConfirmNewBottomSheet';
import RecoverConfirmNewBottomSheet from '../newBottomSheet/RecoverConfirmNewBottomSheet';
import BuyAndApplyNewBottomSheet from '../newBottomSheet/BuyAndApplyNewBottomSheet';
import GemPurchaseNewBottomSheet from '../newBottomSheet/GemPurchaseNewBottomSheet';
import { addPendingReplantIds, removePendingReplantIds } from '../../utils/replantPending';

const PAGE_SIZE = 20;
const TOOLS = [
  // desc 는 서버 동작 기준: 회복제 = 썩은 작물을 되살림(자란 단계 유지, 되살린 뒤 복습 1회 필요),
  // 삽 = 씨앗부터 다시 심고 복습 주기(안정성·다음 복습일)를 새로 시작. 학습 로그·정답 이력·최고 단계는 남는다.
  { key: 'NUTRIENT', name: '영양 회복제', verb: '사용하기', img: CROP_ASSETS.nutrient, desc: '시든 작물을 되살려요. 자란 단계는 그대로예요' },
  { key: 'SHOVEL', name: '새심기 삽', verb: '사용하기', img: CROP_ASSETS.shovel, desc: '처음부터 다시 심어요. 복습 일정이 초기화돼요' },
];

/**
 * 이 목록의 작물은 전부 한 번 심었다가 썩은 것이다 — 미학습 봉투(UNPLANTED_SEED)를 그리면 안 된다.
 * 서버 `crop` 은 UNPLANTED_SEED/PLANTED_SEED 를 둘 다 'seed' 로 합쳐 내려서, 그대로 넘기면
 * 씨앗 단계가 전부 봉투로 그려진다. 그래서 씨앗 계열은 PLANTED_SEED 로 고정하고
 * (낱알 씨앗의 썩은 모습), 나머지는 highest_stage 를 그대로 쓴다.
 */
const rottenStage = (it) => {
  const hs = String(it.highest_stage || '').trim().toUpperCase();
  if (!hs || hs === 'UNPLANTED_SEED' || hs === 'PLANTED_SEED') return 'PLANTED_SEED';
  const crop = String(it.crop || '').trim().toLowerCase();
  if (!crop || crop === 'seed') return 'PLANTED_SEED';
  return hs;
};
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
  const { pushAwaitNewBottomSheet, pushNewBottomSheet } = useNewBottomSheet();

  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [tool, setTool] = useState('NUTRIENT');
  const [selected, setSelected] = useState(() => new Set());
  // 서버가 내려주는 전체 개수 / 전체 id (구서버는 null → 불러온 개수로 대체)
  const [total, setTotal] = useState(null);
  const [allIds, setAllIds] = useState(null);
  const [allIdsTruncated, setAllIdsTruncated] = useState(false);
  const [pickingAll, setPickingAll] = useState(false);
  const [owned, setOwned] = useState({ SHOVEL: 0, NUTRIENT: 0, SHIELD: 0 });
  // 다시 심기 되돌리기 — 첫 진단이 시작되기 전(cancel_until) 까지만 (기획 7.2)
  const [undoState, setUndoState] = useState(null); // { ids, rows, until }
  const [undoLeft, setUndoLeft] = useState(0);      // 남은 초

  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);
  // 마지막 적용이 선택한 작물 전부에 성공했는지 — 성공이면 호출부가 시트를 닫는다
  const allAppliedRef = useRef(false);

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
      if (data.total !== null && data.total !== undefined && Number.isFinite(Number(data.total))) {
        setTotal(Number(data.total));
      }
      if (!nextCursor) {
        if (Array.isArray(data.all_ids)) {
          setAllIds(data.all_ids);
          setAllIdsTruncated(!!data.all_ids_truncated);
        } else {
          setAllIds(null);
          setAllIdsTruncated(false);
        }
      }
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

  const pickAll = async () => {
    if (pickingAll) return;
    vibrate({ duration: 5 });
    // 서버가 전체 id 를 줬으면 아직 안 불러온 항목까지 한 번에 선택
    if (allIds && !allIdsTruncated) {
      setSelected(new Set([...allIds, ...items.map((it) => it.user_voca_id)]));
      return;
    }
    // 구서버·너무 많은 경우 — 남은 페이지를 끝까지 불러온 뒤 전체 선택
    if (loadingRef.current) return;
    loadingRef.current = true;
    setPickingAll(true);
    setLoading(true);
    let all = [...items];
    let cur = hasMore ? cursor : null;
    let more = hasMore;
    let failed = false;
    while (more && cur) {
      const res = await getRottenPlantsApi({ limit: 100, cursor: cur });
      if (res?.code !== 200) { failed = true; break; }
      const data = res?.data || {};
      const list = Array.isArray(data.items) ? data.items : [];
      const seen = new Set(all.map((it) => it.user_voca_id));
      all = [...all, ...list.filter((it) => !seen.has(it.user_voca_id))];
      cur = data.next_cursor ?? null;
      more = !!cur && list.length > 0;
    }
    setItems(all);
    setCursor(more ? cur : null);
    setHasMore(more);
    setLoading(false);
    setPickingAll(false);
    loadingRef.current = false;
    if (failed) {
      setNotice('목록을 끝까지 불러오지 못했어요. 불러온 작물만 선택했어요.');
    }
    setSelected(new Set(all.map((it) => it.user_voca_id)));
  };

  const clearPick = () => {
    vibrate({ duration: 5 });
    setSelected(new Set());
  };

  // 선택은 id Set 이 정본 — 아직 불러오지 않은 항목도 포함한다
  const selectedIds = Array.from(selected);
  const selectedCount = selectedIds.length;
  const displayTotal = Math.max(total ?? 0, items.length);
  const allSelected = displayTotal > 0 && selectedCount >= displayTotal;
  const toolDef = TOOLS.find((t) => t.key === tool);
  const ownedCnt = owned[tool] ?? 0;
  const need = selectedCount;
  const shortage = need > 0 && ownedCnt < need;
  const canUse = need > 0 && !busy;
  const handleUse = () => (tool === 'NUTRIENT' ? handleRecover() : handleReplant());

  /** 보유량 < 선택 수 — 전용 시트에서 부족분을 보석으로 사고, 이어서 기존 사용 처리까지 한다 */
  const handleBuyAndApply = async () => {
    if (busy || selectedCount === 0) return;
    vibrate({ duration: 5 });

    const fresh = (await loadItems()) || null;
    const have = fresh ? (fresh[tool] ?? 0) : ownedCnt;
    const targets = [...selectedIds];
    const lack = targets.length - have;
    if (lack <= 0) {
      // 그 사이 보유량이 채워졌다(다른 기기·상점) — 기존 사용 흐름으로
      handleUse();
      return;
    }

    const run = () => (tool === 'NUTRIENT' ? applyRecover(targets) : applyReplant(targets));
    const gemCnt = Number((await getFarmItemsApi())?.data?.gem_cnt);
    const answer = await pushAwaitNewBottomSheet(
      BuyAndApplyNewBottomSheet,
      { itemType: tool, lack, count: targets.length, gemCnt: Number.isFinite(gemCnt) ? gemCnt : 0, onApply: run },
      { isBackdropClickClosable: false, isDragToCloseEnabled: false },
    );

    if (answer?.action === 'gems') {
      pushNewBottomSheet(GemPurchaseNewBottomSheet, {}, {});
      return;
    }
    if (answer?.action === 'done' && allAppliedRef.current) {
      popNewFullSheet();
      return;
    }
    // 구매만 되고 사용이 안 된 채 닫았다면 보유량이 늘었으니 다시 읽어 버튼이 '사용하기'로 바뀌게 한다
    if (answer?.action !== 'done') {
      await loadItems();
      if (answer?.purchased) {
        setNotice(`${toolDef.name}는 구매했지만 아직 사용하지 않았어요. 아래 버튼으로 이어서 사용해 주세요.`);
      }
    }
  };

  /** 성공한 id 를 목록에서 걷어내고 선택도 비운다 */
  const dropDone = (doneIds) => {
    const done = new Set(doneIds);
    setItems((prev) => prev.filter((it) => !done.has(it.user_voca_id)));
    setTotal((prev) => (prev === null ? prev : Math.max(0, prev - done.size)));
    setAllIds((prev) => (prev ? prev.filter((id) => !done.has(id)) : prev));
    setSelected((prev) => {
      const next = new Set(prev);
      done.forEach((id) => next.delete(id));
      return next;
    });
  };

  /** 회복제 사용 본체 — 확인 시트 흐름과 '구매하고 바로 적용하기'가 같이 쓴다 */
  const applyRecover = async (targets) => {
    setBusy(true);
    allAppliedRef.current = false;
    const res = await recoverPlantsApi(targets);
    setBusy(false);

    if (res?.code === 200) {
      const done = res?.data?.recovered || targets;
      dropDone(done);
      setOwned((prev) => ({ ...prev, NUTRIENT: res?.data?.nutrient_left ?? prev.NUTRIENT }));
      setNotice(`작물 ${done.length}개가 다시 자라기 시작했어요.`);
      allAppliedRef.current = done.length >= targets.length;
      onChanged?.();
      return { ok: true };
    }
    const message = res?.message || '잠시 뒤 다시 시도해 주세요.';
    setNotice(message);
    return { ok: false, message };
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
    await applyRecover(targets);
    if (allAppliedRef.current) popNewFullSheet();
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
    await applyReplant(targets);
    if (allAppliedRef.current) popNewFullSheet();
  };

  /** 삽 사용(다시 심기 예약) 본체 — 확인 시트 흐름과 '구매하고 바로 적용하기'가 같이 쓴다 */
  const applyReplant = async (targets) => {
    setBusy(true);
    allAppliedRef.current = false;
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
      allAppliedRef.current = done.length >= targets.length;
      onChanged?.();
      return { ok: true };
    }
    const message = res?.message || '잠시 뒤 다시 시도해 주세요.';
    setNotice(message);
    return { ok: false, message };
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
      setTotal((prev) => (prev === null ? prev : prev + rows.length));
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
        {/* 아이템 선택 — 영양 회복제 / 새심기 삽 중 하나를 고른다 */}
        <div className="flex gap-[9px] px-[16px] pt-[16px] pb-[12px]">
          {TOOLS.map((t) => {
            const on = tool === t.key;
            const cnt = owned[t.key] ?? 0;
            return (
              <div
                key={t.key}
                role="button"
                tabIndex={0}
                onClick={() => { vibrate({ duration: 5 }); setTool(t.key); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTool(t.key); }}
                className={`
                  flex-1 min-w-0 flex flex-col items-center gap-[4px] px-[8px] py-[12px] rounded-[12px] border-[1.5px] cursor-pointer
                  ${on
                    ? 'border-primary-main-600 bg-primary-main-100 dark:bg-primary-main-dark'
                    : 'border-border dark:border-border-dark'}
                `}
              >
                <img src={t.img} alt="" className="w-[34px] h-[34px] object-contain" />
                <span className="text-[13px] font-[800] text-layout-black dark:text-layout-white whitespace-nowrap">
                  {t.name}
                </span>
                <span className="text-[11px] font-[700] text-layout-gray-400 dark:text-layout-gray-200">
                  보유 {cnt}개
                </span>
              </div>
            );
          })}
        </div>

        {/* 전체 선택 토글 + 개수 */}
        <div className="flex items-center justify-between px-[16px] pb-[10px]">
          <motion.button
            type="button"
            onClick={allSelected ? clearPick : pickAll}
            whileTap={{ scale: 0.96 }}
            disabled={items.length === 0 || pickingAll}
            className="h-[30px] px-[11px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200 text-[12.5px] font-[700] whitespace-nowrap disabled:opacity-40"
          >
            {pickingAll ? '불러오는 중' : allSelected ? '선택 해제' : '모두 선택'}
          </motion.button>
          <span className="text-[12.5px] font-[700] text-layout-gray-400 dark:text-layout-gray-200">
            선택 {selectedCount} / 전체 {displayTotal}
          </span>
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
                className={`flex items-center gap-[11px] w-full h-[58px] border-b border-[#F4F4F4] dark:border-border-dark text-left`}
              >
                <CropImage
                  stage={rottenStage(it)}
                  health="ROTTEN"
                  size={30}
                  align="center"
                  className="flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[5px]">
                    <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white truncate">
                      {it.word}
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
            <p className="py-[48px] text-center text-[13.5px] font-[400] text-layout-gray-300">
              돌볼 작물이 없어요
            </p>
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
            className="flex-shrink-0 h-[30px] px-[12px] rounded-full bg-layout-white dark:bg-layout-black text-[12.5px] font-[700] text-layout-gray-400 disabled:opacity-40"
          >
            되돌리기 {undoLeft}
          </motion.button>
        </div>
      )}

      {/* 하단 고정 — 위에서 고른 아이템을 선택한 작물에 쓴다 (기획 7.1) */}
      {(
        <div className="flex-shrink-0 border-t border-border dark:border-border-dark bg-layout-white dark:bg-layout-black px-[16px] pt-[12px]">
          <p className="text-center text-[12px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 mb-[8px]">
            {toolDef.desc}
          </p>
          <motion.button
            type="button"
            onClick={shortage ? handleBuyAndApply : handleUse}
            whileTap={canUse ? { scale: 0.98 } : undefined}
            disabled={!canUse}
            className="w-full h-[52px] rounded-[12px] bg-primary-main-600 text-layout-white text-[16px] font-[700] disabled:opacity-40"
          >
            {selectedCount === 0
              ? '돌볼 작물을 골라 주세요'
              : shortage
                ? '구매하고 바로 적용하기'
                : `${toolDef.name} ${selectedCount}개 ${toolDef.verb}`}
          </motion.button>
          <div style={{ height: 'calc(var(--safe-area-bottom) + 12px)' }} />
        </div>
      )}
    </div>
  );
};

export default RottenListSheet;
