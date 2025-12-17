import React from 'react';
import gem from "../../assets/images/gem.png";
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import StoreNewFullSheet from '../newFullSheet/StoreNewFullSheet';

const Header = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { userProfile } = useUser();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const handleStoreButtonClick = () => {
    pushNewFullSheet(StoreNewFullSheet, {}, {
      smFull: true,
      closeOnBackdropClick: true
    });
  };

  return (
    <div className='
      relative
      flex items-center justify-center
      w-full h-[55px]
      px-[16px] py-[14px]
      bg-[#fff] 
      dark:bg-[#111]
    '>
      <div className="center">
        <h2 className='text-[16px] font-[700]'>
          서점
        </h2>
      </div>
      <div className="absolute right-[16px] flex gap-[5px] items-center" onClick={handleStoreButtonClick}>
          <img src={gem} alt="보석" className="w-[20px] h-[18px]" />
          <span className="text-[#111111] text-[16px] font-[600]">{userProfile.gem_cnt}</span>
        </div>
    </div>
  );
};

export default Header; 