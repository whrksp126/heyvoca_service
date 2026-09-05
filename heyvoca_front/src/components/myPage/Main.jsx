import React, { useEffect, useState } from 'react';
import { CaretRight, Gift, Plus } from "@phosphor-icons/react";
import { motion } from 'framer-motion';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';

import AccountNewFullSheet from '../newfullsheet/AccountNewFullSheet';
import GemNewFullSheet from '../newfullsheet/GemNewFullSheet';
import InviteHistoryNewFullSheet from '../newfullsheet/InviteHistoryNewFullSheet';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';
import { AchievementDetailNewBottomSheet } from '../newBottomSheet/AchievementDetailNewBottomSheet';
import { GemPurchaseNewBottomSheet } from '../newBottomSheet/GemPurchaseNewBottomSheet';

import InviteKing from '../../assets/images/HeyCharacter/InviteKing.png';
import AttendanceKing from '../../assets/images/HeyCharacter/AttendanceKing.png';
import NoryeokKing from '../../assets/images/HeyCharacter/NoryeokKing.png';
import PerseveranceKing from '../../assets/images/HeyCharacter/PerseveranceKing.png';
import ReadingKing from '../../assets/images/HeyCharacter/ReadingKing.png';
import MemorizedKing from '../../assets/images/HeyCharacter/MemorizedKing.png';
import gemIcon from '../../assets/images/farm/icon-gem.png';
import goldenCarrotIcon from '../../assets/images/farm/icon-golden-carrot.png';
import emptyBookImg from '../../assets/images/voca_book_1.png';

import { FARM_ITEM_ASSETS } from '../farm/CropImage';
import { FARM_ITEM_LABEL, FARM_ITEM_DESC } from '../../utils/crop';
import { getFarmItemsApi, getFarmOverviewApi } from '../../api/farm';
import { getInvitesApi } from '../../api/auth';

// 업적 타입과 이미지 매핑 — 지금 서비스(홈 "나의 업적" 카드)의 것을 그대로 옮겼다 (시안 3절).
const ACHIEVEMENT_IMAGES = {
  '초대왕': InviteKing,
  '출석왕': AttendanceKing,
  '노력왕': NoryeokKing,
  '끈기왕': PerseveranceKing,
  '독서왕': ReadingKing,
  '암기왕': MemorizedKing,
};

// 등급색 — 0~2 동 · 3~5 은 · 6~9 금 · 10+ 무지개 (시안 3절 "그대로")
const getAchievementBackgroundStyle = (level) => {
  if (level >= 10) return { background: 'linear-gradient(135deg, #FF70D4 0%, #CD8DFF 50%, #74D5FF 100%)' };
  if (level >= 6) return { backgroundColor: '#F2D252' };
  if (level >= 3) return { backgroundColor: '#C0C0C0' };
  return { backgroundColor: '#D3A686' };
};

const getAchievementTextStyle = (level) => {
  if (level >= 10) {
    return {
      fontFamily: 'Cafe24Ssurround',
      background: 'linear-gradient(135deg, #FF70D4 0%, #CD8DFF 50%, #74D5FF 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      color: 'transparent',
    };
  }
  if (level >= 6) return { fontFamily: 'Cafe24Ssurround', color: '#F2D252' };
  if (level >= 3) return { fontFamily: 'Cafe24Ssurround', color: '#C0C0C0' };
  return { fontFamily: 'Cafe24Ssurround', color: '#D3A686' };
};

/**
 * 창고 문구 — 시안 4절 표 그대로. 상점의 가격 대신 "효능" 한 줄이 붙는다.
 * 이름·설명은 utils/crop.js 를 그대로 쓴다(상점·학습 결과와 같은 값이어야 한다).
 */
const WAREHOUSE = [
  { key: 'SHOVEL', image: FARM_ITEM_ASSETS.SHOVEL, label: FARM_ITEM_LABEL.SHOVEL, desc: FARM_ITEM_DESC.SHOVEL },
  { key: 'NUTRIENT', image: FARM_ITEM_ASSETS.NUTRIENT, label: FARM_ITEM_LABEL.NUTRIENT, desc: FARM_ITEM_DESC.NUTRIENT },
  { key: 'SHIELD', image: FARM_ITEM_ASSETS.SHIELD, label: FARM_ITEM_LABEL.SHIELD, desc: FARM_ITEM_DESC.SHIELD },
  { key: 'BOOK', image: emptyBookImg, label: '빈 단어장', desc: '직접 단어를 넣어 새 밭을 열어요' },
];

