import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CaretLeft, CaretRight, Plus, PencilSimple, Info,
} from '@phosphor-icons/react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { useTheme } from '../../context/ThemeContext';
import { StoreBuyItemNewBottomSheet } from '../newBottomSheet/StoreBuyItemNewBottomSheet';
import { BuyEmptyBookNewBottomSheet } from '../newBottomSheet/BuyEmptyBookNewBottomSheet';
import { PreviewBookStoreNewFullSheet } from './PreviewBookStoreNewFullSheet';
import GemNewFullSheet from './GemNewFullSheet';
import {
  FarmItemPurchaseNewBottomSheet, PackCard, CapBar, Gem, nextGrantLabel,
  ITEM_NAME, ITEM_SHORT, ITEM_TAG,
} from '../newBottomSheet/FarmItemPurchaseNewBottomSheet';
import { getFarmItemsApi, getFarmShopApi } from '../../api/farm';
import { getBookStoreDetailApi } from '../../api/bookStore';
import { FARM_ITEM_ASSETS } from '../farm/CropImage';
import {
  resolveVocaBookBackground, resolveVocaBookAccentColor, resolveVocaBookSubColor,
} from '../../utils/vocaBookColor';
import { vibrate } from '../../utils/osFunction';
import iconGem from '../../assets/images/farm/icon-gem.png';
// 아직 사지 않은 단어장의 '심을 씨앗' — 봉투 그림이 맞다 (기획 5.1 보유 씨앗)
import seedImg from '../../assets/images/farm/crops/unplanted/healthy-seed.png';

/**
 * 상점 — 단어장 · 농장 도구 · 보석 3탭 (시안 shop.txt §1).
 *
 * 세 갈래로 나눈 이유는 §3 그대로다. 성격이 다른 세 상품이 한 스크롤에 이어 붙으면
 * 급해서 들어온 사용자가 단어장 카드를 지나쳐야 도구에 닿는다.
 * 보석 칩은 세그먼트가 아니라 헤더에 둔다 — 어느 탭에 있든 잔액은 같은 자리다(§3).
 *
 * initialTab 으로 원하는 탭을 열 수 있다(학습 화면의 "삽 사러 가기" → 'tools').
 * onInventoryChanged 를 넘기면 도구 구매 성공 시 호출된다(호출한 화면의 보유량 갱신용).
 * 인자는 구매 응답 그대로 — `{ sku, item_type, granted, gem_cnt, item_qty }`.
 * onGoRotten 을 넘기면 구매 결과의 "썩은 작물 보러 가기"가 그 콜백을 쓴다.
 */

const TABS = [
  { key: 'books', label: '단어장' },
  { key: 'tools', label: '농장 도구' },
  { key: 'gems', label: '보석' },
];

const ITEM_ORDER = ['SHOVEL', 'NUTRIENT', 'SHIELD'];
const ALL_CATEGORY = '전체';
const EMPTY_BOOK_PRICE = 3;

/** 섹션 머리 (시안 .sechead) */
const SecHead = ({ title, sub, right }) => (
  <div className="flex items-baseline gap-[8px] mb-[7px]">
    <h4 className="text-[15px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">{title}</h4>
    {sub && (
      <span className="flex-1 min-w-0 truncate text-[11.5px] font-[500] tracking-[-0.02em] text-layout-gray-300">
        {sub}
      </span>
    )}
    {right}
  </div>
);

/** 보유 pill (시안 .sechead .own) */
const OwnPill = ({ count }) => (
  <span
    className={`shrink-0 ml-auto px-[8px] py-[3px] rounded-full text-[11.5px] font-[700] tracking-[-0.02em] ${
      count > 0
        ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600 dark:text-primary-main-400'
        : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-300'
    }`}
  >
    보유 {count}개
  </span>
);

