// 화면/풀시트별 statusbar 텍스트 색상 override 스택.
// 가장 최근 push된 override가 적용되고, 모두 빠지면 테마 기반 default로 복귀.

let overrideStack = [];
let defaultStyle = 'dark-content';

const send = (style) => {
  if (typeof window !== 'undefined' && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'setStatusBarStyle', style })
    );
  }
};

const applyTop = () => {
  const top = overrideStack.length
    ? overrideStack[overrideStack.length - 1].style
    : defaultStyle;
  send(top);
};

export const pushStatusBarOverride = (style) => {
  const entry = { style };
  overrideStack.push(entry);
  applyTop();
  return () => {
    overrideStack = overrideStack.filter((e) => e !== entry);
    applyTop();
  };
};

export const setDefaultStatusBarStyle = (style) => {
  defaultStyle = style;
  if (overrideStack.length === 0) send(style);
};
