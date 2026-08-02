import React, { useCallback, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { useFlyingAnimation } from '../../context/GemAnimationContext';
import postMessageManager from '../../utils/postMessageManager';
import { nativeUnavailableReason, describeBridgeError } from '../../utils/nativeBridge';
import { showToast } from '../../utils/osFunction';
import {
  SHEET_SHELL, Grab, Btn, Btns, Hint,
} from './purchaseParts';
import { PurchaseResultBody, ResultEm } from './StorePurchaseResultNewBottomSheet';

/**
 * 보석 충전(인앱결제) 진행 · 결과 시트.
 *
 * 시안 정본: shop-result.txt §2⑥(보석 충전 성공) · §3⑩(보석 — 결제 실패) · §5(리턴 공통 규격),
 *            shop-purchase.txt §5(실패 화면이 먼저 해야 할 말).
 *
 * ⚠ 결제 자체는 네이티브가 한다 — 이 시트는 `iapPurchase` 를 보낸 **뒤에** 열리고
 * postMessage 결과만 받아 그린다. 브릿지 계약(메시지 형식·리스너 등록)은 손대지 않는다.
 *
 * 실패 화면에서 이모지를 쓰지 않는다(§5) — ❌ 는 사용자가 잘못한 것처럼 읽힌다.
 * 연한 붉은 원 안의 얇은 X 로 충분하다.
 */

// 네이티브가 "결제를 시작했다"(iap_purchase_started)고 알려 올 때까지 기다리는 시간.
//  이 시트는 backdrop·드래그 닫기가 꺼져 있어 응답이 영영 안 오면 빠져나갈 수 없다. 그래서 감시 시계를 둔다.
const ACK_TIMEOUT_MS = 15 * 1000;
// 시작은 했는데 끝내 성공/실패가 안 오는 경우의 마지막 그물. 결제 승인(카드·가족승인)이 오래 걸릴 수
//  있으므로 넉넉히 잡고, **결제를 취소하는 게 아니라 화면만 열어 준다**(지급은 서버 검증으로 진행된다).
const RESULT_TIMEOUT_MS = 5 * 60 * 1000;

export const StoreBuyItemNewBottomSheet = ({ options }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const [isLoading, setIsLoading] = useState(true);
  const [purchaseResult, setPurchaseResult] = useState(null);
  const [error, setError] = useState(null);
  // 'no-response' = 네이티브가 시작 신호조차 안 줌 · 'slow' = 시작했는데 결과가 안 옴
  const [stalled, setStalled] = useState(null);
  const { setUserProfile } = useUser();
  const { triggerFlyingAnimation } = useFlyingAnimation();
  const { popNewBottomSheet } = useNewBottomSheetActions();

  const handleClose = () => {
    popNewBottomSheet();
  };

  useEffect(() => {
    // 결제 성공 콜백 등록
    const handlePurchaseSuccess = (data) => {
      // 실제 젬 데이터는 serverResponse.data 안에 있음
      const serverData = data?.data?.data;

      setStalled(null); // 늦게라도 결과가 왔으면 지연 안내는 걷는다
      if (serverData) {
        setPurchaseResult(serverData);
        setIsLoading(false);
      } else {
        console.error('결제 응답에 serverResponse.data 가 없습니다.');
        setError('결제 데이터를 받지 못했어요.');
        setIsLoading(false);
      }
    };

    // 결제 실패 콜백 등록 — 시트를 바로 닫지 않는다.
    // 시안 §3⑩ 은 "무슨 일이 났는가"와 "다시 시도"를 이 화면에서 읽게 한다.
    const handlePurchaseError = (data) => {
      setStalled(null);
      setError(typeof data?.data === 'string' && data.data ? data.data : '스토어에서 결제가 취소됐어요.');
      setIsLoading(false);
    };

    postMessageManager.setupIAPPurchaseSuccess(handlePurchaseSuccess);
    postMessageManager.setupIAPPurchaseError(handlePurchaseError);
    return () => {
      postMessageManager.removeIAPPurchaseSuccess();
      postMessageManager.removeIAPPurchaseError();
    };
  }, []);

  // ── 무응답 감시 ────────────────────────────────────────────────────────
  // 구버전 앱·네이티브 결제 초기화 실패 등으로 아무 메시지도 안 오면 이 시트는 닫을 수단이 없다.
  //  두 단계로 나눈 이유: "시작조차 못 함"(빨리 알려야 함)과 "시작했는데 오래 걸림"(기다려야 함)은
  //  사용자에게 할 말이 다르다. 어느 쪽이든 **결제를 취소하지 않고 화면만 열어 준다.**
  useEffect(() => {
    if (!isLoading) return undefined;
    let acked = false;
    const offAck = postMessageManager.waitFor('iap_purchase_started', () => { acked = true; });
    const ackTimer = setTimeout(() => {
      if (acked) return;
      setStalled('no-response');
      setIsLoading(false);
    }, ACK_TIMEOUT_MS);
    const resultTimer = setTimeout(() => {
      setStalled((prev) => prev || 'slow');
      setIsLoading(false);
    }, RESULT_TIMEOUT_MS);
    return () => {
      offAck();
      clearTimeout(ackTimer);
      clearTimeout(resultTimer);
    };
  }, [isLoading]);

  const onConfirm = useCallback(() => {
    // 1. 애니메이션 즉시 시작 (바텀시트가 열려 있는 상태에서)
    triggerFlyingAnimation({
      imageUrl: options.image_url,
      quantity: purchaseResult?.quantity || 1,
      startPoint: { type: 'position', value: 'center-bottom' },
      endPoint: { type: 'element', value: '#gem-counter' },
      animationPreset: 'gem-burst',
      duration: 1.2,
      delay: 0.1,
      onComplete: () => {
        setUserProfile((prevProfile) => ({ ...prevProfile, gem_cnt: purchaseResult?.total_gems }));
      },
    });

    // 2. 애니메이션이 시작된 후 약간의 시차를 두고 모달 닫기
    setTimeout(() => { handleClose(); }, 500);
  }, [purchaseResult, options, setUserProfile, triggerFlyingAnimation]);

  /**
   * 다시 시도 — 처음 열 때 호출부가 보낸 것과 **같은 메시지**를 그대로 다시 보낸다.
   * 브릿지가 없는 환경에서는 아무 일도 일어나지 않으므로 먼저 막는다(그러지 않으면 무한 대기가 된다).
   */
  const retry = () => {
    const blocked = nativeUnavailableReason('iapPurchase');
    if (blocked) {
      showToast(describeBridgeError(blocked));
      return;
    }
    setError(null);
    setStalled(null);
    setIsLoading(true);
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ type: 'iapPurchase', props: { itemId: options?.productId } })
    );
  };

  const n = (v) => (Number(v) || 0).toLocaleString('ko-KR');

  // ── ⑥ 충전 성공 — 잔액만 있으면 된다 (shop-result §2⑥) ──
  if (purchaseResult?.verified) {
    const added = Number(purchaseResult.gem_added) || 0;
    const after = Number(purchaseResult.total_gems) || 0;
    return (
      <div className={SHEET_SHELL}>
        <Grab />
        <PurchaseResultBody
          success
          image={options?.image_url}
          title={<><ResultEm>보석 {n(added)}개</ResultEm>를<br />충전했어요</>}
          pill={{ from: `보유 ${n(after - added)}`, to: n(after) }}
        />
        <Btns>
          <Btn tone="pri" wide onClick={onConfirm}>확인</Btn>
        </Btns>
        {/* 보너스는 이미 잔액 숫자 안에 들어 있다 — 따로 적지 않는다(§2⑥) */}
        <Hint center className="mt-[10px]">
          영수증은 마이페이지 · 보석 내역에서 볼 수 있어요
        </Hint>
      </div>
    );
  }

  // ── ⑩ 결제 실패 — 스토어 쪽 사정 (shop-result §3⑩) ──────
  if (error) {
    return (
      <div className={SHEET_SHELL}>
        <Grab />
        <PurchaseResultBody
          success={false}
          kind="error"
          title="결제가 끝나지 않았어요"
          desc={error}
        />
        <Btns>
          <Btn tone="sec" onClick={handleClose}>닫기</Btn>
          <Btn tone="pri" onClick={retry}>다시 시도</Btn>
        </Btns>
      </div>
    );
  }

  // ── 응답이 없거나 지연될 때 (시안에 없는 안전장치) ────────
  // 결제를 취소하는 게 아니라 화면만 열어 준다. 지급은 서버 검증으로 계속 진행된다.
  if (stalled) {
    return (
      <div className={SHEET_SHELL}>
        <Grab />
        <PurchaseResultBody
          success={false}
          kind="shortage"
          title={stalled === 'no-response' ? '결제를 시작하지 못했어요' : '결제 확인이 지연되고 있어요'}
          desc={stalled === 'no-response'
            ? <>잠시 후 다시 시도해 주세요.<br />계속되면 앱을 최신 버전으로 업데이트해 주세요.</>
            : <>창을 닫아도 결제가 완료되면<br />보석은 자동으로 지급돼요.</>}
        />
        <Btns>
          {stalled === 'no-response' ? (
            <>
              <Btn tone="sec" onClick={handleClose}>닫기</Btn>
              <Btn tone="pri" onClick={retry}>다시 시도</Btn>
            </>
          ) : (
            <Btn tone="pri" wide onClick={handleClose}>확인</Btn>
          )}
        </Btns>
      </div>
    );
  }

  // ── 결제 진행 중 (시안 .spin) ───────────────────────────
  return (
    <div className={SHEET_SHELL}>
      <Grab />
      <div className="text-center pt-[6px]">
        <span className="flex items-center justify-center w-[84px] h-[84px] mx-auto mt-[2px] mb-[14px]">
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="block w-[38px] h-[38px] rounded-full border-4 border-primary-main-200 dark:border-primary-main-dark border-t-primary-main-600"
          />
        </span>
        <h3 className="text-[19px] font-[800] leading-[1.35] tracking-[-0.04em] text-layout-black dark:text-layout-white">
          스토어에서 결제 중이에요
        </h3>
        <p className="mt-[8px] text-[12.5px] leading-[1.6] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
          결제가 끝날 때까지 이 화면을 닫지 말아 주세요.
        </p>
      </div>
      <Btns>
        <Btn tone="sec" wide disabled>결제 진행 중</Btn>
      </Btns>
    </div>
  );
};

export default StoreBuyItemNewBottomSheet;
