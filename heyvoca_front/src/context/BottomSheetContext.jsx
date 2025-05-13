import React, { createContext, useContext, useState } from 'react';
import BottomSheet from '../components/common/BottomSheet';

const BottomSheetContext = createContext();

export const BottomSheetProvider = ({ children }) => {
  const [screenStack, setScreenStack] = useState([]);
  const [isClosing, setIsClosing] = useState(false);
  const [isExitComplete, setIsExitComplete] = useState(false);

  const pushBottomSheet = (content, options = {}) => {
    setScreenStack(prevStack => {
      const newStack = [...prevStack, { content, options }];
      return newStack;
    });
  };

  const handleBack = () => {
    setScreenStack(prevStack => {
      if(prevStack.length !== 1){
        return prevStack.slice(0, -1);
      }else{
        setIsExitComplete(true);
        return prevStack;
      }
    });
  };

  const handleExitComplete = () => {
    setScreenStack(prevStack => prevStack.slice(0, -1));
    setIsExitComplete(false);
  };

  const handleReset = () => {
    setScreenStack([]);
  };

  return (
    <BottomSheetContext.Provider value={{ pushBottomSheet, handleBack, handleExitComplete, handleReset }}>
      {children}
      {screenStack.map((screen, index) => (
        <BottomSheet
          key={index}
          isOpen={!isExitComplete && index === screenStack.length - 1}
          isExitComplete={isExitComplete}
          onClose={handleBack}
          onExitComplete={handleExitComplete}
          isBackdropClickClosable={screen.options?.isBackdropClickClosable ?? true}
          isDragToCloseEnabled={screen.options?.isDragToCloseEnabled ?? true}
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