/** 섹션 머리 — 시안 .sechead (h4 15/800 · sub 11.5/500 · more 11.5/700 · own pill) */
const SectionHead = ({ title, sub, own, ownZero, moreLabel, onMore }) => (
  <div className="flex items-baseline gap-[8px] mb-[7px]">
    <h4 className="text-[15px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">{title}</h4>
    <span className="flex-1 text-[11.5px] font-[500] tracking-[-0.02em] text-layout-gray-300">{sub}</span>
    {own !== undefined && (
      <span
        className={`shrink-0 px-[8px] py-[3px] rounded-full text-[11.5px] font-[700] tracking-[-0.02em] ${
          ownZero
            ? 'text-layout-gray-300 bg-layout-gray-50 dark:bg-layout-gray-dark'
            : 'text-primary-main-600 bg-primary-main-100 dark:bg-primary-main-dark dark:text-[#FFAAE6]'
        }`}
      >
        {own}
      </span>
    )}
    {moreLabel && (
      <button
        type="button"
        onClick={onMore}
        className="shrink-0 flex items-center gap-[1px] text-[11.5px] font-[700] text-layout-gray-300"
      >
        {moreLabel}
        <CaretRight size={10} />
      </button>
    )}
  </div>
);

/** 창고 한 칸 — 그림과 보유 수가 한 줄, 이름과 효능이 아래 (시안 .inv 규격) */
const InventoryCard = ({ image, label, desc, count }) => (
  <div className="px-[12px] pt-[11px] pb-[12px] rounded-[14px] border-[1.5px] border-[#EEEEEE] dark:border-transparent dark:bg-layout-gray-dark min-w-0">
    <div className="flex items-center justify-between gap-[6px]">
      <img src={image} alt={label} draggable={false} className="w-[36px] h-[36px] shrink-0 object-contain select-none" />
      <span className={`shrink-0 text-[19px] font-[800] tracking-[-0.04em] ${count > 0 ? 'text-layout-black dark:text-layout-white' : 'text-layout-gray-200'}`}>
        {count}
        <span className="ml-[1px] text-[11px] font-[700] text-layout-gray-300">개</span>
      </span>
    </div>
    <div className="mt-[7px] text-[13px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">{label}</div>
    <div className="mt-[3px] min-h-[31px] text-[10.5px] font-[500] leading-[1.45] tracking-[-0.02em] text-layout-gray-300">{desc}</div>
  </div>
);

/**
 * 마이페이지 — 업적과 창고 둘뿐이다 (시안 1절 ①, 2절).
 * 밭 상태·연속 학습·농장 방문 달력·통계는 여기 두지 않는다 — 홈이 매일 보여준다.
 * 창고는 상세 화면을 두지 않고 이 안에서 다 보여준다 (시안 4절).
 */
