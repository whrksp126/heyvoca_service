import React, { useCallback, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { useFlyingAnimation } from '../../context/GemAnimationContext';
import postMessageManager from '../../utils/postMessageManager';

// Hook 제거 - 직접 컴포넌트 사용


// 네이티브가 "결제를 시작했다"(iap_purchase_started)고 알려 올 때까지 기다리는 시간.
//  이 시트는 backdrop·드래그 닫기가 꺼져 있고 확인 버튼도 isLoading 동안 disabled 라,
//  응답이 영영 안 오면 **사용자가 빠져나갈 수 없다.** 그래서 감시 시계를 둔다.
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
  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewBottomSheet } = useNewBottomSheetActions();

  // React Compiler가 자동으로 useCallback 처리
  const handleClose = () => {
    popNewBottomSheet();
  };
  useEffect(() => {
    // 결제 성공 콜백 등록
    const handlePurchaseSuccess = (data) => {
      console.log(`🎯 결제 성공 데이터 전체: ${JSON.stringify(data, null, 2)}`);

      // 실제 젬 데이터는 serverResponse.data 안에 있음
      const serverData = data.data.data;

      setStalled(null); // 늦게라도 결과가 왔으면 지연 안내는 걷는다
      if (serverData) {
        console.log(`🎯 서버 데이터: ${JSON.stringify(serverData, null, 2)}`);
        setPurchaseResult(serverData);
        setIsLoading(false);
      } else {
        console.error('❌ serverResponse.data가 없습니다!');
        setError('결제 데이터를 받지 못했습니다.');
        setIsLoading(false);
      }
    };

    // 결제 실패 콜백 등록
    const handlePurchaseError = (data) => {
      console.log('결제 실패 데이터:', data);
      setStalled(null);
      setError(data.data || '결제 중 오류가 발생했습니다.');
      setIsLoading(false);
      handleClose();
    };

    // 포스트메시지 리스너 등록
    postMessageManager.setupIAPPurchaseSuccess(handlePurchaseSuccess);
    postMessageManager.setupIAPPurchaseError(handlePurchaseError);
    // 컴포넌트 언마운트 시 리스너 정리
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
      endPoint: { type: 'element', value: '#gem-counter' }, // 보석 카운터로 날아감
      animationPreset: 'gem-burst', // 원하는 프리셋 선택 가능
      duration: 1.2,
      delay: 0.1,
      onStart: () => {
        console.log('💎 보석 애니메이션 시작!');
      },
      onComplete: () => {
        // 애니메이션 완료 후 카운트 업데이트
        setUserProfile(prevProfile => ({ ...prevProfile, gem_cnt: purchaseResult?.total_gems }));
        console.log('✅ 보석 애니메이션 완료!');
      }
    });

    // 2. 애니메이션이 시작된 후 약간의 시차를 두고 모달 닫기
    setTimeout(() => {
      handleClose();
    }, 500);
  }, [purchaseResult, options, setUserProfile, triggerFlyingAnimation]);

  return (
    <div className="">
      <div className="
        flex flex-col gap-[30px]
        max-h-[calc(90vh-47px)]
        p-[20px] pt-[40px] pb-[105px]
        overflow-y-auto
      ">
        <div className="flex flex-col items-center justify-center gap-[10px]">
          {isLoading && (
            <>
              <div className="flex items-center justify-center w-[80px] h-[80px]">
                <div className="animate-spin rounded-full h-[40px] w-[40px] border-b-2 border--primary-main-600"></div>
              </div>
              <div className="text-[18px] font-[700] text-layout-black dark:text-layout-white">스토어 결제 진행 중...</div>
            </>
          )}

          {error && (
            <>
              <div className="text-[48px]">❌</div>
              <div className="text-[18px] font-[700] text-[#FF3B30]">결제 실패</div>
            </>
          )}

          {stalled && !error && !purchaseResult && (
            <>
              <div className="text-[18px] font-[700] text-layout-black dark:text-layout-white text-center">
                {stalled === 'no-response' ? '결제를 시작하지 못했어요' : '결제 확인이 지연되고 있어요'}
              </div>
              <p className="text-[14px] font-[500] text-layout-gray-500 dark:text-layout-gray-50 text-center whitespace-pre-line">
                {stalled === 'no-response'
                  ? '잠시 후 다시 시도해 주세요.\n계속되면 앱을 최신 버전으로 업데이트해 주세요.'
                  : '창을 닫아도 결제가 완료되면\n보석은 자동으로 지급됩니다.'}
              </p>
            </>
          )}

          {purchaseResult?.verified && (
            <>
              <img src={options.image_url} alt="" className="w-[80px] h-[80px]" />
              <div className="text-[18px] font-[700] text-layout-black dark:text-layout-white text-center">
                <strong className="text-primary-main-600">보석 {purchaseResult?.gem_added}개</strong>를 구매 완료!
              </div>
            </>
          )}
        </div>

        <div className="
          absolute bottom-0 left-0 right-0
          flex items-center justify-between gap-[15px] p-[20px]
          bg-layout-white/80 dark:bg-layout-black/80 backdrop-blur-[1px]
        ">
          <motion.button
            className={`
              flex-1
              h-[45px]
              rounded-[8px]
              text-layout-white text-[16px] font-[700]
              bg-primary-main-600
            `}
            onClick={purchaseResult?.verified ? onConfirm : handleClose}
            whileTap={{ scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 15
            }}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-[6px] text-[24px]">
                <motion.span
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
                >•</motion.span>
                <motion.span
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: 0.25 }}
                >•</motion.span>
                <motion.span
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                >•</motion.span>
              </span>
            ) : (
              <span className="text-[16px] font-[700] text-layout-white">확인</span>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}; 