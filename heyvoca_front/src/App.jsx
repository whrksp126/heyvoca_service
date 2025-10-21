// src/App.jsx

import React, { useContext } from 'react';
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

import { BottomSheetProvider } from './context/BottomSheetContext';
import { FullSheetProvider } from './context/FullSheetContext';
import { NewFullSheetProvider as NewFullSheetContextProvider, NewFullSheetContext } from './context/NewFullSheetContext';
import { NewFullSheetProvider } from './components/newfullsheet/NewFullSheetProvider';
import Layout from './components/Layout';
import { VocabularyProvider } from './context/VocabularyContext';
import { UserProvider } from './context/UserContext';


import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSyDSZP_N-z8Kste8M8K92Nj5zPqetJ5nEdQ",
  authDomain: "heyvoca-466916.firebaseapp.com",
  projectId: "heyvoca-466916",
  storageBucket: "heyvoca-466916.firebasestorage.app",
  messagingSenderId: "584113926081",
  appId: "1:584113926081:web:f7e5f95645d233b7084940"
};

const FirebaseApp = initializeApp(firebaseConfig);

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

// NewFullSheetContext를 전역에 등록하기 위한 컴포넌트
function AppWithContexts() {
  const newFullSheetContext = useContext(NewFullSheetContext);
  
  // NewFullSheetContext를 전역에 등록
  window.newFullSheetContext = newFullSheetContext;
  
  return (
    <Layout>
      <BottomSheetProvider>
        <FullSheetProvider>
          <AppLayout />
          <NewFullSheetProvider />
        </FullSheetProvider>
      </BottomSheetProvider>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <VocabularyProvider>
          <NewFullSheetContextProvider>
            <AppWithContexts />
          </NewFullSheetContextProvider>
        </VocabularyProvider>
      </UserProvider>
    </BrowserRouter>
  );
}

export default App;
