import React, { createContext, useContext, useState, useEffect } from 'react';
import BottomSheet from '../components/common/BottomSheet';

const BottomSheetContext = createContext();

export const BottomSheetProvider = ({ children }) => {
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [bottomSheetContent, setBottomSheetContent] = useState(null);
  const [isBackdropClickClosable, setIsBackdropClickClosable] = useState(true);
  const [isDragToCloseEnabled, setIsDragToCloseEnabled] = useState(true);

  useEffect(() => {
    if (isBottomSheetOpen) {
      // 바텀시트가 열릴 때 history에 상태 추가
      window.history.pushState({ type: 'bottomSheet' }, '');
    }

    // 뒤로가기 이벤트 리스너
    const handlePopState = (event) => {
      if (event.state?.type === 'bottomSheet') {
        hideBottomSheet();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isBottomSheetOpen]);

  const showBottomSheet = (content, options = {}) => {
    setBottomSheetContent(content);
    setIsBackdropClickClosable(options.isBackdropClickClosable ?? true);
    setIsDragToCloseEnabled(options.isDragToCloseEnabled ?? true);
    setIsBottomSheetOpen(true);
  };

  const hideBottomSheet = () => {
    setIsBottomSheetOpen(false);
    setBottomSheetContent(null);
    // 바텀시트를 직접 닫을 때도 history 관리
    if (isBottomSheetOpen) {
      window.history.back();
    }
  };

  return (
    <BottomSheetContext.Provider value={{ showBottomSheet, hideBottomSheet }}>
      {children}
      <BottomSheet 
        isOpen={isBottomSheetOpen} 
        onClose={hideBottomSheet}
        isBackdropClickClosable={isBackdropClickClosable}
        isDragToCloseEnabled={isDragToCloseEnabled}
      >
        {bottomSheetContent}
      </BottomSheet>
    </BottomSheetContext.Provider>
  );
};

export const useBottomSheet = () => {
  const context = useContext(BottomSheetContext);
  if (!context) {
    throw new Error('useBottomSheet must be used within a BottomSheetProvider');
  }
  return context;
}; 