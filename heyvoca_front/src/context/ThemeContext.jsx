import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  // OS 설정 감지
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  
  const [isDark, setIsDark] = useState(() => {
    // 1. localStorage 확인
    // 2. OS 설정 확인
    // 3. 기본값은 라이트모드
    return localStorage.theme === 'dark' || 
           (!('theme' in localStorage) && prefersDark.matches);
  });

  useEffect(() => {
    // dark 클래스 토글
    document.documentElement.classList.toggle('dark', isDark);
    // localStorage 저장
    localStorage.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  // OS 테마 변경 감지
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      setIsDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, setIsDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext); 