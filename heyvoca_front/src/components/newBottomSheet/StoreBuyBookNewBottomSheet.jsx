import React, { useState } from 'react';
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
  SHEET_SHELL, Grab, Gem, Btn, Btns, BtnSpinner, SheetHead,
  RecvBox, RecvRow, RecvHr, Arrow, Up, Down, HintB,
} from './purchaseParts';
import { vibrate } from '../../utils/osFunction';
import emptyBookImg from '../../assets/images/farm/book-empty.png';

/**
 * 묶음 단어장 구매 확인 시트 (수량이 이미 정해진 상품을 바로 확인하는 자리).
 *
 * 시안 정본: shop-purchase.txt §3(확인 시트가 반드시 보여줘야 하는 세 값),
 *            shop-result.txt §2④(성공) · §3⑦⑧(보석 부족 · 처리 실패) · §5(리턴 공통 규격).
 *
 * 수량 스테퍼가 있는 자리는 `BuyEmptyBookNewBottomSheet` 다. 여기는 수량 고정 묶음용이라
 * 스테퍼 없이 확인만 받는다 — 나머지 규격(결제 요약 · 실패 갈래 · 리턴 화면)은 같다.
 */
export const StoreBuyBookNewBottomSheet = ({ options = {} }) => {
  "use memo";

  const navigate = useNavigate();
  const { popNewBottomSheet, openNewBottomSheet, clearStack } = useNewBottomSheetActions();
  const { popNewFullSheet } = useNewFullSheetActions();
  const { userProfile, setUserProfile } = useUser();
  const [status, setStatus] = useState('confirm'); // confirm | loading | short | error

  const { packageName, cost = 0, amount = 1, image } = options;

  const gemCnt = Number(userProfile?.gem_cnt) || 0;
  const bookCnt = Number(userProfile?.book_cnt) || 0;
  const price = Number(cost) || 0;
  const qty = Number(amount) || 1;
  const shortage = Math.max(0, price - gemCnt);
  const n = (v) => v.toLocaleString('ko-KR');

  const close = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
  };

  const openSuccess = (remainGem, nextBookCnt) => {
    openNewBottomSheet(StorePurchaseResultNewBottomSheet, {
      options: {
        success: true,
        image: image || emptyBookImg,
        plot: !image,
        title: <>빈 단어장 <ResultEm>{n(qty)}개</ResultEm>를<br />만들었어요</>,
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
    if (gemCnt < price) { setStatus('short'); return; }

    setStatus('loading');
    const res = await purchaseBookApi(qty);
    if (res?.code !== 200 || !res?.data) { setStatus('error'); return; }

    const remainGem = Number(res.data.gem_cnt);
    const nextBookCnt = Number(res.data.book_cnt);
    setUserProfile((prev) => ({ ...prev, gem_cnt: remainGem, book_cnt: nextBookCnt }));
    openSuccess(remainGem, nextBookCnt);
  };

  // ── ⑦ 보석 부족 ────────────────────────────────────────
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

  // ── ⑧ 처리 실패 ────────────────────────────────────────
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

  // ── 구매 확인 ──────────────────────────────────────────
  return (
    <div className={`${SHEET_SHELL} max-h-[calc(90vh-40px)] overflow-y-auto`}>
      <Grab />

      <SheetHead
        image={image || emptyBookImg}
        title={packageName || `빈 단어장 ${n(qty)}개`}
        desc="단어가 들어 있지 않은 밭이에요"
      />

      <RecvBox>
        <RecvRow k="결제" tight><Gem n={price} /></RecvRow>
        <RecvHr />
        <RecvRow k="보유 보석" tight>
          <span>{n(gemCnt)}</span><Arrow /><Down>{n(Math.max(0, gemCnt - price))}</Down>
        </RecvRow>
        <RecvRow k="단어장">
          <span>{n(bookCnt)}개</span><Arrow /><Up>{n(bookCnt + qty)}개</Up>
        </RecvRow>
      </RecvBox>

      <Btns>
        <Btn tone="sec" onClick={close} disabled={status === 'loading'}>취소</Btn>
        <Btn tone="pri" onClick={handleBuy} disabled={status === 'loading'}>
          {status === 'loading' ? <BtnSpinner /> : <><Gem n={price} size="s" />개로 구매</>}
        </Btn>
      </Btns>
    </div>
  );
};

export default StoreBuyBookNewBottomSheet;
