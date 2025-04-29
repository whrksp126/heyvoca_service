import React, { createContext, useContext, useState } from 'react';
import BottomSheet from '../components/common/BottomSheet';

const BottomSheetContext = createContext();

export const BottomSheetProvider = ({ children }) => {
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [bottomSheetContent, setBottomSheetContent] = useState(null);
  const [isBackdropClickClosable, setIsBackdropClickClosable] = useState(true);
  const [isDragToCloseEnabled, setIsDragToCloseEnabled] = useState(true);

  const showBottomSheet = (content, options = {}) => {
    setBottomSheetContent(content);
    setIsBackdropClickClosable(options.isBackdropClickClosable ?? true);
    setIsDragToCloseEnabled(options.isDragToCloseEnabled ?? true);
    setIsBottomSheetOpen(true);
  };

  const hideBottomSheet = () => {
    setIsBottomSheetOpen(false);
    setBottomSheetContent(null);
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