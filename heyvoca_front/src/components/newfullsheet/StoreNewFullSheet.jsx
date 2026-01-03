import React from 'react';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import gem from '../../assets/images/gem.png';
import { useUser } from '../../context/UserContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { StoreBuyItemNewBottomSheet } from '../newBottomSheet/StoreBuyItemNewBottomSheet';
import { vibrate } from '../../utils/osFunction'; 

const StoreNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  // Actions만 구독하므로 state 변경 시 리렌더링 안 됨
  const { popNewFullSheet } = useNewFullSheetActions();
  const { gemItems, userProfile } = useUser();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  // React Compiler가 자동으로 메모이제이션 처리
  const handleGemClick = (id) => {
    vibrate({ duration: 5 });
    window.ReactNativeWebView.postMessage(JSON.stringify({'type': 'iapPurchase', 'props': {itemId: id}}));
    pushNewBottomSheet(
      StoreBuyItemNewBottomSheet,
      {
        options: {productId: id, image_url: gemItems.find(gem => gem.product_id === id).image_url}
      },
      {
        isBackdropClickClosable: false,
        isDragToCloseEnabled: false
      }
    );
  }

  return (
    <div className="
      flex flex-col 
      w-full h-full
      bg-white
    ">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      {/* Header */}
      <div className="
        relative
        flex items-center justify-center
        h-[55px] 
        pt-[20px] px-[10px] pb-[14px]
      ">
        
        <motion.button
          onClick={() => {
            vibrate({ duration: 5 });
            popNewFullSheet();
          }}
          className="
            absolute top-[18px] left-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
            p-[4px]
            rounded-[8px]
          "
          whileHover={{ 
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            scale: 1.05
          }}
          whileTap={{ 
            scale: 0.95,
            backgroundColor: 'rgba(0, 0, 0, 0.1)'
          }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 17
          }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="
          text-[18px] font-[700]
          text-[#111] dark:text-[#fff]
        ">상점</h1>
        <div
          className="
            absolute top-[18px] right-[10px]
            flex items-center gap-[4px]
            text-[#CCC] dark:text-[#fff]
          "
        >
          <div 
            id="gem-counter" 
            className="flex gap-[5px] items-center"
          >
            <img src={gem} alt="보석" className="w-[20px] h-[18px]" />
            <span className="text-[#111] text-[16px] font-bold">{userProfile.gem_cnt}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-[10px] gap-y-[20px] p-[16px]">
        {gemItems.map((gem) => (
        <div key={gem.id} className="relative flex flex-col items-center justify-center gap-[10px]"
        onClick={() => handleGemClick(gem.product_id)}
        >
          <img src={gem.image_url} alt="" className="w-[80px] h-[80px]" />
          {gem.bonus > 0 && (
          <div className="absolute top-[5px] right-[5px] flex items-center justify-center w-[25px] h-[25px] rounded-[500px] bg-[#FF8DD4]">
            <span className="text-[10px] font-[600] text-[#fff]">+{gem.bonus}</span>
          </div>
          )}
          <div className="flex flex-col gap-[3px]">
            <h1 className="text-[14px] font-[600] text-[#111]">{gem.name}</h1>
            <span className="text-center text-[14px] font-[700] text-[#FF8DD4]">₩ {gem.price}</span>
          </div>
        </div>
        ))}
      </div>

    </div>
  );
};

export default StoreNewFullSheet;

