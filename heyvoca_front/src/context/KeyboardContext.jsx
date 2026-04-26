import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const KeyboardContext = createContext();

const DEFAULT_HEADER_HEIGHT = '55px';
const DEFAULT_BOTTOM_NAV_HEIGHT = '70px';

const isFocusableInput = (target) => {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea';
};

const isInsideBottomSheet = (target) => {
  if (!target || typeof target.closest !== 'function') return false;
  return target.closest('[data-bottom-sheet]') !== null;
};

export const KeyboardProvider = ({ children }) => {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // RN postMessage가 신뢰 소스. 웹 폴백이 상태를 덮어쓰지 못하도록 플래그로 잠근다.
  const rnDrivenRef = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (isKeyboardVisible) {
      root.style.setProperty('--current-header-height', '0px');
      root.style.setProperty('--current-bottom-nav-height', '0px');
      root.dataset.keyboardVisible = 'true';
    } else {
      root.style.setProperty('--current-header-height', DEFAULT_HEADER_HEIGHT);
      root.style.setProperty('--current-bottom-nav-height', DEFAULT_BOTTOM_NAV_HEIGHT);
      root.dataset.keyboardVisible = 'false';
    }
  }, [isKeyboardVisible]);

  useEffect(() => {
    const handleRnKeyboard = (e) => {
      const { height = 0, visible = false } = e.detail || {};
      rnDrivenRef.current = true;
      setKeyboardHeight(height);
      setIsKeyboardVisible(!!visible);
    };

    const handleFocusIn = (e) => {
      if (rnDrivenRef.current) return;
      if (!isFocusableInput(e.target)) return;
      if (isInsideBottomSheet(e.target)) return;
      setIsKeyboardVisible(true);
    };

    const handleFocusOut = (e) => {
      if (rnDrivenRef.current) return;
      if (!isFocusableInput(e.target)) return;
      setIsKeyboardVisible(false);
    };

    window.addEventListener('rn-keyboard', handleRnKeyboard);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      window.removeEventListener('rn-keyboard', handleRnKeyboard);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  return (
    <KeyboardContext.Provider value={{ isKeyboardVisible, keyboardHeight }}>
      {children}
    </KeyboardContext.Provider>
  );
};

export const useKeyboard = () => {
  const context = useContext(KeyboardContext);
  if (!context) {
    throw new Error('useKeyboard must be used within a KeyboardProvider');
  }
  return context;
};
