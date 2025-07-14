// src/App.jsx

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import Home from './pages/Home';
import Login from './pages/Login';
import InitialProfile from './pages/InitialProfile';
import VocabularySheets from './pages/VocabularySheets';
import BookStore from './pages/BookStore';
import Class from './pages/Class';
import TakeTest from './pages/TakeTest';
import StudyResult from './components/takeTest/StudyResult';

import MyPage from './pages/myPage';

import { ThemeProvider } from './context/ThemeContext';
import { BottomSheetProvider } from './context/BottomSheetContext';
import { FullSheetProvider } from './context/FullSheetContext';
import Layout from './components/Layout';
import { VocabularyProvider } from './context/VocabularyContext';
import { UserProvider } from './context/UserContext';
const AppLayout = () => {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/initial-profile" element={<InitialProfile />} />

      <Route path="/home" element={<Home />} />
      <Route path="/vocabulary-sheets" element={<VocabularySheets />} />
      <Route path="/vocabulary-sheets/:id" element={<VocabularySheets />} />
      <Route path="/book-store" element={<BookStore />} />
      <Route path="/class" element={<Class />} />
      <Route path="/take-test" element={<TakeTest />} />
      <Route path="/take-test/result" element={<StudyResult />} />

      <Route path="/mypage" element={<MyPage />} />


    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <VocabularyProvider>
          <ThemeProvider>
            <Layout>
              <BottomSheetProvider>
                <FullSheetProvider>
                    <AppLayout />
                </FullSheetProvider>
              </BottomSheetProvider>
            </Layout>
          </ThemeProvider>
        </VocabularyProvider>
      </UserProvider>
    </BrowserRouter>
  );
}

export default App;
