import React, { createContext, useContext, useState } from 'react';
import FullSheet from '../components/common/FullSheet';

const FullSheetContext = createContext();

export const FullSheetProvider = ({ children }) => {
  const [screenStack, setScreenStack] = useState([]);
  const [isClosing, setIsClosing] = useState(false);

  const pushFullSheet = (screen) => {
    setScreenStack(prev => [...prev, screen]);
  };

  const handleBack = () => {
    setIsClosing(true);
  };

  const handleExitComplete = () => {
    setScreenStack(prev => prev.slice(0, -1));
    setIsClosing(false);
  };

  const handleReset = () => {
    setScreenStack([]);
  };

  return (
    <FullSheetContext.Provider value={{ pushFullSheet, handleBack, handleReset }}>
      {children}
      {screenStack.map((screen, index) => (
        <FullSheet
          key={index}
          isOpen={!isClosing || index < screenStack.length - 1}
          onClose={handleExitComplete}
        >
          {screen.component}
        </FullSheet>
      ))}
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