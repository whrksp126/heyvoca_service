import React, { useEffect } from 'react';
import { GemAnimationProvider } from '../context/GemAnimationContext';

const Layout = ({ children }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  useEffect(() => {
    const handleFocus = (e) => {
      // input이나 textarea에 포커스될 때만 동작
      const tagName = e.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') {
        const targetElement = e.target;
        // 1. iOS가 강제로 화면을 밀어 올리는 것을 방지하기 위해 0으로 고정
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
        }, 10);

        // 2. 입력창이 키보드 바로 위에 보이게 scrolling 유도
        setTimeout(() => {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    };

    // 캡처링 단계에서 이벤트 감지
    window.addEventListener('focus', handleFocus, true);
    return () => window.removeEventListener('focus', handleFocus, true);
  }, []);

  return (
    <GemAnimationProvider>
      {/* 
        .scroll-container: index.css에 정의됨. 
        내부 스크롤을 활성화하고 외부(body) 스크롤은 막혀있음.
      */}
      <div className="scroll-container min-h-screen bg-layout-white dark:bg-layout-black
                      text-layout-black dark:text-layout-white
                      transition-colors duration-200">
        {children}
      </div>
    </GemAnimationProvider>
  );
};

export default Layout; 