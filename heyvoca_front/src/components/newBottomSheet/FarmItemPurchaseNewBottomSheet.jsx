import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { useGemAnimation } from '../../context/GemAnimationContext';
import { purchaseFarmItemApi } from '../../api/farm';
import { FARM_ITEM_LABEL, FARM_ITEM_DESC } from '../../utils/crop';
import { FARM_ITEM_ASSETS } from '../farm/CropImage';
import { vibrate } from '../../utils/osFunction';
import gemImg from '../../assets/images/gem.png';

/**
 * 농장 도구 구매 확인 시트.
 * 기획 8.1 — 구매 전에 효능 · 적용 대상 · 소비 시점 · 환불 불가를 모두 보여준다.
 * 확인 → 결과(성공/실패)까지 한 시트 안에서 끝낸다.
 */

/** 아이템별 고지 항목. 마지막 두 줄(환불·유효기간)은 세 아이템이 공통이다. */
const ITEM_TERMS = {
  SHOVEL: [
    ['효능', '썩은 자리를 정리하고 씨앗부터 다시 심어요'],
    ['적용 대상', '썩은 작물에만 써요. 자라고 있는 작물에는 쓰지 않아요'],
    ['소비 시점', '작물 1개당 1개. 첫 진단에서 정답을 맞히면 확정돼요'],
  ],
  NUTRIENT: [
    ['효능', '지금까지 키운 단계를 그대로 두고 되살려요'],
    ['적용 대상', '썩은 작물 1개당 1개. 황금 당근에는 쓰지 않아요'],
    ['소비 시점', '쓰는 즉시 줄어들고, 진단 복습 한 번이 필요해요'],
  ],
  SHIELD: [
    ['효능', '학습을 쉬는 날에도 연속 기록을 이어줘요'],
    ['적용 대상', '연속 학습 기록'],
    ['소비 시점', '쉬어 간 날이 끝날 때 자동으로 1개'],
  ],
};

const COMMON_TERMS = [
  ['유효 기간', '없어요. 쓸 때까지 창고에 그대로 있어요'],
  ['환불', '받은 도구와 쓴 보석은 되돌릴 수 없어요'],
];

const SpecRow = ({ label, value }) => (
  <div className="flex gap-[10px] py-[9px] border-b border-[#F4F4F4] dark:border-white/[0.06] text-[12px] leading-[1.5]">
    <span className="w-[74px] shrink-0 font-[700] text-layout-gray-300">{label}</span>
    <span className="flex-1 font-[600] text-layout-gray-500 dark:text-layout-gray-200">{value}</span>
  </div>
);

const SummaryRow = ({ label, children }) => (
  <div className="flex items-center gap-[8px] text-[12.5px]">
    <span className="flex-1 font-[600] text-layout-gray-400 dark:text-layout-gray-300">{label}</span>
    <span className="flex items-center gap-[4px] font-[800] text-layout-black dark:text-layout-white">
      {children}
    </span>
  </div>
);

/**
 * @param {object} props
 * @param {object} props.pack     서버 상품 { sku, item_type, gem_price, amount, per_unit }
 * @param {number} props.owned    현재 보유 개수
 * @param {function} props.onPurchased  성공 시 서버 응답 data 를 그대로 넘긴다
 */
