import React, { createContext, useContext, useState } from 'react';
import BottomSheet from '../components/common/BottomSheet';

const BottomSheetContext = createContext();

export const BottomSheetProvider = ({ children }) => {
  const [screenStack, setScreenStack] = useState([]);
  const [isClosing, setIsClosing] = useState(false);

  const showBottomSheet = (content, options = {}) => {
    setScreenStack(prev => [...prev, { 
      content, 
      options,
      parentId: options.parentId || null
    }]);
  };

  const handleBack = () => {
    setIsClosing(true);
  };

  const handleExitComplete = () => {
    setScreenStack(prev => {
      const lastSheet = prev[prev.length - 1];
      if (lastSheet.parentId) {
        // 부모 바텀시트도 함께 닫기
        return prev.filter(sheet => 
          sheet.content.props.id !== lastSheet.parentId && 
          sheet.content.props.id !== lastSheet.content.props.id
        );
      }
      return prev.slice(0, -1);
    });
    setIsClosing(false);
  };

  const reset = () => {
    setScreenStack([]);
  };

  return (
    <BottomSheetContext.Provider value={{ showBottomSheet, handleBack, reset }}>
      {children}
      {screenStack.map((screen, index) => (
        <BottomSheet
          key={index}
          isOpen={!isClosing || index < screenStack.length - 1}
          onClose={handleExitComplete}
          isBackdropClickClosable={screen.options?.isBackdropClickClosable ?? true}
          isDragToCloseEnabled={screen.options?.isDragToCloseEnabled ?? true}
          style={{ zIndex: 1000 + index }}
        >
          {screen.content}
        </BottomSheet>
      ))}
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