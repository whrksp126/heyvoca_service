import React, { createContext, useContext, useState } from 'react';
import FullSheet from '../components/common/FullSheet';

const FullSheetContext = createContext();

export const FullSheetProvider = ({ children }) => {
  const [currentScreen, setCurrentScreen] = useState(null);

  const pushFullSheet = (screen) => {
    setCurrentScreen(screen);
  };

  const handleBack = () => {
    setCurrentScreen(null);
  };

  const reset = () => {
    setCurrentScreen(null);
  };

  return (
    <FullSheetContext.Provider value={{ pushFullSheet, handleBack, reset }}>
      {children}
      <FullSheet
        isOpen={!!currentScreen}
        onClose={handleBack}
        showBackButton={false}
      >
        {currentScreen?.component}
      </FullSheet>
    </FullSheetContext.Provider>
  );
};

export const useFullSheet = () => {
  const context = useContext(FullSheetContext);
  if (!context) {
    throw new Error('useFullSheet must be used within a FullSheetProvider');
  }
  return context;
}; 