export const FarmItemPurchaseNewBottomSheet = ({ pack, owned = 0, onPurchased }) => {
  "use memo";

  const { popNewBottomSheet } = useNewBottomSheetActions();
  const { userProfile, setUserProfile } = useUser();
  const { triggerFlyingAnimation } = useGemAnimation();

  const [status, setStatus] = useState('confirm'); // confirm | loading | done | error
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  if (!pack) return null;

  const itemType = pack.item_type;
  const label = FARM_ITEM_LABEL[itemType] || '농장 도구';
  const image = FARM_ITEM_ASSETS[itemType];
  const cost = Number(pack.gem_price) || 0;
  const amount = Number(pack.amount) || 0;
  const gemCnt = Number(userProfile?.gem_cnt) || 0;
  const enough = gemCnt >= cost;
  const shortage = Math.max(0, cost - gemCnt);

  const close = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
  };

  const handleBuy = async () => {
    vibrate({ duration: 5 });
    if (!enough || status === 'loading') return;

    setStatus('loading');
    const res = await purchaseFarmItemApi({ sku: pack.sku, qty: 1 });

    // fetchDataAsync 는 비-2xx 도 그대로 돌려준다 — code 로 확인한다.
    if (res?.code !== 200 || !res?.data) {
      setErrorMessage(res?.message || '잠시 연결이 끊겼어요. 다시 시도해 주세요.');
      setStatus('error');
      return;
    }

    const data = res.data;
    setResult(data);
    setStatus('done');
    setUserProfile((prev) => ({ ...prev, gem_cnt: data.gem_cnt }));
    if (onPurchased) onPurchased(data);

    // 받은 도구가 창고 요약으로 날아간다. 대상이 없으면 상단 보석 카운터로 보낸다.
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

  // ── 결과: 성공 ─────────────────────────────────────────────
  if (status === 'done' && result) {
    return (
      <div className="flex flex-col px-[20px] pt-[16px] pb-[24px]">
        <div className="flex flex-col items-center text-center">
          <motion.img
            src={image}
            alt={label}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="w-[96px] h-[96px] object-contain select-none"
            draggable={false}
          />
          <h1 className="mt-[14px] text-[19px] font-[800] leading-[1.35] text-layout-black dark:text-layout-white">
            {label} <span className="text-primary-main-600">{result.granted}개</span>를 받았어요
          </h1>
          <div className="mt-[14px] inline-flex items-center gap-[7px] px-[14px] py-[7px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[12.5px] font-[700] text-layout-black dark:text-layout-white">
            <span>보유 {owned}개</span>
            <span className="text-layout-gray-200">&rarr;</span>
            <span className="text-primary-main-600 font-[800]">{result.item_qty}개</span>
          </div>
          <p className="mt-[10px] text-[12px] font-[400] text-layout-gray-300">
            남은 보석 {result.gem_cnt}개
          </p>
        </div>

        <motion.button
          type="button"
          onClick={close}
          whileTap={{ scale: 0.97 }}
          className="mt-[20px] w-full h-[48px] rounded-[10px] bg-primary-main-600 text-layout-white text-[15.5px] font-[700] flex items-center justify-center"
        >
          확인
        </motion.button>
      </div>
    );
  }

  // ── 결과: 실패 ─────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="flex flex-col px-[20px] pt-[16px] pb-[24px]">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center w-[84px] h-[84px] rounded-full bg-status-error-100 dark:bg-status-error-dark">
            <X className="text-[34px] text-status-error-500" />
          </div>
          <h1 className="mt-[14px] text-[19px] font-[800] text-layout-black dark:text-layout-white">
            구매하지 못했어요
          </h1>
          <p className="mt-[8px] text-[12.5px] font-[400] leading-[1.6] text-layout-gray-400 dark:text-layout-gray-300">
            {errorMessage}
          </p>
          <p className="mt-[6px] text-[12.5px] font-[700] text-layout-black dark:text-layout-white">
            보석은 그대로 있어요.
          </p>
        </div>

        <div className="mt-[20px] flex gap-[10px]">
          <motion.button
            type="button"
            onClick={close}
            whileTap={{ scale: 0.97 }}
            className="flex-1 h-[48px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[15.5px] font-[700] text-layout-gray-400 dark:text-layout-gray-200 flex items-center justify-center"
          >
            닫기
          </motion.button>
          <motion.button
            type="button"
            onClick={() => { setErrorMessage(''); setStatus('confirm'); }}
            whileTap={{ scale: 0.97 }}
            className="flex-1 h-[48px] rounded-[10px] bg-primary-main-600 text-layout-white text-[15.5px] font-[700] flex items-center justify-center"
          >
            다시 시도
          </motion.button>
        </div>
      </div>
    );
  }

  // ── 구매 확인 ──────────────────────────────────────────────
  return (
    <div className="flex flex-col px-[20px] pt-[10px] pb-[24px] max-h-[calc(90vh-47px)] overflow-y-auto">
      {/* 무엇을 사는지 */}
      <div className="flex items-center gap-[12px]">
        <img
          src={image}
          alt={label}
          draggable={false}
          className="w-[62px] h-[62px] shrink-0 object-contain select-none"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-[800] text-layout-black dark:text-layout-white">
            {label} {amount}개
          </div>
          <div className="mt-[3px] text-[12px] font-[400] leading-[1.5] text-layout-gray-400 dark:text-layout-gray-300">
            {FARM_ITEM_DESC[itemType]}
          </div>
        </div>
        <span
          className={`shrink-0 px-[9px] py-[4px] rounded-full text-[11.5px] font-[700] ${
            owned > 0
              ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600 dark:text-primary-main-400'
              : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-300'
          }`}
        >
          보유 {owned}개
        </span>
      </div>

      {/* 고지 — 기획 8.1 (효능 · 적용 대상 · 소비 시점 · 유효기간 · 환불) */}
      <div className="mt-[14px] border-t border-[#F0F0F0] dark:border-white/[0.08]">
        {[...(ITEM_TERMS[itemType] || []), ...COMMON_TERMS].map(([k, v]) => (
          <SpecRow key={k} label={k} value={v} />
        ))}
      </div>

      {/* 사고 나면 무엇이 어떻게 바뀌는지 */}
      <div className="mt-[14px] flex flex-col gap-[8px] p-[12px] px-[14px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark">
        <SummaryRow label="결제">
          <img src={gemImg} alt="보석" className="w-[14px] h-[12px]" />
          {cost}
        </SummaryRow>
        <div className="border-t border-[#EEEEEE] dark:border-white/[0.08]" />
        <SummaryRow label="보유 보석">
          <span>{gemCnt}</span>
          <span className="text-layout-gray-200 font-[700]">&rarr;</span>
          <span className="text-secondary-yellow-600">{Math.max(0, gemCnt - cost)}</span>
        </SummaryRow>
        <SummaryRow label={label}>
          <span>{owned}개</span>
          <span className="text-layout-gray-200 font-[700]">&rarr;</span>
          <span className="text-status-success-600">{owned + amount}개</span>
        </SummaryRow>
      </div>

      {/* 버튼 */}
      <div className="mt-[16px] flex gap-[10px]">
        <motion.button
          type="button"
          onClick={close}
          whileTap={{ scale: 0.97 }}
          className="flex-1 h-[48px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[15.5px] font-[700] text-layout-gray-400 dark:text-layout-gray-200 flex items-center justify-center"
        >
          취소
        </motion.button>
        <motion.button
          type="button"
          onClick={handleBuy}
          disabled={!enough || status === 'loading'}
          whileTap={enough ? { scale: 0.97 } : undefined}
          className="flex-1 h-[48px] rounded-[10px] bg-primary-main-600 text-layout-white text-[15.5px] font-[700] flex items-center justify-center gap-[5px] disabled:opacity-40"
        >
          {status === 'loading' ? (
            <span className="animate-spin rounded-full h-[20px] w-[20px] border-b-2 border-white" />
          ) : (
            <>
              <img src={gemImg} alt="보석" className="w-[18px] h-[16px]" />
              {cost}개로 구매
            </>
          )}
        </motion.button>
      </div>

      {!enough && (
        <p className="mt-[10px] text-center text-[11.5px] font-[400] text-layout-gray-300">
          보석이 {shortage}개 모자라요. 보석 탭에서 채울 수 있어요.
        </p>
      )}
    </div>
  );
};

export default FarmItemPurchaseNewBottomSheet;
