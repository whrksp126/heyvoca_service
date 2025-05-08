// src/App.jsx

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import Home from './pages/Home';
import Login from './pages/Login';
import VocabularySheets from './pages/VocabularySheets';
import Store from './pages/Store';
import Class from './pages/Class';

import MyPage from './pages/mypage/MyPage';
import Account from './pages/mypage/Account';
import Theme from './pages/mypage/Theme';
import ExampleSettings from './pages/mypage/ExampleSettings';
import PushNotifications from './pages/mypage/PushNotifications';
import VocabularyBackup from './pages/mypage/VocabularyBackup';

import { ThemeProvider } from './context/ThemeContext';
import { BottomSheetProvider } from './context/BottomSheetContext';
import { FullSheetProvider } from './context/FullSheetContext';
import Layout from './components/Layout';
import { VocabularyProvider } from './context/VocabularyContext';

const AppLayout = () => {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />

      <Route path="/home" element={<Home />} />
      <Route path="/vocabulary-sheets" element={<VocabularySheets />} />
      <Route path="/vocabulary-sheets/:id" element={<VocabularySheets />} />
      <Route path="/store" element={<Store />} />
      <Route path="/class" element={<Class />} />
      
      
      <Route path="/mypage" element={<MyPage />} />
      <Route path="/mypage/account" element={<Account />} />
      <Route path="/mypage/theme" element={<Theme />} />
      <Route path="/mypage/example_settings" element={<ExampleSettings />} />
      <Route path="/mypage/push_notifications" element={<PushNotifications />} />
      <Route path="/mypage/vocabulary_backup" element={<VocabularyBackup />} />


    </Routes>
  );
};

function App() {
  return (
    <VocabularyProvider>
      <ThemeProvider>
        <Layout>
          <BottomSheetProvider>
            <FullSheetProvider>
              <BrowserRouter>
                <AppLayout />
              </BrowserRouter>
            </FullSheetProvider>
          </BottomSheetProvider>
        </Layout>
      </ThemeProvider>
    </VocabularyProvider>
  );
}

export default App;
