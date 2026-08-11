import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Seal } from '@phosphor-icons/react';
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
  SHEET_SHELL, Grab, Gem, Btn, Btns, BtnSpinner, SheetHead,
  RecvBox, RecvRow, RecvHr, Arrow, Up, Down, InfoBox, EmBlue, HintB,
} from './purchaseParts';
// 아직 사지 않은 단어장의 '심을 씨앗' — 봉투 그림이 맞다 (기획 5.1 보유 씨앗)
import seedImg from '../../assets/images/farm/crops/unplanted/healthy-seed.png';

/**
 * 서점 단어장 구매 확인 시트.
 *
 * 시안 정본: shop-purchase.txt §2⑥(단어장 구매 확인) · §3(확인 시트의 세 값) ·
 *            §6(겹치는 단어를 사기 전에 말한다) · §7(산 것은 보유 씨앗이다),
 *            shop-result.txt §2③(단어장 성공) · §3⑦⑧(보석 부족 · 처리 실패) · §6(실패를 네 갈래로).
 *
 * 전 버전은 "보석 N개로 단어장을 추가하시겠어요?" 한 문장이 전부였다(§3 이 지목한 그 화면).
 * 시안이 요구하는 건 결제액 하나가 아니라 **세 값이 어떻게 바뀌는지**다 —
 * 보석 잔액 · 보유 씨앗 · 단어장 수. 화살표는 늘 "지금 → 산 뒤" 방향이다.
 *
 * 실패는 한 화면으로 합치지 않는다(§6). 보석 부족에서 "다시 시도"는 반드시 또 실패하므로
 * 본문을 한 줄로 줄인 뒤에도 **버튼만은 원인마다 다르게** 둔다.
 */
export const AddBookStoreNewBottomSheet = ({ bookStoreVocabularySheet }) => {
  "use memo";

  const navigate = useNavigate();
  const { addBookStoreVocabularySheet, vocabularySheets } = useVocabulary();
  const { popNewBottomSheet, openNewBottomSheet, clearStack } = useNewBottomSheetActions();
  const { popNewFullSheet } = useNewFullSheetActions();
  const { userProfile, setUserProfile } = useUser();
  const { farmOverview, refreshStats } = useStats();
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
  const bookCnt = Array.isArray(vocabularySheets) ? vocabularySheets.length : null;
  // 보유 씨앗 = 아직 밭에 심지 않은 단어(§7). 농장 요약이 아직 없으면 그 줄만 접는다 —
  // 없는 값을 0 으로 적으면 "지금 → 산 뒤"가 거짓말이 된다.
  const heldSeeds = Number.isFinite(Number(farmOverview?.seed_detail?.unplanted))
    ? Number(farmOverview.seed_detail.unplanted)
    : null;

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

  // 화살표 줄은 "지금 → 산 뒤" 하나뿐이라 값이 있는 것만 순서대로 쌓는다(§3).
  const changeRows = [];
  if (cost > 0) {
    changeRows.push({
      k: '보유 보석',
      value: <><span>{n(gemCnt)}</span><Arrow /><Down>{n(Math.max(0, gemCnt - cost))}</Down></>,
    });
  }
  if (heldSeeds !== null && seeds > 0) {
    changeRows.push({
      k: '보유 씨앗',
      value: <><span>{n(heldSeeds)}개</span><Arrow /><Up>{n(heldSeeds + seeds)}개</Up></>,
    });
  }
  if (bookCnt !== null) {
    changeRows.push({
      k: '단어장',
      value: <><span>{n(bookCnt)}개</span><Arrow /><Up>{n(bookCnt + 1)}개</Up></>,
    });
  }

  // ── ⑥ 구매 확인 (shop-purchase §2⑥) ─────────────────────
  return (
    <div className={`${SHEET_SHELL} max-h-[calc(90vh-40px)] overflow-y-auto`}>
      <Grab />

      <SheetHead
        image={seedImg}
        imageAlt=""
        title={name}
        desc={seeds > 0 ? `심을 씨앗 ${n(seeds)}개 · 헤이보카 검증` : '헤이보카 검증'}
      />

      {/* §3 — 결제액 하나가 아니라 세 값이 어떻게 바뀌는지를 적는다 */}
      <RecvBox>
        <RecvRow k="결제" tight>
          {cost > 0 ? <Gem n={cost} /> : '무료'}
        </RecvRow>
        {changeRows.length > 0 && <RecvHr />}
        {changeRows.map((r, i) => (
          <RecvRow key={r.k} k={r.k} tight={i === 0}>{r.value}</RecvRow>
        ))}
      </RecvBox>

      {/* §6 — 겹치는 단어를 사기 전에 말한다. 검증 시스템의 이득으로 읽히게 먼저 말한다 */}
      <InfoBox tone="blue" icon={<Seal size={13} weight="fill" className="text-secondary-blue-600" />}>
        검증된 단어라 <EmBlue>다른 단어장에 같은 단어가 있으면 성장 상태를 함께 써요.</EmBlue>
        {' '}이미 키우던 단어는 처음부터 다시 심지 않아요.
      </InfoBox>

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
