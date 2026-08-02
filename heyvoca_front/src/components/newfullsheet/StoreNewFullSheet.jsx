import React, { useCallback, useEffect, useState } from 'react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import gem from '../../assets/images/gem.png';
import voca_1 from '../../assets/images/voca_book_1.png';
import voca_5 from '../../assets/images/voca_book_5.png';
import voca_10 from '../../assets/images/voca_book_10.png';
import { useUser } from '../../context/UserContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { StoreBuyItemNewBottomSheet } from '../newBottomSheet/StoreBuyItemNewBottomSheet';
import { StoreBuyBookNewBottomSheet } from '../newBottomSheet/StoreBuyBookNewBottomSheet';
import { FarmItemPurchaseNewBottomSheet } from '../newBottomSheet/FarmItemPurchaseNewBottomSheet';
import { getFarmItemsApi, getFarmShopApi } from '../../api/farm';
import { FARM_ITEM_LABEL, FARM_ITEM_DESC } from '../../utils/crop';
import { FARM_ITEM_ASSETS } from '../farm/CropImage';
import { vibrate } from '../../utils/osFunction';

const TABS = [
  { key: 'books', label: '단어장' },
  { key: 'tools', label: '농장 도구' },
  { key: 'gems', label: '보석' },
];

/**
 * 상점 — 단어장 / 농장 도구 / 보석 3탭. initialTab 으로 원하는 탭을 열 수 있다.
 * onInventoryChanged 를 넘기면 도구 구매 성공 시 호출된다(호출한 화면의 보유량 갱신용).
 * 인자는 구매 응답 그대로 — `{ sku, item_type, granted, gem_cnt, item_qty }`.
 */
