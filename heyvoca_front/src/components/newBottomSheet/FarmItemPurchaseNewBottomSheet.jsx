import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Info, Leaf, Carrot, Gift, WarningCircle, ClockCounterClockwise, GearSix, Lock, CaretRight,
} from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { useGemAnimation } from '../../context/GemAnimationContext';
import { purchaseFarmItemApi, getRottenPlantsApi } from '../../api/farm';
import { FARM_ITEM_ASSETS } from '../farm/CropImage';
import { FARM_ITEM_LABEL } from '../../utils/crop';
import { vibrate } from '../../utils/osFunction';
import iconGem from '../../assets/images/farm/icon-gem.png';

/**
 * 농장 도구 상세 시트 · 구매 확인 · 결과.
 *
 * 시안 정본: shop.txt §2(상세 시트 3종) · §5(가격표) · §6(하루 상한) · §8(고지 항목),
 *            shop-purchase.txt §1(확인 → 완료 → 실패 → 한도) · §3(확인 시트의 세 값),
 *            shop-result.txt §2⑤(아이템 성공) · §3⑦⑨(부족 · 실패).
 *
 * 한 시트 안에서 detail → confirm → done/error/short/capped 로 상태만 바꾼다.
 * 시안이 "구매 버튼이 화면 맨 아래고 그 위가 전부 설명"이라고 못 박았기 때문에
 * 설명과 구매를 두 화면으로 쪼개지 않는다(§8).
 */

// ── 시안 문구 ────────────────────────────────────────────────
// 정식 이름은 utils/crop.js 의 FARM_ITEM_LABEL 하나뿐이다(시안 §1·§2 와 같은 이름으로 통일).
// 여기서는 그 이름을 그대로 다시 내보내 상점 본문과 시트가 같은 값을 참조하게만 한다.
export const ITEM_NAME = FARM_ITEM_LABEL;

/** 보유 요약 칸처럼 폭이 좁은 자리의 짧은 이름 (시안 ②의 hold) */
export const ITEM_SHORT = {
  SHOVEL: '새심기 삽',
  NUTRIENT: '영양 회복제',
  SHIELD: '보호권',
};

/** 섹션 제목 옆 한 줄 (시안 ② sechead .sub) */
export const ITEM_TAG = {
  SHOVEL: '썩은 작물을 다시 심어요',
  NUTRIENT: '썩기 전 단계를 되살려요',
  SHIELD: '',
};

/** 상세 시트 머리말 두 줄 (시안 ④⑤⑥ shead .d) */
const ITEM_LEDE = {
  SHOVEL: ['썩은 작물을 정리하고', '씨앗부터 다시 심어요'],
  NUTRIENT: ['썩기 전 성장 단계를', '그대로 되살려요'],
  SHIELD: ['하루를 놓쳐도', '연속 기록이 이어져요'],
};

// ── 공용 조각 ────────────────────────────────────────────────

