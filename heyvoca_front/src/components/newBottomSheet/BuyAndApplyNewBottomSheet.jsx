import React, { useEffect, useRef, useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { useNewBottomSheet } from '../../hooks/useNewBottomSheet';
import { useUser } from '../../context/UserContext';
import { getFarmShopApi, purchaseFarmItemApi } from '../../api/farm';
import { FARM_ITEM_ASSETS } from '../farm/CropImage';
import { vibrate } from '../../utils/osFunction';
import {
  Gem, Grab, Btn, Btns, BtnSpinner, RecvBox, RecvRow, RecvHr, Arrow, Down, SHEET_SHELL,
} from './purchaseParts';

const ITEM_NAME = { NUTRIENT: '영양 회복제', SHOVEL: '새심기 삽' };
const MAX_QTY = 10; // 서버 MAX_PURCHASE_QTY 와 같은 값

/**
 * 부족한 개수를 채우는 가장 싼 단일 묶음 조합을 고른다.
 * (한 번의 구매 호출 = 한 sku. 여러 sku 를 섞으면 중간 실패 시 부분 구매가 생겨 피한다.)
 */
const pickPack = (packs, itemType, lack) => {
  let best = null;
  packs.filter((p) => p.item_type === itemType).forEach((p) => {
    const amount = Number(p.amount) || 0;
    const price = Number(p.gem_price) || 0;
    if (amount <= 0) return;
    const qty = Math.ceil(lack / amount);
    if (qty > MAX_QTY) return;
    const cost = price * qty;
    const got = amount * qty;
    if (!best || cost < best.cost || (cost === best.cost && got < best.got)) {
      best = { sku: p.sku, qty, cost, got, amount, price };
    }
  });
  return best;
};

/**
 * 돌볼 작물 — "구매하고 바로 적용하기" 전용 시트.
 * pushAwaitNewBottomSheet 로 호출 → resolve 값:
 *   { action: 'done' }   구매 + 사용까지 끝남
 *   { action: 'gems' }   보석 충전으로 이동
 *   { action: 'closed' } 닫음 (구매는 됐지만 사용이 안 된 경우 purchased=true)
 *
 * @param {string}   props.itemType  'NUTRIENT' | 'SHOVEL'
 * @param {number}   props.lack      부족한 개수 (선택 단어 수 - 보유량)
 * @param {number}   props.count     사용할 단어 수
 * @param {number}   props.gemCnt    현재 보유 보석 (서버 최신값)
 * @param {function} props.onApply   async () => { ok, message } — 기존 회복/다시 심기 처리 재사용
 */
export const BuyAndApplyNewBottomSheet = ({ itemType, lack, count, gemCnt, onApply }) => {
  const { resolveNewBottomSheet } = useNewBottomSheet();
  const { userProfile, setUserProfile } = useUser();

  const [packs, setPacks] = useState(null);       // null = 로딩, [] = 실패
  const [status, setStatus] = useState('confirm'); // confirm | buying | applying | applyFailed | buyFailed
  const [message, setMessage] = useState('');
  const [balance, setBalance] = useState(Number(gemCnt) || 0);
  const lockRef = useRef(false);
  const purchasedRef = useRef(false);

  const name = ITEM_NAME[itemType] || '아이템';
  const image = FARM_ITEM_ASSETS[itemType];

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getFarmShopApi();
      if (!alive) return;
      const list = res?.code === 200 ? (res?.data?.packs || res?.data?.items || []) : [];
      setPacks(Array.isArray(list) ? list : []);
    })();
    return () => { alive = false; };
  }, []);

  const plan = packs ? pickPack(packs, itemType, lack) : null;
  const afterBalance = plan ? balance - plan.cost : balance;
  const insufficient = !!plan && balance < plan.cost;
  const busy = status === 'buying' || status === 'applying';

  const close = () => {
    if (busy) return;
    vibrate({ duration: 5 });
    resolveNewBottomSheet({ action: 'closed', purchased: purchasedRef.current });
  };

  const handleConfirm = async () => {
    if (lockRef.current || !plan || insufficient) return; // 중복 탭 방지
    lockRef.current = true;
    vibrate({ duration: 5 });
    setMessage('');

    try {
      if (!purchasedRef.current) {
        setStatus('buying');
        const res = await purchaseFarmItemApi({ sku: plan.sku, qty: plan.qty });
        if (res?.code !== 200 || !res?.data) {
          setMessage(res?.message || '연결이 잠시 끊겨 구매하지 못했어요. 보석은 빠져나가지 않았어요.');
          setStatus('buyFailed');
          return;
        }
        purchasedRef.current = true;
        const left = Number(res.data.gem_cnt);
        if (Number.isFinite(left)) {
          setBalance(left);
          setUserProfile?.((prev) => ({ ...prev, gem_cnt: left }));
        }
      }

      setStatus('applying');
      const applied = await onApply();
      if (applied?.ok) {
        resolveNewBottomSheet({ action: 'done' });
        return;
      }
      setMessage(applied?.message || '잠시 뒤 다시 시도해 주세요.');
      setStatus('applyFailed');
    } finally {
      lockRef.current = false;
    }
  };

  // ── 구매 후 사용 실패 — 구매는 끝났음을 분명히 알린다 ──
  if (status === 'applyFailed') {
    return (
      <div className={SHEET_SHELL}>
        <Grab />
        <div className="text-center pt-[6px]">
          <span className="flex items-center justify-center w-[84px] h-[84px] mx-auto mb-[14px] rounded-full bg-secondary-yellow-100 dark:bg-secondary-yellow-dark">
            <WarningCircle size={34} weight="fill" className="text-secondary-yellow-600" />
          </span>
          <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
            구매는 끝났지만<br />아직 사용하지 못했어요
          </h3>
          <p className="mt-[8px] text-[12.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
            {name}는 이미 받았어요. {message}
          </p>
        </div>
        <Btns>
          <Btn tone="sec" onClick={close}>닫기</Btn>
          <Btn tone="pri" onClick={handleConfirm}>다시 사용하기</Btn>
        </Btns>
      </div>
    );
  }

  if (status === 'buyFailed') {
    return (
      <div className={SHEET_SHELL}>
        <Grab />
        <div className="text-center pt-[6px]">
          <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
            구매하지 못했어요
          </h3>
          <p className="mt-[8px] text-[12.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
            {message}
          </p>
        </div>
        <Btns>
          <Btn tone="sec" onClick={close}>닫기</Btn>
          <Btn tone="pri" onClick={() => setStatus('confirm')}>다시 시도</Btn>
        </Btns>
      </div>
    );
  }

  return (
    <div className={SHEET_SHELL}>
      <Grab />
      <div className="flex items-center gap-[12px]">
        <img src={image} alt={name} draggable={false} className="w-[56px] h-[56px] shrink-0 object-contain select-none" />
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-[800] tracking-[-0.04em] text-layout-black dark:text-layout-white">
            {name} {lack}개가 모자라요
          </div>
          <div className="mt-[3px] text-[12.5px] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
            보석으로 사서 작물 {count}개에 바로 사용해요
          </div>
        </div>
      </div>

      {packs === null && (
        <p className="py-[26px] text-center text-[12.5px] text-layout-gray-300">가격을 불러오는 중이에요</p>
      )}

      {packs !== null && !plan && (
        <p className="py-[22px] text-center text-[12.5px] leading-[1.6] text-layout-gray-400 dark:text-layout-gray-300">
          {packs.length === 0
            ? '가격을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'
            : '한 번에 살 수 있는 수량을 넘었어요. 작물을 나눠서 선택해 주세요.'}
        </p>
      )}

      {plan && (
        <RecvBox>
          <RecvRow k="부족한 개수" tight>{lack}개</RecvRow>
          <RecvRow k="구매 수량">
            {plan.got}개{plan.got > lack ? ` (${plan.got - lack}개는 보유로 남아요)` : ''}
          </RecvRow>
          <RecvRow k="개당 가격"><Gem n={Math.round((plan.cost / plan.got) * 100) / 100} size="s" /></RecvRow>
          <RecvRow k="총 사용 보석"><Gem n={plan.cost} size="s" /></RecvRow>
          <RecvHr />
          <RecvRow k="현재 보석" tight><Gem n={balance} size="s" /></RecvRow>
          <RecvRow k="구매 후 잔액">
            {insufficient ? (
              <span className="text-secondary-yellow-600">보석이 {plan.cost - balance}개 모자라요</span>
            ) : (
              <>
                <Gem n={balance} size="s" /> <Arrow /> <Down><Gem n={afterBalance} size="s" /></Down>
              </>
            )}
          </RecvRow>
        </RecvBox>
      )}

      {status === 'applying' && (
        <p className="mt-[10px] text-center text-[12.5px] font-[700] text-primary-main-600">
          구매를 마쳤어요. 작물에 사용하는 중이에요
        </p>
      )}

      <Btns>
        <Btn tone="sec" onClick={close} disabled={busy}>취소</Btn>
        {insufficient ? (
          <Btn tone="pri" onClick={() => { vibrate({ duration: 5 }); resolveNewBottomSheet({ action: 'gems' }); }}>
            보석 충전하기
          </Btn>
        ) : (
          <Btn tone="pri" onClick={handleConfirm} disabled={!plan || busy}>
            {busy ? <BtnSpinner /> : '구매하고 적용하기'}
          </Btn>
        )}
      </Btns>
    </div>
  );
};

export default BuyAndApplyNewBottomSheet;
