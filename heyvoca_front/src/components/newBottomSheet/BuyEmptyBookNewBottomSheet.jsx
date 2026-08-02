import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus, WarningCircle } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { purchaseBookApi } from '../../api/store';
import {
  StorePurchaseResultNewBottomSheet, PurchaseResultBody, ResultEm,
} from './StorePurchaseResultNewBottomSheet';
import { GemPurchaseNewBottomSheet } from './GemPurchaseNewBottomSheet';
import {
  SHEET_SHELL, Grab, Gem, Btn, Btns, BtnSpinner,
  RecvBox, RecvRow, RecvHr, Arrow, Up, Down, InfoBox, Hint, HintB,
} from './purchaseParts';
import { vibrate } from '../../utils/osFunction';
import emptyBookImg from '../../assets/images/farm/book-empty.png';

/**
 * 빈 단어장 구매 시트.
 *
 * 시안 정본: shop-purchase.txt §2⑧(빈 단어장 구매) · §3(확인 시트의 세 값) · §8(빈 단어장에만 붙는 경고),
 *            shop-result.txt §2④(빈 단어장 성공) · §3⑦⑧(보석 부족 · 처리 실패).
 *
 * 수량 스테퍼 위에 오는 건 가격이 아니라 **이게 어떤 밭인지**다(§8) —
 * 가격 차이의 이유를 분량이 아니라 성질로 설명해야 싼 상품이 열등한 게 아니라
 * 다른 용도라는 게 드러난다.
 *
 * 성공 화면의 다음 행동이 "물주기"가 아니라 **단어 넣기**인 이유는 §2④ 그대로다 —
 * 밭은 생겼고 씨앗은 없다.
 */

const PRICE_PER_BOOK = 3;
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 100;

