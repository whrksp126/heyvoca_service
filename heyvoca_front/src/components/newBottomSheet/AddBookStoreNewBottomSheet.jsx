import React, { useState } from 'react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { useStats } from '../../context/StatsContext';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { vibrate } from '../../utils/osFunction';
import {
  StorePurchaseResultNewBottomSheet, PurchaseResultBody, ResultEm,
} from './StorePurchaseResultNewBottomSheet';
import { GemPurchaseNewBottomSheet } from './GemPurchaseNewBottomSheet';
import {
  SHEET_SHELL, Grab, Gem, Btn, Btns, BtnSpinner,
} from './purchaseParts';
// 씨앗 도착(성공 리턴) 그림 — 서점 상세의 포장된 씨앗 상자를 그대로 쓴다(QA 4차)
import SeedBundleHero from '../bookStore/SeedBundleHero';

/**
 * 서점 단어장 구매 확인 시트.
 *
 * 시안 정본: shop-purchase.txt §2⑥(단어장 구매 확인),
 *            shop-result.txt §2③(단어장 성공) · §3⑦⑧(보석 부족 · 처리 실패) · §6(실패를 네 갈래로).
 *
 * 확인 시트는 "무엇을 사는지" 하나만 가운데 정렬 문장으로 묻는다 — 이름 · 단어 수.
 * 가격은 구매 버튼에만 적는다(제목 옆에 또 적으면 같은 값이 두 번 보인다).
 * 보유 씨앗/단어장 변화, 중복 단어 검증 안내는 결과 화면과 서점 목록에서 이미 확인할 수 있어
 * 구매 결정 단계에서는 뺐다.
 *
 * 실패는 한 화면으로 합치지 않는다(§6). 보석 부족에서 "다시 시도"는 반드시 또 실패하므로
 * 본문을 한 줄로 줄인 뒤에도 **버튼만은 원인마다 다르게** 둔다.
 */
export const AddBookStoreNewBottomSheet = ({ bookStoreVocabularySheet }) => {
  "use memo";

  const { addBookStoreVocabularySheet, fetchBookStore } = useVocabulary();
  const { popNewBottomSheet, openNewBottomSheet } = useNewBottomSheetActions();
  const { userProfile, setUserProfile } = useUser();
  const { refreshStats } = useStats();
  const { refreshUnlock } = useOnboardingUnlock();

  // confirm → loading → (성공: 결과 시트로 교체) | short | error
  const [status, setStatus] = useState('confirm');

  const name = bookStoreVocabularySheet?.name || '단어장';
  const cost = Number(bookStoreVocabularySheet?.gem) || 0;
  const seeds = Array.isArray(bookStoreVocabularySheet?.words)
    ? bookStoreVocabularySheet.words.length
    : (Number(bookStoreVocabularySheet?.vocaCount) || 0);

  const gemCnt = Number(userProfile?.gem_cnt) || 0;
  const shortage = Math.max(0, cost - gemCnt);

  const n = (v) => v.toLocaleString('ko-KR');

  const close = () => {
    vibrate({ duration: 5 });
    popNewBottomSheet();
  };

  /** 성공 리턴 — 심긴 게 아니라 도착한 것(§7). QA 4차 — 그림은 서점 상세와 같은 씨앗 상자,
   *  버튼은 '확인' 하나(물주기 바로가기·남은 보석 캡션 제거). 닫으면 뒤의 상세 풀시트가
   *  서점 목록 재조회 결과로 '모두 보유 중'으로 바뀐다. */
  const openSuccess = () => {
    openNewBottomSheet(StorePurchaseResultNewBottomSheet, {
      options: {
        success: true,
        hero: <SeedBundleHero count={seeds} compact />,
        title: <>밭에 <ResultEm>씨앗 {n(seeds)}개</ResultEm>가<br />도착했어요</>,
        primary: { label: '확인' },
      },
    });
  };

  const handleBuy = async () => {
    if (status === 'loading') return;
    vibrate({ duration: 5 });
    if (cost > 0 && gemCnt < cost) { setStatus('short'); return; }

    setStatus('loading');
    try {
      // 보석 차감은 단어장 생성과 같은 서버 트랜잭션에서 한다(chargeGem) — 예전처럼 차감을
      // 먼저 따로 부르면 생성이 실패했을 때 보석만 빠졌다(이슈 #15, JLPT N3 동음이의어).
      const newBook = await addBookStoreVocabularySheet(bookStoreVocabularySheet, { chargeGem: cost > 0 });
      if (cost > 0 && newBook?.gemCnt !== undefined) {
        setUserProfile((prev) => ({ ...prev, gem_cnt: Number(newBook.gemCnt) }));
      }
      // 온보딩 미션(M3: 서점 단어장 담기)은 백엔드 훅이 완료 처리한다 — 최신 상태만 재조회.
      refreshUnlock();
      // 밭에 씨앗이 늘었다. 홈·마이 통계 캐시를 조용히 맞춘다.
      refreshStats?.();
      // 후속 QA — 방금 산 단어장의 notOwnedCount 가 상점 목록에 굳어 있으면 산 직후에도
      // "미보유 단어 N개"가 그대로 남는다. 서점 목록을 조용히 재조회해 맞춘다.
      fetchBookStore({ silent: true });
      openSuccess();
    } catch (e) {
      if (e?.reason === 'gem_short') { setStatus('short'); return; }
      console.error('단어장 추가 실패:', e);
      setStatus('error');
    }
  };

  // ── ⑦ 보석 부족 — 모자란 양과 두 갈래 (shop-result §3⑦) ──
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

  // ── ⑧ 처리 실패 — 원인 한 줄과 다시 시도 (shop-result §3⑧) ──
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

  // ── ⑥ 구매 확인 (shop-purchase §2⑥) — 가운데 정렬 안내문 하나 + 버튼.
  // 가격은 버튼에만 적는다 — 제목 옆에 또 적으면 같은 값이 두 번 보인다.
  return (
    <div className={`${SHEET_SHELL} max-h-[calc(90vh-40px)] overflow-y-auto`}>
      <Grab />

      <div className="pt-[20px] pb-[8px] text-center">
        <p className="mx-auto max-w-[280px] text-[15.5px] font-[700] leading-[1.5] tracking-[-0.03em] text-layout-black dark:text-layout-white">
          <b className="font-[800]">{name}</b> 단어장을 {cost > 0 ? '구매하시겠어요?' : '무료로 담으시겠어요?'}
        </p>
        {seeds > 0 && (
          <p className="mt-[8px] text-[12px] font-[500] tracking-[-0.02em] text-layout-gray-300">
            단어 {n(seeds)}개
          </p>
        )}
      </div>

      <Btns>
        <Btn tone="sec" onClick={close} disabled={status === 'loading'}>취소</Btn>
        <Btn tone="pri" onClick={handleBuy} disabled={status === 'loading'}>
          {status === 'loading'
            ? <BtnSpinner />
            : (cost > 0 ? <><Gem n={cost} size="s" />개로 구매</> : '무료로 담기')}
        </Btn>
      </Btns>
    </div>
  );
};

export default AddBookStoreNewBottomSheet;