const Main = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { userProfile, userMainPage, achievementCriteria } = useUser();
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  // 창고 — 농장 API 가 응답했을 때만 보여준다 (아직 없는 환경에서 0개로 오해시키지 않는다)
  const [farmItems, setFarmItems] = useState(null);
  // 황금 온실 — 황금 당근 개수는 /farm/overview 의 counts.golden 이다
  const [goldenCnt, setGoldenCnt] = useState(null);
  const [inviteCnt, setInviteCnt] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getFarmItemsApi();
      if (!alive) return;
      if (res?.code === 200) setFarmItems(res.data?.items || {});
    })();
    (async () => {
      const res = await getFarmOverviewApi();
      if (!alive) return;
      if (res?.code === 200) setGoldenCnt(res.data?.counts?.golden ?? 0);
    })();
    (async () => {
      const res = await getInvitesApi();
      if (!alive) return;
      if (res?.code === 200) setInviteCnt((res.data?.invites || []).length);
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

  // 업적 상세는 바텀시트다 — 시안 5절: 시트는 화면 일부만 덮으므로 하단 탭이 그대로 보인다.
  const openAchievementSheet = (type) => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(
      AchievementDetailNewBottomSheet,
      { selectedType: type },
      { isBackdropClickClosable: true, isDragToCloseEnabled: false }
    );
  };

  const goals = userMainPage?.goals || [];
  // "n / m 달성" — 달성한 레벨 합 / 전체 레벨 수. 기준표가 아직 없으면 표기하지 않는다.
  const achievedLv = goals.reduce((sum, g) => sum + (g.level || 0), 0);
  const totalLv = Object.values(achievementCriteria || {})
    .reduce((sum, levels) => sum + (Array.isArray(levels) ? levels.length : 0), 0);

  const goldenList = goldenCnt === null ? [] : Array.from({ length: Math.min(goldenCnt, 11) });

  return (
    <motion.main
      className="flex-grow"
      initial={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
      exit={{ opacity: 0, y: -20, transition: { duration: 0.2 } }}
    >
      {/* 맨 아래 "친구 초대하기"가 하단 네비게이션에 가려지지 않도록,
          홈(components/home/Main.jsx)이 쓰는 것과 같은 하단 여백 값을 그대로 재사용한다.
          84px = BottomNav 높이(60px) + 여유, 거기에 iOS 세이프에어리어(--safe-area-bottom)를 더한다. */}
      <div className="flex flex-col gap-[16px] px-[16px] pt-[16px] pb-[calc(84px+var(--safe-area-bottom))]">
        {/* 프로필 — 아바타를 두지 않는다 (시안 .prof). 눌러서 계정 풀시트로 */}
        <div
          onClick={() => openSheet(AccountNewFullSheet)}
          className="flex items-center gap-[12px] px-[16px] py-[14px] rounded-[14px] bg-layout-gray-50 dark:bg-layout-gray-dark"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[17px] font-[800] tracking-[-0.04em] text-layout-black dark:text-layout-white truncate">
              {userProfile?.username || '닉네임을 설정해주세요'}
            </div>
            <div className="mt-[2px] text-[12px] font-[500] tracking-[-0.02em] text-layout-gray-300 truncate">
              {userProfile?.email || '로그인 필요'}
            </div>
          </div>
          <CaretRight size={15} className="shrink-0 text-layout-gray-200" />
        </div>

        {/* 나의 업적 — 지금 서비스의 홈 카드를 그대로 옮겼다 (시안 3절) */}
        <div>
          <SectionHead
            title="나의 업적"
            sub={totalLv > 0 ? `${achievedLv} / ${totalLv} 달성` : ''}
            moreLabel="달성 기준"
            onMore={() => openAchievementSheet(goals[0]?.type || '초대왕')}
          />
          <div className="grid grid-cols-3 gap-x-[8px] gap-y-[18px]">
            {goals.map((goal) => (
              <div
                key={goal.type}
                onClick={() => openAchievementSheet(goal.type)}
                className="flex flex-col items-center gap-[12px] cursor-pointer"
                style={goal.level === 0 ? { opacity: 0.3 } : {}}
              >
                <div className="relative w-[60px] h-[60px]">
                  <div className="w-[60px] h-[60px] rounded-full" style={getAchievementBackgroundStyle(goal.level)} />
                  <img
                    src={ACHIEVEMENT_IMAGES[goal.type]}
                    alt=""
                    draggable={false}
                    className="absolute bottom-[4px] left-1/2 -translate-x-1/2 w-[52px] select-none"
                  />
                  <span
                    className="
                      absolute bottom-[-9px] left-1/2 -translate-x-1/2
                      text-[12px] font-[800] whitespace-nowrap
                      [text-shadow:_-1.2px_-1.2px_0_var(--layout-white),_1.2px_-1.2px_0_var(--layout-white),_-1.2px_1.2px_0_var(--layout-white),_1.2px_1.2px_0_var(--layout-white)]
                    "
                    style={{ ...getAchievementTextStyle(goal.level), fontFamily: 'Cafe24Ssurround, sans-serif' }}
                  >
                    <span className="text-[10px]" style={{ fontFamily: 'Cafe24Ssurround' }}>LV.</span>{goal.level}
                  </span>
                </div>
                <span className="text-[12px] font-[600] tracking-[-0.02em] text-layout-black dark:text-layout-white">
                  {goal.type}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 창고 — 상세 화면 없이 여기서 다 보여준다 (시안 4절) */}
        {farmItems && (
          <div>
            <SectionHead
              title="창고"
              sub="도구 · 빈 단어장"
              moreLabel="상점"
              onMore={() => openSheet(StoreNewFullSheet, {
                initialTab: 'tools',
                // 상점에서 도구를 사면 창고 숫자도 같이 오른다(닫고 다시 들어오지 않아도 된다)
                onInventoryChanged: (data) =>
                  setFarmItems((prev) => ({ ...(prev || {}), [data.item_type]: data.item_qty })),
              })}
            />
            <div className="grid grid-cols-2 gap-[8px]">
              {WAREHOUSE.map((item) => (
                <InventoryCard
                  key={item.key}
                  image={item.image}
                  label={item.label}
                  desc={item.desc}
                  count={item.key === 'BOOK' ? (userProfile?.book_cnt ?? 0) : (farmItems?.[item.key] ?? 0)}
                />
              ))}
            </div>
          </div>
        )}

        {/* 보석 — 보유량 · 충전 · 내역 (시안 4절) */}
        <div>
          <SectionHead
            title="보석"
            sub=""
            moreLabel="내역"
            onMore={() => openSheet(GemNewFullSheet)}
          />
          <div className="flex items-center gap-[12px] p-[16px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
            <img src={gemIcon} alt="보석" draggable={false} className="w-[44px] h-[44px] shrink-0 object-contain select-none" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-[600] tracking-[-0.02em] text-layout-gray-300">보유 보석</div>
              <div className="text-[24px] font-[800] leading-[1.15] tracking-[-0.04em] text-layout-black dark:text-layout-white">
                {userProfile?.gem_cnt ?? 0}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                vibrate({ duration: 5 });
                pushNewBottomSheet(GemPurchaseNewBottomSheet, {}, {
                  isBackdropClickClosable: true,
                  isDragToCloseEnabled: true,
                });
              }}
              className="shrink-0 flex items-center gap-[2px] h-[32px] px-[12px] rounded-[8px] bg-layout-white dark:bg-[#333333] text-[12px] font-[700] text-layout-gray-400 dark:text-layout-gray-200"
            >
              충전
              <CaretRight size={11} />
            </button>
          </div>
        </div>

        {/* 황금 온실 — 조작 없음. 180일 이상 안정된 단어만 들어온다 (시안 4절) */}
        <div>
          <SectionHead
            title="황금 온실"
            sub="180일 이상 안정된 단어"
            own={`${goldenCnt ?? 0}개`}
            ownZero={!goldenCnt}
          />
          <div className="grid grid-cols-4 gap-[8px]">
            {goldenList.map((_, idx) => (
              <div
                key={idx}
                className="aspect-square rounded-[12px] bg-[#FFFBEE] dark:bg-secondary-yellow-dark flex items-center justify-center"
              >
                <img src={goldenCarrotIcon} alt="황금 당근" draggable={false} className="w-[38px] h-[38px] object-contain select-none" />
              </div>
            ))}
            <div className="aspect-square rounded-[12px] bg-[#F7F7F7] dark:bg-[#1E1E1E] flex items-center justify-center">
              <Plus size={16} className="text-layout-gray-100" />
            </div>
          </div>
        </div>

        {/* 친구 초대 — 맨 아래 한 줄 (시안 2절) */}
        <div
          onClick={() => openSheet(InviteHistoryNewFullSheet)}
          className="flex items-center gap-[10px] px-[14px] py-[13px] rounded-[14px] bg-layout-gray-50 dark:bg-layout-gray-dark"
        >
          <Gift size={17} className="shrink-0 text-layout-gray-400" />
          <span className="flex-1 text-[13.5px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
            친구 초대하기
          </span>
          {inviteCnt !== null && (
            <span className="text-[12px] font-[700] text-layout-gray-300">{inviteCnt}명 초대함</span>
          )}
          <CaretRight size={13} className="shrink-0 text-layout-gray-200" />
        </div>
      </div>
    </motion.main>
  );
};

export default Main;
