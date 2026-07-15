import React from 'react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { StoreBuyItemNewBottomSheet } from './StoreBuyItemNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

// 보석 구매 전용 바텀시트 (구매 내역 없음).
// 진입점: 홈/상점 헤더의 보석, 단어장 구매 시 보석 부족, 마이페이지 보석 구매 버튼.
export const GemPurchaseNewBottomSheet = ({ notice }) => {
  "use memo";

  const { pushNewBottomSheet } = useNewBottomSheetActions();
  const { gemItems } = useUser();

  // 보석 구매(IAP)
  const handleGemClick = (id) => {
    vibrate({ duration: 5 });
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ type: 'iapPurchase', props: { itemId: id } })
    );
    pushNewBottomSheet(
      StoreBuyItemNewBottomSheet,
      {
        options: {
          productId: id,
          image_url: gemItems.find((g) => g.product_id === id)?.image_url,
        },
      },
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: false,
        hideUnderlying: true, // 결제 진행 중에는 하단 보석 구매 시트 숨김
      }
    );
  };

  return (
    <div className="flex flex-col gap-[24px] pt-[30px] pb-[20px] px-[20px]">
      {notice && (
        <div className="px-[16px] py-[12px] rounded-[8px] bg-primary-main-100 dark:bg-layout-gray-dark">
          <p className="text-[14px] font-[600] text-primary-main-600 text-center whitespace-pre-line">
            {notice}
          </p>
        </div>
      )}

      {/* 보석 구매 */}
      <div className="flex flex-col gap-[14px]">
        <h3 className="text-[16px] font-[700] text-layout-black dark:text-layout-white">
          보석 구매
        </h3>
        <div className="grid grid-cols-3 gap-[10px] gap-y-[20px]">
          {gemItems.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => handleGemClick(g.product_id)}
              className="relative flex flex-col items-center justify-center gap-[10px]"
            >
              <img src={g.image_url} alt="" className="w-[80px] h-[80px]" />
              {g.bonus > 0 && (
                <div className="absolute top-[5px] right-[5px] flex items-center justify-center w-[25px] h-[25px] rounded-[500px] bg-primary-main-600">
                  <span className="text-[10px] font-[600] text-layout-white dark:text-layout-black">+{g.bonus}</span>
                </div>
              )}
              <div className="flex flex-col gap-[3px] items-center">
                <h4 className="text-[14px] font-[600] text-layout-black dark:text-layout-white">
                  {g.name}
                </h4>
                <span className="px-[12px] py-[4px] rounded-[6px] bg-primary-main-600 text-[14px] font-[700] text-layout-white dark:text-layout-black">
                  ₩ {g.price.toLocaleString('ko-KR')}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GemPurchaseNewBottomSheet;
