import { useEffect } from 'react';
import { pushStatusBarOverride } from '../utils/statusBarManager';

// 컴포넌트 마운트 동안 statusbar 텍스트 색상을 강제 지정.
// style: 'light-content' | 'dark-content' | null (null이면 override 안 함)
export const useStatusBarStyle = (style) => {
  useEffect(() => {
    if (!style) return undefined;
    return pushStatusBarOverride(style);
  }, [style]);
};