const StoreNewFullSheet = ({ initialTab = 'books', onInventoryChanged }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { gemItems, userProfile } = useUser();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  const [activeTab, setActiveTab] = useState(
    TABS.some((tab) => tab.key === initialTab) ? initialTab : 'books'
  );
  const [packs, setPacks] = useState([]);
  const [itemCounts, setItemCounts] = useState({});
  const [toolsStatus, setToolsStatus] = useState('idle'); // idle | loading | ready | error

  const handleGemClick = (id) => {
    vibrate({ duration: 5 });
    window.ReactNativeWebView.postMessage(JSON.stringify({ 'type': 'iapPurchase', 'props': { itemId: id } }));
    pushNewBottomSheet(
      StoreBuyItemNewBottomSheet,
      {
        options: { productId: id, image_url: gemItems.find(gem => gem.product_id === id).image_url }
      },
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: false
      }
    );
  }

  const handleBookClick = (packageInfo) => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(
      StoreBuyBookNewBottomSheet,
      {
        options: packageInfo
      }
    );
  }

  const bookPackages = [
    { packageType: 'single', packageName: '단어장 1개', cost: 10, amount: 1, image: voca_1 },
    { packageType: 'small', packageName: '단어장 5개', cost: 50, amount: 5, image: voca_5 },
    { packageType: 'large', packageName: '단어장 10개', cost: 100, amount: 10, image: voca_10 },
  ];

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
    setToolsStatus('ready');
  }, []);

  useEffect(() => {
    if (activeTab !== 'tools') return;
    if (toolsStatus !== 'idle') return;
    loadTools();
  }, [activeTab, toolsStatus, loadTools]);

  const handlePackClick = (pack) => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(FarmItemPurchaseNewBottomSheet, {
      pack,
      owned: itemCounts?.[pack.item_type] ?? 0,
      onPurchased: (data) => {
        setItemCounts((prev) => ({ ...prev, [data.item_type]: data.item_qty }));
        onInventoryChanged?.(data);
      },
    });
  };

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
    const amount = Number(pack.amount) || 1;
    return (Number(pack.gem_price) || 0) / amount;
  };

  const bestSku = (group) => {
    if (group.packs.length < 2) return null;
    return group.packs.reduce((best, pack) => (unitPrice(pack) < unitPrice(best) ? pack : best)).sku;
  };

  return (
    <div className="flex flex-col w-full h-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* Header */}
      <div data-page-header className="relative flex items-center justify-center h-[55px] pt-[20px] px-[10px] pb-[14px]">
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            popNewFullSheet();
          }}
          className="absolute top-[18px] left-[10px] flex items-center gap-[4px] text-layout-gray-200 dark:text-layout-white p-[4px] rounded-[8px]"
          whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="text-[18px] font-[700] text-layout-black dark:text-layout-white">상점</h1>
        <div className="absolute top-[18px] right-[10px] flex items-center gap-[4px] text-layout-gray-200 dark:text-layout-white">
          <div id="gem-counter" className="flex gap-[5px] items-center">
            <img src={gem} alt="보석" className="w-[20px] h-[18px]" />
            <span className="text-layout-black dark:text-layout-white text-[16px] font-bold">{userProfile.gem_cnt}</span>
          </div>
        </div>
      </div>

      {/* 세그먼트 — 어느 탭에서도 보석 잔액은 헤더 같은 자리에 있는다 */}
      <div className="mx-[16px] mt-[8px] mb-[14px] h-[36px] shrink-0 flex p-[3px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark">
        {TABS.map((tab) => {
          const on = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                vibrate({ duration: 5 });
                setActiveTab(tab.key);
              }}
              className={`flex-1 flex items-center justify-center rounded-[8px] text-[13px] font-[700] ${on
                ? 'bg-layout-white dark:bg-primary-main-dark text-layout-black dark:text-layout-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:shadow-none'
                : 'text-layout-gray-400 dark:text-layout-gray-300'
                }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-[30px] p-[16px] pt-[2px] overflow-y-auto">
        {/* 단어장 탭 */}
        {activeTab === 'books' && (
          <div className="grid grid-cols-3 gap-[10px] gap-y-[20px]">
            {bookPackages.map((pkg, idx) => (
              <div key={idx} className="relative flex flex-col items-center justify-center gap-[10px]"
                onClick={() => handleBookClick(pkg)}
              >
                <img src={pkg.image} alt="" className="w-[80px] h-[80px] object-contain" />
                <div className="flex flex-col gap-[3px] items-center">
                  <h1 className="text-[14px] font-[600] text-layout-black dark:text-layout-white">{pkg.packageName}</h1>
                  <div className="flex items-center gap-[4px] px-[12px] py-[4px] bg-primary-main-600/10 rounded-[6px]">
                    <img src={gem} alt="heart" className="w-[14px] h-[12px]" />
                    <span className="text-[14px] font-[700] text-primary-main-600">{pkg.cost}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 농장 도구 탭 */}
        {activeTab === 'tools' && (
          <div className="flex flex-col gap-[16px]">
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
                {/* 보유 요약 — 산 도구가 여기로 날아온다 */}
                <div className="flex gap-[8px]">
                  {['SHOVEL', 'NUTRIENT', 'SHIELD'].map((type) => {
                    const count = itemCounts?.[type] ?? 0;
                    return (
                      <div
                        key={type}
                        id={`farm-item-hold-${type}`}
                        className="flex-1 flex flex-col items-center gap-[3px] px-[6px] pt-[8px] pb-[7px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
                      >
                        <img
                          src={FARM_ITEM_ASSETS[type]}
                          alt={FARM_ITEM_LABEL[type]}
                          draggable={false}
                          className="w-[28px] h-[28px] object-contain select-none"
                        />
                        <span className={`text-[15px] font-[800] ${count > 0 ? 'text-layout-black dark:text-layout-white' : 'text-layout-gray-200'}`}>
                          {count}
                        </span>
                        <span className="text-[10px] font-[600] text-layout-gray-400 dark:text-layout-gray-300">
                          {FARM_ITEM_LABEL[type]}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {packGroups.map((group) => {
                  const best = bestSku(group);
                  const owned = itemCounts?.[group.itemType] ?? 0;
                  return (
                    <div key={group.itemType} className="flex flex-col gap-[7px]">
                      <div className="flex items-baseline gap-[8px]">
                        <h4 className="text-[15px] font-[800] text-layout-black dark:text-layout-white">
                          {FARM_ITEM_LABEL[group.itemType]}
                        </h4>
                        <span className="flex-1 text-[11.5px] font-[500] text-layout-gray-300 truncate">
                          {FARM_ITEM_DESC[group.itemType]}
                        </span>
                        <span className={`shrink-0 px-[8px] py-[3px] rounded-full text-[11.5px] font-[700] ${owned > 0
                          ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600 dark:text-primary-main-400'
                          : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-300'
                          }`}>
                          보유 {owned}개
                        </span>
                      </div>

                      {group.packs.length > 1 ? (
                        <div className="flex gap-[8px]">
                          {group.packs.map((pack) => {
                            const isBest = pack.sku === best;
                            return (
                              <motion.button
                                key={pack.sku}
                                type="button"
                                whileTap={{ scale: 0.97 }}
                                onClick={() => handlePackClick(pack)}
                                className={`relative flex-1 flex flex-col items-center px-[6px] pt-[11px] pb-[9px] rounded-[12px] border-[1.5px] ${isBest
                                  ? 'border-primary-main-300 bg-primary-main-50 dark:bg-primary-main-dark dark:border-transparent'
                                  : 'border-[#EEEEEE] bg-layout-white dark:bg-layout-gray-dark dark:border-transparent'
                                  }`}
                              >
                                {isBest && (
                                  <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 whitespace-nowrap px-[7px] py-[2px] rounded-full bg-primary-main-600 text-layout-white text-[9px] font-[800]">
                                    가장 이득
                                  </span>
                                )}
                                <img
                                  src={FARM_ITEM_ASSETS[group.itemType]}
                                  alt=""
                                  draggable={false}
                                  className="w-[35px] h-[35px] mb-[5px] object-contain select-none"
                                />
                                <span className="text-[13px] font-[800] text-layout-black dark:text-layout-white">
                                  {pack.amount}개
                                </span>
                                <span className="mt-[2px] text-[9.5px] font-[600] text-layout-gray-200 dark:text-layout-gray-400">
                                  개당 {unitPrice(pack).toFixed(2)}
                                </span>
                                <span className={`mt-[6px] w-full h-[25px] rounded-[8px] flex items-center justify-center gap-[3px] text-[13px] font-[800] ${isBest
                                  ? 'bg-primary-main-600 text-layout-white'
                                  : 'bg-layout-gray-50 dark:bg-white/10 text-layout-black dark:text-layout-white'
                                  }`}>
                                  <img src={gem} alt="보석" className="w-[14px] h-[12px]" />
                                  {pack.gem_price}
                                </span>
                              </motion.button>
                            );
                          })}
                        </div>
                      ) : (
                        group.packs.map((pack) => (
                          <motion.button
                            key={pack.sku}
                            type="button"
                            whileTap={{ scale: 0.99 }}
                            onClick={() => handlePackClick(pack)}
                            className="flex items-center gap-[11px] p-[9px] rounded-[12px] border-[1.5px] border-[#EEEEEE] bg-layout-white dark:bg-layout-gray-dark dark:border-transparent text-left"
                          >
                            <img
                              src={FARM_ITEM_ASSETS[group.itemType]}
                              alt=""
                              draggable={false}
                              className="w-[40px] h-[40px] shrink-0 object-contain select-none"
                            />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13.5px] font-[800] text-layout-black dark:text-layout-white">
                                {FARM_ITEM_LABEL[group.itemType]} {pack.amount}개
                              </span>
                              <span className="block mt-[2px] text-[11px] font-[500] leading-[1.4] text-layout-gray-300">
                                {FARM_ITEM_DESC[group.itemType]}
                              </span>
                            </span>
                            <span className="shrink-0 h-[32px] px-[12px] rounded-[8px] bg-primary-main-600 text-layout-white flex items-center gap-[3px] text-[13px] font-[800]">
                              <img src={gem} alt="보석" className="w-[14px] h-[12px]" />
                              {pack.gem_price}
                            </span>
                          </motion.button>
                        ))
                      )}
                    </div>
                  );
                })}

                <p className="text-[10.5px] font-[400] leading-[1.6] text-layout-gray-300">
                  도구는 학습하면서도 얻을 수 있어요. 이파리가 되면 삽 1개, 당근이 되면 영양 회복제 1개를
                  단어마다 처음 한 번 드려요.
                </p>
              </>
            )}
          </div>
        )}

        {/* 보석 탭 */}
        {activeTab === 'gems' && (
          <div className="grid grid-cols-3 gap-[10px] gap-y-[20px]">
            {gemItems.map((gem) => (
              <div key={gem.id} className="relative flex flex-col items-center justify-center gap-[10px]"
                onClick={() => handleGemClick(gem.product_id)}
              >
                <img src={gem.image_url} alt="" className="w-[80px] h-[80px]" />
                {gem.bonus > 0 && (
                  <div className="absolute top-[5px] right-[5px] flex items-center justify-center w-[25px] h-[25px] rounded-[500px] bg-primary-main-600">
                    <span className="text-[10px] font-[600] text-layout-white">+{gem.bonus}</span>
                  </div>
                )}
                <div className="flex flex-col gap-[3px]">
                  <h1 className="text-[14px] font-[600] text-layout-black dark:text-layout-white">{gem.name}</h1>
                  <span className="text-center text-[14px] font-[700] text-primary-main-600">₩ {gem.price.toLocaleString('ko-KR')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StoreNewFullSheet;