/** 보석 아이콘 + 숫자 (시안 gm) */
export const Gem = ({ n, size = 'm', className = '' }) => {
  const px = size === 's' ? 'w-[14px] h-[14px]' : size === 'l' ? 'w-[20px] h-[20px]' : 'w-[17px] h-[17px]';
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`}>
      <img src={iconGem} alt="보석" draggable={false} className={`${px} shrink-0 object-contain select-none`} />
      {n}
    </span>
  );
};

const Em = ({ children }) => (
  <b className="font-[800] text-layout-black dark:text-layout-white">{children}</b>
);

const SpecRow = ({ k, children }) => (
  <div className="flex gap-[10px] py-[9px] border-b border-[#F4F4F4] dark:border-white/[0.06] text-[12px] leading-[1.5] tracking-[-0.02em]">
    <span className="w-[74px] shrink-0 font-[700] text-layout-gray-300">{k}</span>
    <span className="flex-1 font-[600] text-layout-gray-500 dark:text-layout-gray-200">{children}</span>
  </div>
);

/** 시안 .row 의 아이콘 원. 인라인 색을 쓰지 않는 이유는 시안 주석 그대로 — 다크 규칙이 이겨야 한다. */
const CI_CLASS = {
  mint: 'bg-status-success-100 dark:bg-status-success-dark',
  blue: 'bg-secondary-blue-100 dark:bg-secondary-blue-dark',
  purple: 'bg-[#F0EDFB] dark:bg-secondary-purple-dark',
  yellow: 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark',
  gray: 'bg-layout-gray-50 dark:bg-[#333333]',
};

/** 시안 .rows — 보더가 아니라 면으로 나뉘는 목록 (§9 다크 규칙) */
export const Rows = ({ items }) => (
  <div className="rounded-[12px] border border-[#EEEEEE] dark:border-transparent dark:bg-layout-gray-dark overflow-hidden">
    {items.map((it, idx) => (
      <div
        key={it.key || it.title}
        onClick={it.onClick}
        className={`flex items-center gap-[10px] px-[12px] py-[10px] ${idx > 0 ? 'border-t border-[#F4F4F4] dark:border-white/[0.07]' : ''}`}
      >
        <span className={`flex items-center justify-center w-[28px] h-[28px] shrink-0 rounded-[8px] ${CI_CLASS[it.tint]}`}>
          {it.icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[12.5px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
            {it.title}
          </span>
          {it.desc && (
            <span className="block mt-[1px] text-[10.5px] font-[500] tracking-[-0.02em] text-layout-gray-300">
              {it.desc}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 flex items-center gap-[3px] text-[12.5px] ${it.mut ? 'font-[700] text-layout-gray-200' : 'font-[800] text-layout-black dark:text-layout-white'}`}
        >
          {it.value}
        </span>
      </div>
    ))}
  </div>
);

const SLabel = ({ children }) => (
  <div className="mt-[16px] mb-[8px] text-[11.5px] font-[800] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
    {children}
  </div>
);

