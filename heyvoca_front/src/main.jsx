// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import WebStorageMigration from './context/WebStorageMigration';

ReactDOM.createRoot(document.getElementById('root')).render(
  // 서버 베포 용
  // <React.StrictMode>
  //   <WebStorageMigration />
  //   <App />
  // </React.StrictMode>

  // 로컬 개발 용
  <>
    <WebStorageMigration />
    <App />
  </>
);
