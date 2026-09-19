import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useUser } from '../../context/UserContext';
import { useVocabulary } from '../../context/VocabularyContext';
import { useStats } from '../../context/StatsContext';
import { useOnboardingUnlock } from '../../context/OnboardingUnlockContext';
import { deductGemApi } from '../../api/auth';
import { vibrate } from '../../utils/osFunction';
import {
  StorePurchaseResultNewBottomSheet, PurchaseResultBody, ResultEm,
} from './StorePurchaseResultNewBottomSheet';
import { GemPurchaseNewBottomSheet } from './GemPurchaseNewBottomSheet';
import {
  SHEET_SHELL, Grab, Gem, Btn, Btns, BtnSpinner, SheetHead, HintB,
} from './purchaseParts';
// 씨앗 도착(성공 리턴)에서만 쓰는 그림 — 확인 시트 머리는 이름과 가격만 보여주므로
// 여기서는 더 이상 쓰지 않는다.
import seedImg from '../../assets/images/farm/crops/unplanted/healthy-seed.png';

/**
 * 서점 단어장 구매 확인 시트.
 *
 * 시안 정본: shop-purchase.txt §2⑥(단어장 구매 확인),
 *            shop-result.txt §2③(단어장 성공) · §3⑦⑧(보석 부족 · 처리 실패) · §6(실패를 네 갈래로).
 *
 * 확인 시트는 "무엇을 얼마에 사는지"만 보여준다 — 이름 · 단어 수 · 가격.
 * 보유 씨앗/단어장 변화, 중복 단어 검증 안내는 결과 화면과 서점 목록에서 이미 확인할 수 있어
 * 구매 결정 단계에서는 뺐다.
 *
 * 실패는 한 화면으로 합치지 않는다(§6). 보석 부족에서 "다시 시도"는 반드시 또 실패하므로
 * 본문을 한 줄로 줄인 뒤에도 **버튼만은 원인마다 다르게** 둔다.
 */
export const AddBookStoreNewBottomSheet = ({ bookStoreVocabularySheet }) => {
  "use memo";

  const navigate = useNavigate();
  const { addBookStoreVocabularySheet, fetchBookStore } = useVocabulary();
  const { popNewBottomSheet, openNewBottomSheet, clearStack } = useNewBottomSheetActions();
  const { popNewFullSheet } = useNewFullSheetActions();
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

  /** 성공 리턴 — 심긴 게 아니라 도착한 것(§7). 다음 행동이 주 버튼이다(§5) */
  const openSuccess = (remainGem) => {
    openNewBottomSheet(StorePurchaseResultNewBottomSheet, {
      options: {
        success: true,
        image: seedImg,
        title: <>밭에 <ResultEm>씨앗 {n(seeds)}개</ResultEm>가<br />도착했어요</>,
        secondary: { label: '확인' },
        primary: {
          label: '이 단어장 물주기',
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
    if (cost > 0 && gemCnt < cost) { setStatus('short'); return; }

    setStatus('loading');
    try {
      let remainGem = gemCnt;
      if (cost > 0) {
        const res = await deductGemApi({
          gem_cnt: cost,
          bookstore_id: bookStoreVocabularySheet.id,
        });
        // fetchDataAsync 는 비-2xx 도 throw 하지 않는다 — code 로 확인한다.
        if (res?.code !== 200) { setStatus('error'); return; }
        remainGem = Number(res.data?.remaining_gem_cnt);
        setUserProfile((prev) => ({ ...prev, gem_cnt: remainGem }));
      }

      await addBookStoreVocabularySheet(bookStoreVocabularySheet);
      // 온보딩 미션(M3: 서점 단어장 담기)은 백엔드 훅이 완료 처리한다 — 최신 상태만 재조회.
      refreshUnlock();
      // 밭에 씨앗이 늘었다. 홈·마이 통계 캐시를 조용히 맞춘다.
      refreshStats?.();
      // 후속 QA — 방금 산 단어장의 notOwnedCount 가 상점 목록에 굳어 있으면 산 직후에도
      // "미보유 단어 N개"가 그대로 남는다. 서점 목록을 조용히 재조회해 맞춘다.
      fetchBookStore({ silent: true });
      openSuccess(remainGem);
    } catch (e) {
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

  // ── ⑥ 구매 확인 (shop-purchase §2⑥) — 이름 · 단어 수 · 가격만 보여준다 ──
  return (
    <div className={`${SHEET_SHELL} max-h-[calc(90vh-40px)] overflow-y-auto`}>
      <Grab />

      <SheetHead
        title={name}
        desc={seeds > 0 ? `단어 ${n(seeds)}개` : undefined}
        right={cost > 0
          ? <Gem n={cost} />
          : <span className="text-[13px] font-[800] text-status-success-600">무료</span>}
      />

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
