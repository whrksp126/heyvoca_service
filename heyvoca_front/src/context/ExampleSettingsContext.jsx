import React, { createContext, useContext, useEffect, useState } from 'react';

const ExampleSettingsContext = createContext();

const STORAGE_KEY = 'exampleSettings';

const readSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
};

// "예문 항상 보기" · "후리가나 표시" 설정. 테마처럼 이 기기(localStorage)에만 저장한다.
export const ExampleSettingsProvider = ({ children }) => {
  const [showExamples, setShowExamples] = useState(() => readSaved().showAlways ?? false);
  // 일본어 예문 후리가나(ruby) 표시 — 기본 켬.
  const [showFurigana, setShowFurigana] = useState(() => readSaved().showFurigana ?? true);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ showAlways: showExamples, showFurigana })
      );
    } catch (e) {
      /* noop */
    }
  }, [showExamples, showFurigana]);

  return (
    <ExampleSettingsContext.Provider
      value={{ showExamples, setShowExamples, showFurigana, setShowFurigana }}
    >
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

// Provider 밖에서도 안전하게 쓰는 후리가나 설정 조회(없으면 기본 켬).
export const useShowFurigana = () => {
  const context = useContext(ExampleSettingsContext);
  return context?.showFurigana ?? true;
};