/**
 * 서점 단어장 카드 (시안 §4).
 * 골격 — 정사각형, 색 배경, 카테고리 pill, 좌하단 가격, 우하단 + 버튼 — 은 그대로 두고
 * 심을 씨앗 수 한 줄만 새로 넣었다. 검증 마크는 서점 단어장이 전부 검증된 데이터라
 * 붙이지 않고, 반대인 빈 단어장에만 "내가 채우는 밭"을 회색으로 남긴다.
 */
const ShopBookCard = ({ item, custom = false, onClick, className = '' }) => {
  const { isDark } = useTheme();
  const bg = custom ? undefined : resolveVocaBookBackground(item?.color?.background, isDark);
  const accent = custom ? undefined : resolveVocaBookAccentColor(item?.color?.main, isDark);
  const sub = custom ? undefined : resolveVocaBookSubColor(item?.color?.sub, item?.color?.main, isDark);
  const seeds = Number(item?.vocaCount) || 0;

  return (
    <motion.li
      style={custom ? undefined : { backgroundColor: bg }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      onClick={onClick}
      className={`flex flex-col justify-between aspect-square p-[13px] rounded-[12px] cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none ${
        custom ? 'bg-layout-gray-50 dark:bg-layout-gray-dark' : ''
      } ${className}`}
    >
      <div>
        <span
          style={custom ? undefined : { backgroundColor: accent }}
          className={`inline-block px-[7px] py-[3px] rounded-full text-[8.5px] font-[800] tracking-[0.01em] text-layout-white ${
            custom ? 'bg-layout-gray-400' : ''
          }`}
        >
          {custom ? 'CUSTOM' : item.category}
        </span>
        <h5 className="mt-[6px] text-[14.5px] font-[800] leading-[1.3] tracking-[-0.04em] text-layout-black dark:text-layout-white">
          {custom ? '빈 단어장' : item.name}
        </h5>
      </div>

      <div>
        {/* 새로 들어간 줄 — 단어 수는 이 밭이 얼마나 커지는지를 정하는 가장 큰 값이다 */}
        <div className="flex items-center gap-[4px] text-[10.5px] font-[700] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
          <img src={seedImg} alt="" draggable={false} className="w-[26px] h-[26px] object-contain select-none" />
          {custom ? '씨앗 0 — 직접 추가' : `심을 씨앗 ${seeds.toLocaleString('ko-KR')}개`}
        </div>
        {custom && (
          <div className="flex items-center gap-[3px] mt-[3px] text-[10px] font-[700] tracking-[-0.02em] text-[#BBBBBB]">
            <PencilSimple size={11} weight="fill" />
            내가 채우는 밭
          </div>
        )}
        <div className="flex items-center justify-between mt-[8px]">
          <span className="flex items-center text-[14px] font-[800] text-layout-black dark:text-layout-white">
            <Gem n={custom ? EMPTY_BOOK_PRICE : item.gem} />
          </span>
          <span
            style={custom ? undefined : { color: accent, backgroundColor: sub }}
            className={`flex items-center justify-center w-[28px] h-[28px] rounded-full ${
              custom ? 'bg-layout-white text-layout-gray-400' : ''
            }`}
          >
            <Plus size={15} weight="bold" />
          </span>
        </div>
      </div>
    </motion.li>
  );
};

const StoreNewFullSheet = ({ initialTab = 'books', onInventoryChanged, onGoRotten, asPage = false }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet, pushNewFullSheet } = useNewFullSheetActions();
  const { gemItems, userProfile } = useUser();
  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const { bookStore, isBookStoreLoading } = useVocabulary();

  const [activeTab, setActiveTab] = useState(
    TABS.some((tab) => tab.key === initialTab) ? initialTab : 'books'
  );
  const [packs, setPacks] = useState([]);
  const [itemCounts, setItemCounts] = useState({});
  const [spend, setSpend] = useState(null); // 하루 상한 { spent, limit } — 서버가 줄 때만 채워진다
  const [toolsStatus, setToolsStatus] = useState('idle'); // idle | loading | ready | error
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // ── 단어장 탭 ───────────────────────────────────────────
  const categories = useMemo(() => {
    const set = new Set();
    bookStore.forEach((item) => { if (item.category) set.add(item.category); });
    return [ALL_CATEGORY, ...Array.from(set)];
  }, [bookStore]);

  const filteredBooks = useMemo(() => (
    category === ALL_CATEGORY ? bookStore : bookStore.filter((b) => b.category === category)
  ), [bookStore, category]);

  const openBook = async (id) => {
    vibrate({ duration: 5 });
    setLoadingDetail(true);
    try {
      const res = await getBookStoreDetailApi(id);
      if (res?.code === 200) {
        pushNewFullSheet(PreviewBookStoreNewFullSheet, { bookStoreVocabularySheet: res.data });
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const openEmptyBook = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(BuyEmptyBookNewBottomSheet, {});
  };

  // ── 농장 도구 탭 ────────────────────────────────────────
  // 가격·수량은 전부 서버 값이다. 화면에는 어떤 숫자도 적어두지 않는다.
  const loadTools = useCallback(async () => {
    setToolsStatus('loading');
    const [shopRes, itemRes] = await Promise.all([getFarmShopApi(), getFarmItemsApi()]);
    if (shopRes?.code !== 200 || itemRes?.code !== 200) {
      setToolsStatus('error');
      return;
    }
    setPacks(Array.isArray(shopRes.data?.packs) ? shopRes.data.packs : []);
    setItemCounts(itemRes.data?.items || {});
    // 하루 상한(기획 9.4)은 서버가 내려줄 때만 그린다 — 화면에서 계산하면 서버 판정과 갈린다.
    const cap = shopRes.data?.daily_spend || itemRes.data?.daily_spend || null;
    setSpend(cap && Number.isFinite(Number(cap.limit)) ? { spent: Number(cap.spent) || 0, limit: Number(cap.limit) } : null);
    setToolsStatus('ready');
  }, []);

  useEffect(() => {
    if (activeTab !== 'tools') return;
    if (toolsStatus !== 'idle') return;
    loadTools();
  }, [activeTab, toolsStatus, loadTools]);

  // 서버가 준 순서를 그대로 유지하며 아이템 종류별로 묶는다.
  const packGroups = [];
  packs.forEach((pack) => {
    const found = packGroups.find((group) => group.itemType === pack.item_type);
    if (found) found.packs.push(pack);
    else packGroups.push({ itemType: pack.item_type, packs: [pack] });
  });

  const unitPrice = (pack) => {
    const per = Number(pack.per_unit);
    if (Number.isFinite(per) && per > 0) return per;
    return (Number(pack.gem_price) || 0) / (Number(pack.amount) || 1);
  };

  const bestSku = (group) => {
    if (group.packs.length < 2) return null;
    return group.packs.reduce((best, pack) => (unitPrice(pack) < unitPrice(best) ? pack : best)).sku;
  };

  const openItemSheet = (group, pack) => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(FarmItemPurchaseNewBottomSheet, {
      packs: group.packs,
      initialSku: pack.sku,
      owned: itemCounts?.[group.itemType] ?? 0,
      spend,
      onNeedGems: () => setActiveTab('gems'),
      onGoRotten,
      onPurchased: (data) => {
        setItemCounts((prev) => ({ ...prev, [data.item_type]: data.item_qty }));
        setSpend((prev) => (prev ? { ...prev, spent: prev.spent + (Number(pack.gem_price) || 0) } : prev));
        onInventoryChanged?.(data);
      },
    });
  };

  // ── 보석 탭 ─────────────────────────────────────────────
  const handleGemClick = (id) => {
    vibrate({ duration: 5 });
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'iapPurchase', props: { itemId: id } }));
    pushNewBottomSheet(
      StoreBuyItemNewBottomSheet,
      { options: { productId: id, image_url: (Array.isArray(gemItems) ? gemItems : []).find((g) => g.product_id === id)?.image_url } },
      { isBackdropClickClosable: false, isDragToCloseEnabled: false }
    );
  };

  const gemProducts = Array.isArray(gemItems) ? gemItems : [];
  const bestGemId = useMemo(() => {
    if (gemProducts.length === 0) return null;
    return gemProducts.reduce((best, g) => ((g.price || 0) > (best.price || 0) ? g : best)).id;
  }, [gemProducts]);

  return (
    <div className={`flex flex-col w-full bg-layout-white dark:bg-layout-black ${asPage ? 'h-screen' : 'h-full'}`}>
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* 상단 바 — 타이틀은 가운데, 보석 칩은 우측 고정 (시안 §3)
          바텀 네비의 상점 탭으로 들어온 경우(asPage)에는 돌아갈 곳이 없어 뒤로가기를 두지 않는다 */}
      <div data-page-header className="relative flex items-center justify-center h-[52px] shrink-0 px-[16px]">
        {!asPage && (
        <motion.button
          type="button"
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          whileTap={{ scale: 0.95 }}
          className="absolute left-[12px] flex items-center p-[4px] rounded-[8px] text-layout-black dark:text-layout-white"
        >
          <CaretLeft size={22} />
        </motion.button>
        )}
        <h1 className="text-[16px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">상점</h1>
        <div
          id="gem-counter"
          className="absolute right-[16px] flex items-center gap-[5px] text-[16px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white"
        >
          <img src={iconGem} alt="보석" draggable={false} className="w-[20px] h-[20px] object-contain select-none" />
          {userProfile?.gem_cnt ?? 0}
        </div>
      </div>

      {/* 세그먼트 */}
      <div className="mx-[16px] mb-[14px] h-[36px] shrink-0 flex p-[3px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark">
        {TABS.map((tab) => {
          const on = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => { vibrate({ duration: 5 }); setActiveTab(tab.key); }}
              className={`flex-1 flex items-center justify-center rounded-[8px] text-[13px] font-[700] tracking-[-0.03em] ${
                on
                  ? 'bg-layout-white dark:bg-primary-main-dark text-layout-black dark:text-layout-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:shadow-none'
                  : 'text-layout-gray-400 dark:text-layout-gray-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        className={`flex-1 flex flex-col px-[16px] overflow-y-auto ${activeTab === 'tools' ? 'gap-[13px]' : 'gap-[18px]'}`}
        /* 페이지로 열리면 바텀 네비(60px) 밑으로 마지막 카드가 숨지 않게 여백을 준다 */
        style={asPage ? { paddingBottom: 'calc(72px + var(--safe-area-bottom))' } : { paddingBottom: 6 }}
      >
        {/* ── ① 단어장 ─────────────────────────────────── */}
        {activeTab === 'books' && (
          <>
            {isBookStoreLoading && (
              <div className="flex items-center justify-center py-[60px]">
                <span className="animate-spin rounded-full h-[28px] w-[28px] border-b-2 border-primary-main-600" />
              </div>
            )}

            {!isBookStoreLoading && (
              <>
                <div className="flex gap-[6px] overflow-x-auto scrollbar-hide -mx-[16px] px-[16px]">
                  {categories.map((cat) => {
                    const on = cat === category;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => { vibrate({ duration: 5 }); setCategory(cat); }}
                        className={`shrink-0 h-[28px] px-[11px] rounded-full border flex items-center whitespace-nowrap text-[12px] font-[700] tracking-[-0.02em] ${
                          on
                            ? 'border-primary-main-600 text-primary-main-600 dark:text-primary-main-500'
                            : 'border-layout-gray-100 dark:border-[#333333] text-[#BBBBBB] dark:text-layout-gray-400'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>

                <ul className="grid grid-cols-2 gap-[10px]">
                  {filteredBooks.map((item) => (
                    <ShopBookCard key={item.id} item={item} onClick={() => openBook(item.id)} />
                  ))}
                  {category === ALL_CATEGORY && (
                    <ShopBookCard key="empty-book" custom onClick={openEmptyBook} />
                  )}
                </ul>
              </>
            )}
          </>
        )}

        {/* ── ② 농장 도구 ──────────────────────────────── */}
        {activeTab === 'tools' && (
          <>
            {toolsStatus === 'loading' && (
              <div className="flex items-center justify-center py-[60px]">
                <span className="animate-spin rounded-full h-[28px] w-[28px] border-b-2 border-primary-main-600" />
              </div>
            )}

            {toolsStatus === 'error' && (
              <div className="flex flex-col items-center gap-[12px] py-[50px]">
                <p className="text-[13px] font-[400] text-layout-gray-300 text-center">
                  농장 도구를 불러오지 못했어요.
                </p>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { vibrate({ duration: 5 }); setToolsStatus('idle'); }}
                  className="h-[40px] px-[18px] rounded-[8px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[13px] font-[700] text-layout-gray-400 dark:text-layout-gray-200"
                >
                  다시 불러오기
                </motion.button>
              </div>
            )}

            {toolsStatus === 'ready' && (
              <>
                {/* 보유량이 맨 위 — 산 도구가 여기로 날아온다 */}
                <div>
                  <div className="flex gap-[8px]">
                    {ITEM_ORDER.map((type) => {
                      const count = itemCounts?.[type] ?? 0;
                      return (
                        <div
                          key={type}
                          id={`farm-item-hold-${type}`}
                          className="flex-1 flex flex-col items-center gap-[3px] px-[6px] pt-[8px] pb-[7px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
                        >
                          <img
                            src={FARM_ITEM_ASSETS[type]}
                            alt={ITEM_SHORT[type]}
                            draggable={false}
                            className="w-[28px] h-[28px] object-contain select-none"
                          />
                          <span className={`text-[15px] font-[800] tracking-[-0.02em] ${count > 0 ? 'text-layout-black dark:text-layout-white' : 'text-layout-gray-200'}`}>
                            {count}
                          </span>
                          <span className="text-[10px] font-[600] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
                            {ITEM_SHORT[type]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* 하루 상한은 닿기 전에 보여야 의미가 있다 (§6) */}
                  {spend && <CapBar spent={spend.spent} limit={spend.limit} className="mt-[10px]" />}
                </div>

                {packGroups.map((group) => {
                  const best = bestSku(group);
                  const owned = itemCounts?.[group.itemType] ?? 0;
                  return (
                    <div key={group.itemType}>
                      <SecHead
                        title={ITEM_NAME[group.itemType]}
                        sub={ITEM_TAG[group.itemType]}
                        right={<OwnPill count={owned} />}
                      />

                      {group.packs.length > 1 ? (
                        <div className="flex gap-[8px]">
                          {group.packs.map((pack) => (
                            <PackCard
                              key={pack.sku}
                              pack={pack}
                              itemType={group.itemType}
                              ribbon={pack.sku === best ? '가장 이득' : null}
                              variant={pack.sku === best ? 'best' : ''}
                              onClick={() => openItemSheet(group, pack)}
                            />
                          ))}
                        </div>
                      ) : (
                        group.packs.map((pack) => (
                          <motion.button
                            key={pack.sku}
                            type="button"
                            whileTap={{ scale: 0.99 }}
                            onClick={() => openItemSheet(group, pack)}
                            className="w-full flex items-center gap-[11px] p-[9px] rounded-[12px] border-[1.5px] border-[#EEEEEE] dark:border-transparent bg-layout-white dark:bg-layout-gray-dark text-left"
                          >
                            <img
                              src={FARM_ITEM_ASSETS[group.itemType]}
                              alt=""
                              draggable={false}
                              className="w-[40px] h-[40px] shrink-0 object-contain select-none"
                            />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13.5px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
                                {ITEM_NAME[group.itemType]} {pack.amount}개
                              </span>
                              <span className="block mt-[2px] text-[11px] font-[500] leading-[1.4] tracking-[-0.02em] text-layout-gray-300">
                                {nextGrantLabel()}
                              </span>
                            </span>
                            <span className="shrink-0 h-[32px] px-[12px] rounded-[8px] bg-primary-main-600 text-layout-white flex items-center text-[13px] font-[800]">
                              <Gem n={pack.gem_price} size="s" />
                            </span>
                          </motion.button>
                        ))
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ── ③ 보석 ───────────────────────────────────── */}
        {activeTab === 'gems' && (
          <>
            <div className="flex items-center gap-[12px] p-[16px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
              <img src={iconGem} alt="" draggable={false} className="w-[44px] h-[44px] shrink-0 object-contain select-none" />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-[600] tracking-[-0.02em] text-layout-gray-300">보유 보석</div>
                <div className="text-[24px] font-[800] leading-[1.15] tracking-[-0.04em] text-layout-black dark:text-layout-white">
                  {userProfile?.gem_cnt ?? 0}
                </div>
              </div>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => { vibrate({ duration: 5 }); pushNewFullSheet(GemNewFullSheet, {}); }}
                className="shrink-0 h-[32px] px-[12px] rounded-[8px] flex items-center gap-[2px] bg-layout-white dark:bg-[#333333] text-[12px] font-[700] text-layout-gray-400 dark:text-layout-gray-200"
              >
                내역<CaretRight size={11} weight="bold" />
              </motion.button>
            </div>

            <div>
              <SecHead title="보석 충전" />
              <div className="grid grid-cols-3 gap-[9px]">
                {gemProducts.map((item) => {
                  const isBest = item.id === bestGemId;
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleGemClick(item.product_id)}
                      className={`relative flex flex-col items-center px-[6px] pt-[12px] pb-[10px] rounded-[12px] border-[1.5px] ${
                        isBest
                          ? 'border-primary-main-300 dark:border-transparent bg-[#FFF9FD] dark:bg-primary-main-dark'
                          : 'border-[#EEEEEE] dark:border-transparent bg-layout-white dark:bg-layout-gray-dark'
                      }`}
                    >
                      {item.bonus > 0 && (
                        <span className="absolute -top-[7px] -right-[4px] h-[22px] px-[7px] rounded-full bg-status-success-600 text-layout-white text-[10px] font-[800] tracking-[-0.02em] flex items-center">
                          +{item.bonus}
                        </span>
                      )}
                      <img src={item.image_url} alt="" draggable={false} className="w-[56px] h-[56px] mb-[6px] object-contain select-none" />
                      <span className="text-[12.5px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
                        {item.name}
                      </span>
                      <span className="mt-[7px] w-full h-[26px] rounded-[7px] bg-primary-main-600 text-layout-white flex items-center justify-center text-[12px] font-[800]">
                        ₩ {Number(item.price || 0).toLocaleString('ko-KR')}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/*
              "무료로 보석 얻기" 안내표를 내렸다.
              읽을거리일 뿐 여기서 할 수 있는 일이 없었다 — 네 줄 모두 학습하다 저절로
              들어오는 보상이라 상점에서 누를 것이 하나도 없었고, 보석 충전 바로 아래에서
              화면의 절반을 차지했다. (지급 자체는 그대로다 — 출석·물주기 목표·주간 미션·
              새싹 첫 발아 보상은 백엔드가 계속 준다.)
            */}

            {/* 결제 고지는 남긴다 — 유료 상품이 있는 화면에서 빼면 안 되는 안내다 */}
            <div className="flex gap-[8px] px-[11px] py-[10px] rounded-[10px] bg-[#F7F7F7] dark:bg-layout-gray-dark text-[11px] leading-[1.55] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
              <Info size={13} weight="fill" className="shrink-0 mt-[1px] text-[#BBBBBB]" />
              <span>
                보석은 헤이보카 안에서만 쓰는 재화예요. 사용한 보석과 이미 받은 도구는
                돌려드릴 수 없어요. 결제 취소는 스토어 정책을 따라요.
              </span>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {loadingDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-layout-white/60 dark:bg-layout-black/60 backdrop-blur-[2px]"
          >
            <span className="animate-spin rounded-full h-[30px] w-[30px] border-[3px] border-primary-main-600 border-t-transparent" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default StoreNewFullSheet;
