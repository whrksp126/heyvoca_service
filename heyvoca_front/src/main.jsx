// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './lib/feel/haptics'; // vibrate() 가로채기 등록(side effect)
import './index.css';
import { getDevicePlatform } from './utils/osFunction';

// Android 앱: 시스템 내비 바는 깎으면 겹치므로 하단 inset 보정을 끈다(iOS 전용 보정).
if (getDevicePlatform() === 'android') {
  document.documentElement.style.setProperty('--bottom-inset-trim', '0px');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  // 서버 베포 용
  // <React.StrictMode>
  //   <App />
  // </React.StrictMode>

  // 로컬 개발 용
  <App />
);
