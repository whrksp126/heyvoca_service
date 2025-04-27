import React, { createContext, useContext, useState, useEffect } from 'react';
import FullSheet from '../components/common/FullSheet';

const FullSheetContext = createContext();

export const FullSheetProvider = ({ children }) => {
  const [stack, setStack] = useState([]);

  useEffect(() => {
    if (stack.length > 0) {
      window.history.pushState({ type: 'fullSheet' }, '');
    }

    const handlePopState = (event) => {
      if (event.state?.type === 'fullSheet') {
        handleBack();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [stack]);

  const push = (screen) => {
    setStack(prev => [...prev, screen]);
  };

  const handleBack = () => {
    if (stack.length > 0) {
      setStack(prev => prev.slice(0, -1));
      if (stack.length === 1) {
        window.history.back();
      }
    }
  };

  const reset = () => {
    setStack([]);
    if (stack.length > 0) {
      window.history.back();
    }
  };

  const currentScreen = stack[stack.length - 1];

  return (
    <FullSheetContext.Provider value={{ push, handleBack, reset }}>
      {children}
      <FullSheet
        isOpen={stack.length > 0}
        onClose={handleBack}
        title={currentScreen?.title || ''}
        showBackButton={stack.length > 0}
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