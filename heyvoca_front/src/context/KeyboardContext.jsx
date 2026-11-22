import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const KeyboardContext = createContext();

const DEFAULT_HEADER_HEIGHT = '55px';
// BottomNav 실제 높이(`h-[60px]`)와 반드시 같아야 한다 — index.css 의 --height-bottom-nav 도 동일값
const DEFAULT_BOTTOM_NAV_HEIGHT = '60px';

const isFocusableInput = (target) => {
  if (!target || !target.tagName) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea';
};

const isInsideBottomSheet = (target) => {
  if (!target || typeof target.closest !== 'function') return false;
  return target.closest('[data-bottom-sheet]') !== null;
};

// 학습 문제 입력(data-keep-chrome)은 키보드가 떠도 헤더·진행바를 숨기지 않는다 — 문제 카드 영역 안에서만 줄어든다.
const keepsChrome = () => {
  const el = document.activeElement;
  return !!(el && typeof el.closest === 'function' && el.closest('[data-keep-chrome]'));
};

// 키보드가 뜨며 조상 스크롤러(overflow:hidden 포함)가 밀려 올라간 것을 되돌린다.
const resetScrollers = () => {
  [document.scrollingElement, document.getElementById('root'), document.querySelector('.scroll-container')]
    .forEach((el) => { if (el && el.scrollTop !== 0) el.scrollTop = 0; });
};

export const KeyboardProvider = ({ children }) => {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // RN postMessage가 신뢰 소스. 웹 폴백이 상태를 덮어쓰지 못하도록 플래그로 잠근다.
  const rnDrivenRef = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (isKeyboardVisible && !keepsChrome()) {
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
      if (visible && keepsChrome()) {
        // adjustResize 로 뷰포트가 줄어드는 사이 네이티브가 밀어 올린 스크롤을 되돌린다
        [0, 150, 400].forEach((ms) => setTimeout(resetScrollers, ms));
      }
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
