import React from 'react';
import gem from "../../assets/images/gem.png";
import { useUser } from '../../context/UserContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { GemPurchaseNewBottomSheet } from '../newBottomSheet/GemPurchaseNewBottomSheet';
import { vibrate } from '../../utils/osFunction';

const Header = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { userProfile } = useUser();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  const handleGemClick = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(GemPurchaseNewBottomSheet, {}, { isBackdropClickClosable: true, isDragToCloseEnabled: true });
  };

  return (
    <div
      data-page-header
      className='
      relative
      flex items-center justify-center
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-layout-white
      dark:bg-layout-black
    '>
      <div className="center">
        <h2 className='text-[16px] font-[700]'>
          상점
        </h2>
      </div>
      <button
        type="button"
        onClick={handleGemClick}
        className="absolute right-[16px] flex gap-[5px] items-center"
      >
        <img src={gem} alt="보석" className="w-[20px] h-[18px]" />
        <span className="text-layout-black dark:text-layout-white text-[16px] font-bold">{userProfile.gem_cnt}</span>
      </button>
    </div>
  );
};

export default Header;