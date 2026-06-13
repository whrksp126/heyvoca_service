import React, { createContext, useContext, useEffect, useState } from 'react';

const ExampleSettingsContext = createContext();

const STORAGE_KEY = 'exampleSettings';

// "예문 항상 보기" 설정. 테마처럼 이 기기(localStorage)에만 저장한다.
export const ExampleSettingsProvider = ({ children }) => {
  const [showExamples, setShowExamples] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved?.showAlways ?? false;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ showAlways: showExamples }));
    } catch (e) {
      /* noop */
    }
  }, [showExamples]);

  return (
    <ExampleSettingsContext.Provider value={{ showExamples, setShowExamples }}>
      {children}
    </ExampleSettingsContext.Provider>
  );
};

export const useExampleSettings = () => {
  const context = useContext(ExampleSettingsContext);
  if (!context) {
    throw new Error('useExampleSettings must be used within an ExampleSettingsProvider');
  }
  return context;
};
