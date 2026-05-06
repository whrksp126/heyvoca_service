import React from 'react';
import { IconCamera } from '../../assets/svg/icon';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import DictionaryOcrResultNewFullSheet from '../newfullsheet/DictionaryOcrResultNewFullSheet';
import { vibrate } from '../../utils/osFunction';

const Header = () => {
  "use memo";

  const { pushNewFullSheet } = useNewFullSheetActions();

  const handleCameraClick = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(DictionaryOcrResultNewFullSheet);
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
        <h2 className='text-[16px] font-[700]'>사전</h2>
      </div>
      <div
        className="absolute right-[16px] flex items-center cursor-pointer"
        onClick={handleCameraClick}
      >
        <IconCamera width={22} height={20} className="text-primary-main-600" />
      </div>
    </div>
  );
};

export default Header;
