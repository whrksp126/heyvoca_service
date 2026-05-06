import React from 'react';
import { useUser } from '../../context/UserContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { StoreBuyItemNewBottomSheet } from '../newBottomSheet/StoreBuyItemNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

const GemSection = () => {
  "use memo";

  const { gemItems } = useUser();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

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
      }
    );
  };

  return (
    <section className="flex flex-col gap-[16px] py-[20px]">
      <h3 className="text-center text-[16px] font-[700] text-layout-black dark:text-layout-white">
        보석
      </h3>
      <div className="grid grid-cols-3 gap-[10px] gap-y-[20px] px-[16px]">
        {gemItems.map((gem) => (
          <button
            key={gem.id}
            type="button"
            onClick={() => handleGemClick(gem.product_id)}
            className="relative flex flex-col items-center justify-center gap-[10px]"
          >
            <img src={gem.image_url} alt="" className="w-[80px] h-[80px]" />
            {gem.bonus > 0 && (
              <div className="absolute top-[5px] right-[5px] flex items-center justify-center w-[25px] h-[25px] rounded-[500px] bg-primary-main-600">
                <span className="text-[10px] font-[600] text-layout-white">+{gem.bonus}</span>
              </div>
            )}
            <div className="flex flex-col gap-[3px] items-center">
              <h4 className="text-[14px] font-[600] text-layout-black dark:text-layout-white">
                {gem.name}
              </h4>
              <span className="px-[12px] py-[4px] rounded-[6px] bg-primary-main-600 text-[14px] font-[700] text-layout-white">
                ₩ {gem.price}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default GemSection;
