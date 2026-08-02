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
      w-full h-[var(--current-header-height)]
      overflow-hidden
      px-[16px]
      bg-layout-white
      dark:bg-layout-black
    '>
      <div className="center">
        {/* 시안 §10 · find 1절 — 탭 이름이 "사전"에서 "찾기"로 바뀌었다.
            검색 전에는 내가 가진 단어 목록이고, 검색 후에야 사전이 되는 화면이라서다. */}
        <h2 className='text-[16px] font-[700]'>찾기</h2>
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