export const BuyEmptyBookNewBottomSheet = () => {
  "use memo";

  const navigate = useNavigate();
  const { popNewBottomSheet, openNewBottomSheet, clearStack } = useNewBottomSheetActions();
  const { popNewFullSheet } = useNewFullSheetActions();
  const { userProfile, setUserProfile } = useUser();

  const [count, setCount] = useState(1);
  const [status, setStatus] = useState('confirm'); // confirm | loading | short | error

  const longPressIntervalRef = useRef(null);
  const longPressTimeoutRef = useRef(null);

  useEffect(() => () => {
    if (longPressIntervalRef.current) clearInterval(longPressIntervalRef.current);
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
  }, []);

  const totalCost = count * PRICE_PER_BOOK;
  const gemCnt = Number(userProfile?.gem_cnt) || 0;
  const bookCnt = Number(userProfile?.book_cnt) || 0;
  const shortage = Math.max(0, totalCost - gemCnt);
  const n = (v) => v.toLocaleString('ko-KR');

  const handleLongPressStart = useCallback((delta) => {
    if (longPressIntervalRef.current) clearInterval(longPressIntervalRef.current);
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);

    const step = () => setCount((prev) => {
      const next = prev + delta;
      if (next < MIN_AMOUNT) return MIN_AMOUNT;
      if (next > MAX_AMOUNT) return MAX_AMOUNT;
      vibrate({ duration: 5 });
      return next;
    });

    step();
    longPressTimeoutRef.current = setTimeout(() => {
      longPressIntervalRef.current = setInterval(step, 100);
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const close = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
  };

  /** ④ 성공 — 밭은 생겼고 씨앗은 없다(shop-result §2④) */
  const openSuccess = (remainGem, nextBookCnt) => {
    openNewBottomSheet(StorePurchaseResultNewBottomSheet, {
      options: {
        success: true,
        image: emptyBookImg,
        plot: true, // 밭은 마름모라 가로가 길다 (시안 .res .im.plot)
        title: <>빈 단어장 <ResultEm>{n(count)}개</ResultEm>를<br />만들었어요</>,
        pill: { from: `단어장 ${n(bookCnt)}개`, to: `${n(nextBookCnt)}개` },
        secondary: { label: '확인' },
        primary: {
          label: '단어 넣으러 가기',
          onClick: () => {
            clearStack();
            popNewFullSheet();
            navigate('/vocabulary-sheets');
          },
        },
        caption: <>남은 보석 <HintB>{n(remainGem)}</HintB></>,
      },
    });
  };

  const handleBuy = async () => {
    if (status === 'loading') return;
    vibrate({ duration: 5 });
    if (gemCnt < totalCost) { setStatus('short'); return; }

    setStatus('loading');
    const res = await purchaseBookApi(count);
    // fetchDataAsync 는 비-2xx 도 throw 하지 않는다 — code 로 확인한다.
    if (res?.code !== 200 || !res?.data) { setStatus('error'); return; }

    const remainGem = Number(res.data.gem_cnt);
    const nextBookCnt = Number(res.data.book_cnt);
    setUserProfile((prev) => ({ ...prev, gem_cnt: remainGem, book_cnt: nextBookCnt }));
    openSuccess(remainGem, nextBookCnt);
  };

  // ── ⑦ 보석 부족 (shop-result §3⑦) ──────────────────────
  if (status === 'short') {
    return (
      <div className={SHEET_SHELL}>
        <Grab />
        <PurchaseResultBody
          success={false}
          kind="shortage"
          title={<>보석이 <ResultEm>{n(shortage)}개</ResultEm> 모자라요</>}
        />
        <Btns>
          <Btn tone="sec" onClick={close}>나중에 하기</Btn>
          <Btn
            tone="pri"
            onClick={() => { vibrate({ duration: 5 }); openNewBottomSheet(GemPurchaseNewBottomSheet, {}); }}
          >
            보석 충전
          </Btn>
        </Btns>
      </div>
    );
  }

  // ── ⑧ 처리 실패 (shop-result §3⑧) ──────────────────────
  if (status === 'error') {
    return (
      <div className={SHEET_SHELL}>
        <Grab />
        <PurchaseResultBody
          success={false}
          kind="error"
          title="단어장을 받지 못했어요"
          desc="연결이 잠시 끊겼어요."
        />
        <Btns>
          <Btn tone="sec" onClick={close}>닫기</Btn>
          <Btn tone="pri" onClick={() => setStatus('confirm')}>다시 시도</Btn>
        </Btns>
      </div>
    );
  }

  const isMin = count <= MIN_AMOUNT;
  const isMax = count >= MAX_AMOUNT;
  const stepBtn = 'flex items-center justify-center w-[44px] h-[44px] rounded-[10px] border-[1.5px] select-none touch-none';

  // ── ⑧ 빈 단어장 구매 (shop-purchase §2⑧) ────────────────
  return (
    <div className={`${SHEET_SHELL} max-h-[calc(90vh-40px)] overflow-y-auto`}>
      <Grab />

      <div className="text-center pt-[6px] pb-[2px]">
        <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
          빈 단어장을 몇 개 살까요?
        </h3>
        <p className="mt-[8px] text-[12.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
          단어가 들어 있지 않은 밭이에요.<br />직접 심을 씨앗을 채워 넣어요.
        </p>
      </div>

      {/* 수량 스테퍼 (시안 .step) */}
      <div className="flex items-center justify-center gap-[14px] mt-[16px] mb-[4px]">
        <motion.button
          type="button"
          aria-label="한 개 줄이기"
          className={`${stepBtn} ${isMin
            ? 'border-[#EEEEEE] dark:border-[#2A2A2A] text-layout-gray-200'
            : 'border-layout-gray-100 dark:border-[#3A3A3A] text-layout-gray-400 dark:text-layout-gray-200'}`}
          onPointerDown={(e) => { e.stopPropagation(); handleLongPressStart(-1); }}
          onPointerUp={handleLongPressEnd}
          onPointerCancel={handleLongPressEnd}
          onPointerLeave={handleLongPressEnd}
          drag={false}
        >
          <Minus size={17} weight="bold" />
        </motion.button>

        <span className="w-[86px] text-center text-[30px] font-[800] tracking-[-0.04em] text-primary-main-600">
          {count}
        </span>

        <motion.button
          type="button"
          aria-label="한 개 늘리기"
          className={`${stepBtn} ${isMax
            ? 'border-[#EEEEEE] dark:border-[#2A2A2A] text-layout-gray-200'
            : 'border-layout-gray-100 dark:border-[#3A3A3A] text-layout-gray-400 dark:text-layout-gray-200'}`}
          onPointerDown={(e) => { e.stopPropagation(); handleLongPressStart(1); }}
          onPointerUp={handleLongPressEnd}
          onPointerCancel={handleLongPressEnd}
          onPointerLeave={handleLongPressEnd}
          drag={false}
        >
          <Plus size={17} weight="bold" />
        </motion.button>
      </div>

      <Hint center>
        1개당 <Gem n={PRICE_PER_BOOK} size="s" /> · 최대 {MAX_AMOUNT}개
      </Hint>

      {/* §3 — 결제액 하나가 아니라 값이 어떻게 바뀌는지 */}
      <RecvBox>
        <RecvRow k="결제" tight><Gem n={totalCost} /></RecvRow>
        <RecvHr />
        <RecvRow k="보유 보석" tight>
          <span>{n(gemCnt)}</span><Arrow /><Down>{n(Math.max(0, gemCnt - totalCost))}</Down>
        </RecvRow>
        <RecvRow k="단어장">
          <span>{n(bookCnt)}개</span><Arrow /><Up>{n(bookCnt + count)}개</Up>
        </RecvRow>
      </RecvBox>

      {/* §8 — 빈 단어장에만 붙는 경고. 가격 차이를 분량이 아니라 성질로 설명한다 */}
      <InfoBox tone="warn" icon={<WarningCircle size={13} weight="fill" />}>
        직접 넣은 단어는 <b className="font-[700] text-[#93370D] dark:text-[#FEC84B]">사전에 연결되기 전까지 미검증</b>이에요.
        {' '}같은 단어라도 다른 단어장과 따로 자라요.
      </InfoBox>

      <Btns>
        <Btn tone="sec" onClick={close} disabled={status === 'loading'}>취소</Btn>
        <Btn tone="pri" onClick={handleBuy} disabled={status === 'loading'}>
          {status === 'loading'
            ? <BtnSpinner />
            : <><Gem n={totalCost} size="s" />개로 구매</>}
        </Btn>
      </Btns>
    </div>
  );
};

export default BuyEmptyBookNewBottomSheet;
