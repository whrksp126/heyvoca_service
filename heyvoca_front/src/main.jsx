// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './lib/feel/haptics'; // vibrate() 가로채기 등록(side effect)
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  // 서버 베포 용
  // <React.StrictMode>
  //   <App />
  // </React.StrictMode>

  // 로컬 개발 용
  <App />
);
