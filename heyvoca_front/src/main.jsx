// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import WebStorageMigration from './context/WebStorageMigration';


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WebStorageMigration />
    <App />
  </React.StrictMode>
);
