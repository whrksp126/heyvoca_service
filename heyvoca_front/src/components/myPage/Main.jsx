import React, { useEffect, useState } from 'react';
import { CaretRight, EnvelopeSimple } from "@phosphor-icons/react";
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';

import AccountNewFullSheet from '../newfullsheet/AccountNewFullSheet';
import GemNewFullSheet from '../newfullsheet/GemNewFullSheet';
import InviteHistoryNewFullSheet from '../newfullsheet/InviteHistoryNewFullSheet';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';
import ReviewScheduleContent from './ReviewScheduleContent';
import gemImg from '../../assets/images/gem.png';
import emptyBookImg from '../../assets/images/voca_book_1.png';
import { FARM_ITEM_LABEL, FARM_ITEM_DESC } from '../../utils/crop';
import { FARM_ITEM_ASSETS } from '../farm/CropImage';
import { getFarmItemsApi } from '../../api/farm';

/** 창고 한 칸 — 그림과 보유 수가 한 줄, 이름과 효능이 아래 (시안 .inv 규격) */
const InventoryCard = ({ image, label, desc, count }) => (
  <div className="p-[11px] pb-[12px] px-[12px] rounded-[14px] border-[1.5px] border-[#EEEEEE] dark:border-transparent dark:bg-layout-gray-dark min-w-0">
    <div className="flex items-center justify-between gap-[6px]">
      <img src={image} alt={label} draggable={false} className="w-[36px] h-[36px] shrink-0 object-contain select-none" />
      <span className={`shrink-0 text-[19px] font-[800] ${count > 0 ? 'text-layout-black dark:text-layout-white' : 'text-layout-gray-200'}`}>
        {count}
        <span className="ml-[1px] text-[11px] font-[700] text-layout-gray-300">개</span>
      </span>
    </div>
    <div className="mt-[7px] text-[13px] font-[800] text-layout-black dark:text-layout-white">{label}</div>
    <div className="mt-[3px] min-h-[31px] text-[10.5px] font-[500] leading-[1.45] text-layout-gray-300">{desc}</div>
  </div>
);

const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { userProfile } = useUser();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();

  // 창고 — 농장 API 가 응답했을 때만 보여준다 (아직 없는 환경에서 0개로 오해시키지 않는다)
  const [farmItems, setFarmItems] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getFarmItemsApi();
      if (!alive) return;
      if (res?.code === 200) setFarmItems(res.data?.items || {});
    })();
    return () => { alive = false; };
  }, []);

  const openSheet = (Component, props = {}) => {
    vibrate({ duration: 5 });
    pushNewFullSheet(Component, props, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  return (
    <motion.main
      className="flex-grow"
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      <div className="flex flex-col gap-[16px] px-[16px] py-[20px]">
        {/* 프로필 카드 → 계정 시트 */}
        <div
          onClick={() => openSheet(AccountNewFullSheet)}
          className="flex items-center justify-between p-[20px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
        >
          <div className="flex flex-col gap-[2px] min-w-0">
            <span className="text-[18px] font-[800] text-layout-black dark:text-layout-white truncate">
              {userProfile?.username || '닉네임을 설정해주세요'}
            </span>
            <span className="text-[13px] font-[400] text-layout-gray-300 truncate">
              {userProfile?.email || '로그인 필요'}
            </span>
          </div>
          <CaretRight className="text-[20px] text-layout-gray-300 shrink-0" />
        </div>

        {/* 보석 / 초대하기 퀵액션 */}
        <div className="grid grid-cols-2 gap-[10px]">
          <div
            onClick={() => openSheet(GemNewFullSheet)}
            className="flex items-center justify-between p-[16px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
          >
            <div className="flex items-center gap-[8px] min-w-0">
              <img src={gemImg} alt="보석" className="w-[20px] h-[18px] shrink-0" />
              <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white">보석</span>
            </div>
            <span className="text-[14px] font-[700] text-primary-main-600 shrink-0">
              {userProfile?.gem_cnt ?? 0}
            </span>
          </div>
          <div
            onClick={() => openSheet(InviteHistoryNewFullSheet)}
            className="flex items-center justify-between p-[16px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark"
          >
            <div className="flex items-center gap-[8px] min-w-0">
              <EnvelopeSimple weight="fill" className="text-[20px] text-primary-main-600 shrink-0" />
              <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white">초대하기</span>
            </div>
            <CaretRight className="text-[16px] text-layout-gray-300 shrink-0" />
          </div>
        </div>

        {/* 창고 — 상세 화면 없이 여기서 다 보여준다 */}
        {farmItems && (
          <div className="flex flex-col gap-[12px]">
            <div className="flex items-baseline gap-[8px]">
              <h3 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">창고</h3>
              <span className="flex-1 text-[11.5px] font-[500] text-layout-gray-300">도구 · 빈 단어장</span>
              <button
                type="button"
                onClick={() => openSheet(StoreNewFullSheet, {
                  initialTab: 'tools',
                  // 상점에서 도구를 사면 창고 숫자도 같이 오른다(닫고 다시 들어오지 않아도 된다)
                  onInventoryChanged: (data) =>
                    setFarmItems((prev) => ({ ...(prev || {}), [data.item_type]: data.item_qty })),
                })}
                className="shrink-0 flex items-center gap-[1px] text-[11.5px] font-[700] text-layout-gray-300"
              >
                상점
                <CaretRight className="text-[10px]" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-[8px]">
              <InventoryCard
                image={FARM_ITEM_ASSETS.SHOVEL}
                label={FARM_ITEM_LABEL.SHOVEL}
                desc={FARM_ITEM_DESC.SHOVEL}
                count={farmItems?.SHOVEL ?? 0}
              />
              <InventoryCard
                image={FARM_ITEM_ASSETS.NUTRIENT}
                label={FARM_ITEM_LABEL.NUTRIENT}
                desc={FARM_ITEM_DESC.NUTRIENT}
                count={farmItems?.NUTRIENT ?? 0}
              />
              <InventoryCard
                image={FARM_ITEM_ASSETS.SHIELD}
                label={FARM_ITEM_LABEL.SHIELD}
                desc={FARM_ITEM_DESC.SHIELD}
                count={farmItems?.SHIELD ?? 0}
              />
              <InventoryCard
                image={emptyBookImg}
                label="빈 단어장"
                desc="직접 단어를 넣어 새 밭을 열어요."
                count={userProfile?.book_cnt ?? 0}
              />
            </div>
          </div>
        )}

        {/* 통계 — 풀시트로 들어가지 않고 마이페이지에서 바로 상세 표시 */}
        <div className="flex flex-col gap-[12px]">
          <h3 className="text-[15px] font-[700] text-layout-black dark:text-layout-white">통계</h3>
          <ReviewScheduleContent />
        </div>
      </div>
    </motion.main>
  );
};

export default Main;