const InfoBox = ({ tone = 'gray', icon, children }) => {
  const tint = {
    gray: 'bg-[#F7F7F7] dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-300',
    blue: 'bg-secondary-blue-100 dark:bg-secondary-blue-dark text-[#175CD3] dark:text-secondary-blue-400',
    warn: 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark text-[#B54708] dark:text-[#FDB022]',
  }[tone];
  return (
    <div className={`flex gap-[8px] mt-[12px] px-[11px] py-[10px] rounded-[10px] text-[11px] leading-[1.55] tracking-[-0.02em] ${tint}`}>
      <span className="shrink-0 mt-[1px]">{icon}</span>
      <span>{children}</span>
    </div>
  );
};

/**
 * 하루 상한 막대 (시안 §6).
 * 한도는 닿기 전에 보여야 의미가 있어서, 남았을 때도 늘 띄운다.
 * `next` 를 주면 "4 → 7 / 30" 처럼 살 뒤의 값을 미리 적는다.
 */
export const CapBar = ({ spent, limit, next = null, className = '' }) => {
  if (!Number.isFinite(spent) || !Number.isFinite(limit) || limit <= 0) return null;
  const shown = Number.isFinite(next) ? next : spent;
  const ratio = Math.min(1, Math.max(0, shown / limit));
  const hot = shown >= limit - 5;
  return (
    <div className={`flex items-center gap-[9px] ${className}`}>
      <span className="shrink-0 whitespace-nowrap text-[10.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-300">
        오늘 도구 구매{' '}
        <b className="font-[700] text-layout-gray-400 dark:text-layout-gray-200">
          {Number.isFinite(next) ? `${spent} → ${next}` : spent}
        </b>{' '}
        / {limit} 보석
      </span>
      <span className="flex-1 h-[5px] rounded-full bg-[#F0F0F0] dark:bg-layout-gray-dark overflow-hidden">
        <span
          className={`block h-full rounded-full ${hot ? 'bg-secondary-yellow-600' : 'bg-primary-main-300'}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </span>
    </div>
  );
};

/** 상품 카드 (시안 .prod). variant: '' | 'best'(가장 이득 진열) | 'sel'(시트에서 고른 묶음) */
export const PackCard = ({ pack, itemType, ribbon, variant = '', onClick, disabled = false }) => {
  const best = variant === 'best';
  const sel = variant === 'sel';
  const box = sel
    ? 'border-[2px] border-primary-main-600 px-[5px] pt-[10px] pb-[8px] bg-layout-white dark:bg-primary-main-dark'
    : best
      ? 'border-[1.5px] border-primary-main-300 dark:border-transparent px-[6px] pt-[11px] pb-[9px] bg-[#FFF9FD] dark:bg-primary-main-dark'
      : 'border-[1.5px] border-[#EEEEEE] dark:border-transparent px-[6px] pt-[11px] pb-[9px] bg-layout-white dark:bg-layout-gray-dark';
  const per = Number(pack.per_unit);
  const unit = Number.isFinite(per) && per > 0
    ? per
    : (Number(pack.gem_price) || 0) / (Number(pack.amount) || 1);
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`relative flex-1 min-w-0 flex flex-col items-center rounded-[12px] ${box} ${disabled ? 'opacity-45' : ''}`}
    >
      {ribbon && (
        <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 whitespace-nowrap px-[7px] py-[2px] rounded-full bg-primary-main-600 text-layout-white text-[9px] font-[800] tracking-[-0.02em]">
          {ribbon}
        </span>
      )}
      <img
        src={FARM_ITEM_ASSETS[itemType]}
        alt=""
        draggable={false}
        className="w-[35px] h-[35px] mb-[5px] object-contain select-none"
      />
      <span className="text-[13px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
        {pack.amount}개
      </span>
      <span className="mt-[2px] text-[9.5px] font-[600] tracking-[-0.02em] text-[#BBBBBB] dark:text-layout-gray-400">
        개당 {unit.toFixed(2)}
      </span>
      <span
        className={`mt-[6px] w-full h-[25px] rounded-[8px] flex items-center justify-center text-[13px] font-[800] ${
          best || sel
            ? 'bg-primary-main-600 text-layout-white'
            : 'bg-layout-gray-50 dark:bg-[#333333] text-layout-black dark:text-layout-white'
        }`}
      >
        <Gem n={pack.gem_price} size="s" />
      </span>
    </motion.button>
  );
};

/** 시안 .btn — 기존 서비스 규격(h48 · r10 · 15.5px 700) */
const Btn = ({ tone = 'sec', onClick, disabled, children, wide = false }) => (
  <motion.button
    type="button"
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    whileTap={disabled ? undefined : { scale: 0.97 }}
    className={`${wide ? 'w-full' : 'flex-1'} h-[48px] rounded-[10px] flex items-center justify-center gap-[5px] text-[15.5px] font-[700] tracking-[-0.03em] ${
      tone === 'pri'
        ? 'bg-primary-main-600 text-layout-white'
        : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'
    } ${disabled ? 'opacity-40' : ''}`}
  >
    {children}
  </motion.button>
);

/** 결제 요약 한 줄 (시안 .recv .r) */
const RecvRow = ({ k, children }) => (
  <div className="flex items-center gap-[8px] text-[12.5px] tracking-[-0.02em]">
    <span className="flex-1 font-[600] text-layout-gray-400 dark:text-layout-gray-300">{k}</span>
    <span className="flex items-center gap-[4px] font-[800] text-layout-black dark:text-layout-white">
      {children}
    </span>
  </div>
);

const Arrow = () => <span className="font-[700] text-layout-gray-200">→</span>;

// ── 날짜 ────────────────────────────────────────────────────
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** 다음 주간 지급일 = 다음 월요일 (기획 11.3 — 매주 첫 접속에 1개) */
const nextMonday = (from = new Date()) => {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
};

const formatDay = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;

/** "다음 지급 8월 4일 (월)" — 상점 도구 탭의 보호권 카드도 같은 문장을 쓴다 */
export const nextGrantLabel = () => `다음 지급 ${formatDay(nextMonday())}`;

// ── 본체 ────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {object[]} props.packs        같은 아이템의 묶음 전부 (서버 순서 그대로)
 * @param {object}   props.pack         단일 상품으로 열 때 (packs 없이도 동작)
 * @param {string}   props.initialSku   처음 선택할 묶음
 * @param {number}   props.owned        현재 보유 개수
 * @param {object}   props.spend        하루 상한 { spent, limit } — 서버가 주면 §6 막대를 띄운다
 * @param {function} props.onPurchased  성공 시 서버 응답 data 그대로
 * @param {function} props.onNeedGems   보석이 모자랄 때 보석 탭으로 (없으면 버튼을 숨긴다)
 * @param {function} props.onGoRotten   "썩은 작물 보러 가기" (없으면 상점을 닫는 것으로 대신한다)
 */
export const FarmItemPurchaseNewBottomSheet = ({
  packs,
  pack,
  initialSku,
  owned = 0,
  spend = null,
  onPurchased,
  onNeedGems,
  onGoRotten,
}) => {
  "use memo";

  const { popNewBottomSheet } = useNewBottomSheetActions();
  const { popNewFullSheet } = useNewFullSheetActions();
  const { userProfile, setUserProfile } = useUser();
  const { triggerFlyingAnimation } = useGemAnimation();

  const list = (Array.isArray(packs) && packs.length > 0) ? packs : (pack ? [pack] : []);
  const [sku, setSku] = useState(initialSku || pack?.sku || list[0]?.sku);
  const [status, setStatus] = useState('detail'); // detail | confirm | loading | done | error | short | capped
  const [result, setResult] = useState(null);
  const [rottenCount, setRottenCount] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // 결과 화면의 "지금 할 수 있는 일"(시안 shop-result §2⑤)은 보유 수가 아니라
  // 썩은 작물 수로 적는다. limit=1 이라 목록은 거의 읽지 않고 total 만 받아 온다.
  useEffect(() => {
    if (status !== 'done') return;
    let alive = true;
    (async () => {
      const res = await getRottenPlantsApi({ limit: 1 });
      if (alive && res?.code === 200) setRottenCount(Number(res.data?.total) || 0);
    })();
    return () => { alive = false; };
  }, [status]);

  if (list.length === 0) return null;

  const selected = list.find((p) => p.sku === sku) || list[0];
  const itemType = selected.item_type;
  const name = ITEM_NAME[itemType] || '농장 도구';
  const image = FARM_ITEM_ASSETS[itemType];
  const cost = Number(selected.gem_price) || 0;
  const amount = Number(selected.amount) || 0;
  const gemCnt = Number(userProfile?.gem_cnt) || 0;
  const shortage = Math.max(0, cost - gemCnt);

  const capSpent = Number(spend?.spent);
  const capLimit = Number(spend?.limit);
  const hasCap = Number.isFinite(capSpent) && Number.isFinite(capLimit) && capLimit > 0;
  const overCap = hasCap && capSpent + cost > capLimit;

  // 개당 단가가 가장 낮은 묶음에만 리본을 단다 (시안 §5 — 한 번 말하고 끝낸다)
  const unitOf = (p) => {
    const per = Number(p.per_unit);
    if (Number.isFinite(per) && per > 0) return per;
    return (Number(p.gem_price) || 0) / (Number(p.amount) || 1);
  };
  const ribbonSku = list.length > 1
    ? list.reduce((best, p) => (unitOf(p) < unitOf(best) ? p : best)).sku
    : null;

  const close = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
  };

  const goRotten = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
    if (onGoRotten) onGoRotten();
    else popNewFullSheet();
  };

  const openConfirm = () => {
    vibrate({ duration: 5 });
    if (overCap) { setStatus('capped'); return; }
    if (gemCnt < cost) { setStatus('short'); return; }
    setStatus('confirm');
  };

  const handleBuy = async () => {
    vibrate({ duration: 5 });
    if (status === 'loading') return;
    if (overCap) { setStatus('capped'); return; }
    if (gemCnt < cost) { setStatus('short'); return; }

    setStatus('loading');
    const res = await purchaseFarmItemApi({ sku: selected.sku, qty: 1 });

    // fetchDataAsync 는 비-2xx 도 그대로 돌려준다 — code 로 확인한다.
    if (res?.code !== 200 || !res?.data) {
      setErrorMessage(res?.message || '연결이 잠시 끊겼어요.');
      setStatus('error');
      return;
    }

    const data = res.data;
    setResult(data);
    setStatus('done');
    setUserProfile((prev) => ({ ...prev, gem_cnt: data.gem_cnt }));
    if (onPurchased) onPurchased(data);

    // 받은 도구가 보유 요약으로 날아간다. 대상이 없으면 상단 보석 카운터로 보낸다.
    const holdSelector = `#farm-item-hold-${itemType}`;
    const target = document.querySelector(holdSelector) ? holdSelector : '#gem-counter';
    triggerFlyingAnimation({
      imageUrl: image,
      quantity: Math.min(5, Math.max(1, Math.round(amount / 5))),
      startPoint: { type: 'position', value: 'center-center' },
      endPoint: { type: 'element', value: target },
      animationPreset: 'simple-fly',
      duration: 0.9,
    });
  };

  // 시트는 폰 배경(#111)보다 밝아야 떠 보인다 (시안 §9 — 바텀시트 다크 #1C1C1C)
  const shell = 'flex flex-col px-[20px] pt-[10px] pb-[20px] bg-layout-white dark:bg-[#1C1C1C]';
  const Grab = () => (
    <span className="w-[38px] h-[4px] mx-auto mb-[12px] rounded-full bg-layout-gray-100 dark:bg-[#3A3A3A]" />
  );

  // ── 결과: 성공 (시안 shop-purchase ② · shop-result ⑤) ─────
  if (status === 'done' && result) {
    return (
      <div className={shell}>
        <Grab />
        <div className="relative text-center pt-[6px]">
          <span className="pointer-events-none absolute left-1/2 top-[44px] -translate-x-1/2 -translate-y-1/2 w-[190px] h-[190px] rounded-full bg-[radial-gradient(circle,rgba(255,189,235,0.55)_0%,rgba(255,238,250,0)_68%)]" />
          <motion.img
            src={image}
            alt={name}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            draggable={false}
            className="relative w-[96px] h-[96px] mx-auto mb-[14px] object-contain select-none"
          />
          <h3 className="relative text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
            {name} <span className="text-primary-main-600">{result.granted}개</span>를<br />받았어요
          </h3>
          <div className="relative inline-flex items-center gap-[7px] mt-[14px] px-[14px] py-[7px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[12.5px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
            <span>보유 {owned}개</span>
            <span className="text-layout-gray-200">→</span>
            <span className="font-[800] text-primary-main-600">{result.item_qty}개</span>
          </div>
          {itemType !== 'SHIELD' && rottenCount > 0 && (
            <p className="relative mt-[8px] text-[12.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
              썩은 작물 <b className="font-[800] text-layout-black dark:text-layout-white">{rottenCount}개</b>를
              {itemType === 'SHOVEL' ? ' 지금 다시 심을 수 있어요' : ' 지금 되살릴 수 있어요'}
            </p>
          )}
        </div>

        <div className="flex gap-[10px] mt-[16px]">
          {itemType !== 'SHIELD' && rottenCount > 0 ? (
            <>
              <Btn tone="sec" onClick={close}>확인</Btn>
              <Btn tone="pri" onClick={goRotten}>썩은 작물 보러 가기</Btn>
            </>
          ) : (
            <Btn tone="pri" wide onClick={close}>확인</Btn>
          )}
        </div>

        <p className="mt-[10px] text-center text-[10.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-300">
          남은 보석 <b className="font-[700] text-layout-gray-400 dark:text-layout-gray-200">{result.gem_cnt}</b>
          {hasCap && (
            <> · 오늘 도구 구매 <b className="font-[700] text-layout-gray-400 dark:text-layout-gray-200">{capSpent + cost} / {capLimit}</b></>
          )}
        </p>
      </div>
    );
  }

  // ── 결과: 보석 부족 (시안 shop-result ⑦) ──────────────────
  if (status === 'short') {
    return (
      <div className={shell}>
        <Grab />
        <div className="text-center pt-[6px]">
          <span className="flex items-center justify-center w-[84px] h-[84px] mx-auto mt-[2px] mb-[14px] rounded-full bg-secondary-yellow-100 dark:bg-secondary-yellow-dark">
            <WarningCircle size={34} weight="fill" className="text-secondary-yellow-600" />
          </span>
          <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
            보석이 <span className="text-primary-main-600">{shortage}개</span> 모자라요
          </h3>
        </div>
        <div className="flex gap-[10px] mt-[16px]">
          <Btn tone="sec" onClick={close}>나중에 하기</Btn>
          {onNeedGems && (
            <Btn tone="pri" onClick={() => { vibrate({ duration: 5 }); popNewBottomSheet(); onNeedGems(); }}>
              보석 충전
            </Btn>
          )}
        </div>
      </div>
    );
  }

  // ── 결과: 하루 한도 (시안 shop-purchase ④) ────────────────
  if (status === 'capped') {
    return (
      <div className={shell}>
        <Grab />
        <div className="text-center pt-[6px]">
          <span className="flex items-center justify-center w-[84px] h-[84px] mx-auto mt-[2px] mb-[14px] rounded-full bg-secondary-yellow-100 dark:bg-secondary-yellow-dark">
            <Lock size={32} weight="fill" className="text-secondary-yellow-600" />
          </span>
          <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
            오늘은 여기까지 샀어요
          </h3>
          <p className="mt-[8px] text-[12.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
            하루 도구 구매 한도인 <b className="font-[800] text-layout-black dark:text-layout-white">{capLimit}보석</b>을 다 썼어요.
            <br />내일 0시에 다시 살 수 있어요.
          </p>
        </div>

        <CapBar spent={capSpent} limit={capLimit} className="mt-[16px]" />

        <SLabel>지금 필요하면</SLabel>
        <Rows
          items={[{
            key: 'setting',
            tint: 'gray',
            icon: <GearSix size={15} weight="fill" className="text-layout-gray-400" />,
            title: '한도 바꾸기',
            desc: '설정 · 농장 → 하루 구매 한도',
            value: <CaretRight size={12} weight="bold" />,
            mut: true,
          }]}
        />

        <InfoBox icon={<Info size={13} weight="fill" className="text-[#BBBBBB]" />}>
          한 번의 실수로 큰 손해가 나지 않게 <Em>기본 한도</Em>를 걸어 뒀어요.
          한도는 설정에서만 바꿀 수 있어요.
        </InfoBox>

        <div className="flex gap-[10px] mt-[16px]">
          <Btn tone="sec" wide onClick={close}>닫기</Btn>
        </div>
      </div>
    );
  }

  // ── 결과: 실패 (시안 shop-purchase ③ · shop-result ⑨) ─────
  if (status === 'error') {
    return (
      <div className={shell}>
        <Grab />
        <div className="text-center pt-[6px]">
          <span className="flex items-center justify-center w-[84px] h-[84px] mx-auto mt-[2px] mb-[14px] rounded-full bg-status-error-100 dark:bg-status-error-dark">
            <X size={34} weight="bold" className="text-[#F04438]" />
          </span>
          <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
            도구를 받지 못했어요
          </h3>
          <p className="mt-[8px] text-[12.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
            {errorMessage}
          </p>
        </div>
        <div className="flex gap-[10px] mt-[16px]">
          <Btn tone="sec" onClick={close}>닫기</Btn>
          <Btn tone="pri" onClick={() => { setErrorMessage(''); setStatus('confirm'); }}>다시 시도</Btn>
        </div>
      </div>
    );
  }

  // ── 구매 확인 (시안 shop-purchase ① · §3 세 값) ───────────
  if (status === 'confirm' || status === 'loading') {
    return (
      <div className={`${shell} max-h-[calc(90vh-40px)] overflow-y-auto`}>
        <Grab />
        <div className="flex items-center gap-[12px]">
          <img src={image} alt={name} draggable={false} className="w-[62px] h-[62px] shrink-0 object-contain select-none" />
          <div className="flex-1 min-w-0">
            {/* 시안은 여기에 묶음 상품명("작은 공구함")을 쓰지만 서버 pack 에 이름 필드가 없다.
                받는 것과 수량을 같은 자리에 적어 무엇을 사는지가 먼저 읽히게 한다. */}
            <div className="text-[17px] font-[800] tracking-[-0.04em] text-layout-black dark:text-layout-white">
              {name} {amount}개
            </div>
            <div className="mt-[3px] text-[12px] font-[500] leading-[1.5] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
              {ITEM_TAG[itemType] || (ITEM_LEDE[itemType] || []).join(' ')}
            </div>
          </div>
        </div>

        {/* 무엇이 빠져나가고 무엇이 들어오는지 한 상자에서 — 화살표는 늘 지금 → 산 뒤 */}
        <div className="mt-[14px] px-[14px] py-[12px] rounded-[12px] bg-[#FAFAFA] dark:bg-layout-gray-dark">
          <RecvRow k="결제"><Gem n={cost} /></RecvRow>
          <hr className="my-[10px] border-0 border-t border-[#EEEEEE] dark:border-white/[0.08]" />
          <RecvRow k="보유 보석">
            <span>{gemCnt}</span><Arrow /><span className="text-secondary-yellow-600">{Math.max(0, gemCnt - cost)}</span>
          </RecvRow>
          <div className="mt-[8px]">
            <RecvRow k={name}>
              <span>{owned}개</span><Arrow /><span className="text-status-success-600">{owned + amount}개</span>
            </RecvRow>
          </div>
          {hasCap && (
            <div className="mt-[8px]">
              <RecvRow k="오늘 도구 구매">
                <span>{capSpent}</span><Arrow /><span>{capSpent + cost} / {capLimit}</span>
              </RecvRow>
            </div>
          )}
        </div>

        <InfoBox icon={<ClockCounterClockwise size={13} weight="fill" className="text-[#BBBBBB]" />}>
          구매하고 <Em>10초 안에는 취소</Em>할 수 있어요. 아직 쓰지 않은 도구만 되돌릴 수 있어요.
        </InfoBox>

        <div className="flex gap-[10px] mt-[16px]">
          <Btn tone="sec" onClick={() => setStatus('detail')}>취소</Btn>
          <Btn tone="pri" onClick={handleBuy} disabled={status === 'loading'}>
            {status === 'loading'
              ? <span className="animate-spin rounded-full h-[20px] w-[20px] border-b-2 border-white" />
              : <><Gem n={cost} size="s" />개로 구매</>}
          </Btn>
        </div>
      </div>
    );
  }

  // ── 상세 시트 (시안 §2 ④⑤⑥) ─────────────────────────────
  const lede = ITEM_LEDE[itemType] || [];
  const nextGrant = formatDay(nextMonday());

  const SPECS = {
    SHOVEL: [
      ['쓰는 곳', <><Em>썩은 작물에만</Em> — 살아 있는 작물에는 쓰지 않아요</>],
      ['소비량', '작물 1개당 1개'],
      ['소비 시점', <>첫 진단에서 정답을 맞히면 <Em>확정</Em>돼요</>],
      ['필요 없을 때', '상점에서 산 단어장, 직접 추가한 단어'],
    ],
    NUTRIENT: [
      ['쓰는 곳', <>썩은 작물 <Em>1개당 1개</Em></>],
      ['되살리는 것', <>썩기 직전의 <Em>성장 단계</Em></>],
      ['쓴 뒤', '진단 복습 한 번이 필요해요'],
      ['쓸 수 없는 곳', '황금 당근 · 이미 회복한 작물'],
    ],
    SHIELD: [
      ['적용', <>놓친 날이 끝날 때 <Em>자동으로 1개</Em></>],
      ['없을 때', '48시간 안에 채우면 기록을 되살려요'],
      ['주간 지급', '매주 첫 접속에 1개 — 소급 지급은 없어요'],
      ['이월', '만료 없이 계속 쌓여요'],
    ],
  }[itemType] || [];

  const FREE_ROWS = {
    SHOVEL: [{
      key: 'leaf', tint: 'mint',
      icon: <Leaf size={15} weight="fill" className="text-crop-leaf" />,
      title: '이파리 첫 도달', desc: '단어마다 처음 한 번', value: '삽 1개',
    }],
    NUTRIENT: [
      {
        key: 'carrot', tint: 'yellow',
        icon: <Carrot size={15} weight="fill" className="text-crop-carrot" />,
        title: '당근 첫 도달', desc: '단어마다 처음 한 번', value: '1개',
      },
      {
        key: 'mission', tint: 'purple',
        icon: <Gift size={15} weight="fill" className="text-secondary-purple-600" />,
        title: '주간 · 특별 미션', desc: '기간마다 달라져요', value: '지정 수량',
      },
    ],
    SHIELD: [],
  }[itemType] || [];

  return (
    <div className={`${shell} max-h-[calc(90vh-40px)] overflow-y-auto`}>
      <Grab />

      {/* 가격보다 규칙이 위에 온다 (시안 ④) */}
      <div className="flex items-center gap-[12px]">
        <img src={image} alt={name} draggable={false} className="w-[62px] h-[62px] shrink-0 object-contain select-none" />
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-[800] tracking-[-0.04em] text-layout-black dark:text-layout-white">{name}</div>
          <div className="mt-[3px] text-[12px] font-[500] leading-[1.5] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
            {lede[0]}<br />{lede[1]}
          </div>
        </div>
        <span
          className={`shrink-0 px-[9px] py-[4px] rounded-full text-[11.5px] font-[700] tracking-[-0.02em] ${
            owned > 0
              ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600 dark:text-primary-main-400'
              : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-300'
          }`}
        >
          보유 {owned}개
        </span>
      </div>

      {/* 기획 8.1 고지 — 효능 · 적용 대상 · 소비 시점 · 불가 조건 */}
      <div className="mt-[14px] border-t border-[#F0F0F0] dark:border-white/[0.08]">
        {SPECS.map(([k, v]) => <SpecRow key={k} k={k}>{v}</SpecRow>)}
      </div>

      {itemType === 'NUTRIENT' && (
        <InfoBox tone="blue" icon={<Info size={13} weight="fill" className="text-secondary-blue-600" />}>
          썩은 작물을 <b className="font-[700] text-[#1849A9] dark:text-secondary-blue-300">여러 개 골라 한 번에</b> 되살릴 수 있어요.
          보유량보다 많이 고르면 가진 만큼만 선택돼요.
        </InfoBox>
      )}

      {FREE_ROWS.length > 0 && (
        <>
          <SLabel>무료로 얻는 법</SLabel>
          <Rows items={FREE_ROWS} />
        </>
      )}

      {/* 보호권은 이미 받은 것부터 — 이미 가진 걸 또 사게 두지 않는다 (시안 ⑥) */}
      {itemType === 'SHIELD' && (
        <>
          <SLabel>이번 주</SLabel>
          <Rows
            items={[{
              key: 'next',
              tint: 'gray',
              icon: <ClockCounterClockwise size={15} weight="fill" className="text-layout-gray-400" />,
              title: '다음 지급',
              desc: nextGrant,
              value: '1개',
              mut: true,
            }]}
          />
          <SLabel>추가로 사기</SLabel>
        </>
      )}

      {/* 묶음 고르기 (시안 §5 가격표 — 개당 단가는 작게, 리본은 하나만) */}
      {itemType !== 'SHIELD' && (
        <SLabel>
          묶음 고르기{itemType === 'NUTRIENT' ? ' — 10개부터 판매해요' : ''}
        </SLabel>
      )}

      {list.length > 1 ? (
        <div className="flex gap-[8px]">
          {list.map((p) => (
            <PackCard
              key={p.sku}
              pack={p}
              itemType={itemType}
              ribbon={p.sku === ribbonSku ? '가장 이득' : null}
              variant={p.sku === selected.sku ? 'sel' : ''}
              onClick={() => { vibrate({ duration: 5 }); setSku(p.sku); }}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-[11px] p-[9px] rounded-[12px] border-[1.5px] border-[#EEEEEE] dark:border-transparent bg-layout-white dark:bg-layout-gray-dark">
          <img src={image} alt="" draggable={false} className="w-[40px] h-[40px] shrink-0 object-contain select-none" />
          <span className="flex-1 min-w-0">
            <span className="block text-[13.5px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
              {name} {selected.amount}개
            </span>
            <span className="block mt-[2px] text-[11px] font-[500] leading-[1.4] tracking-[-0.02em] text-layout-gray-300">
              획득 경로와 관계없이 효능은 같아요
            </span>
          </span>
          <span className="shrink-0 h-[32px] px-[12px] rounded-[8px] bg-primary-main-600 text-layout-white flex items-center text-[13px] font-[800]">
            <Gem n={selected.gem_price} size="s" />
          </span>
        </div>
      )}

      <div className="flex gap-[10px] mt-[16px]">
        <Btn tone="sec" onClick={close}>닫기</Btn>
        <Btn tone="pri" onClick={openConfirm} disabled={overCap}>
          <Gem n={cost} size="s" />개로 구매
        </Btn>
      </div>

      {/* 사기 전에 결과를 본다 (시안 §6 · ④ 하단) */}
      {hasCap && <CapBar spent={capSpent} limit={capLimit} next={capSpent + cost} className="mt-[11px]" />}
    </div>
  );
};

export default FarmItemPurchaseNewBottomSheet;
