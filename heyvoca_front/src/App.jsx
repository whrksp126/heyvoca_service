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

// import { BottomSheetProvider } from './context/BottomSheetContext';
// import { FullSheetProvider } from './context/FullSheetContext';
import { NewFullSheetProvider as NewFullSheetContextProvider, NewFullSheetContext, NewFullSheetActionsContext } from './context/NewFullSheetContext';
import { NewFullSheetProvider } from './components/newFullSheet/NewFullSheetProvider';

import { NewBottomSheetProvider as NewBottomSheetContextProvider, NewBottomSheetContext, NewBottomSheetActionsContext } from './context/NewBottomSheetContext';
import { NewBottomSheetProvider } from './components/newBottomSheet/NewBottomSheetProvider';
import Layout from './components/Layout';
import { VocabularyProvider } from './context/VocabularyContext';
import { UserProvider } from './context/UserContext';
import { OverlayContextProvider, OverlayStateContext, OverlayActionsContext } from './context/OverlayContext';
import { OverlayProvider } from './components/overlay/OverlayProvider';
import { GemAnimationProvider } from './context/GemAnimationContext';
import { ThemeProvider } from './context/ThemeContext';


import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
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
  const newFullSheetActions = useContext(NewFullSheetActionsContext);
  const newBottomSheetContext = useContext(NewBottomSheetContext);
  const newBottomSheetActions = useContext(NewBottomSheetActionsContext);
  const overlayContext = useContext(OverlayStateContext);
  const overlayActions = useContext(OverlayActionsContext);

  // NewFullSheetContext를 전역에 등록 (state와 actions를 합쳐서)
  window.newFullSheetContext = {
    ...newFullSheetContext,
    ...newFullSheetActions
  };
  window.newBottomSheetContext = {
    ...newBottomSheetContext,
    ...newBottomSheetActions
  };
  window.overlayContext = {
    ...overlayContext,
    ...overlayActions
  };

  return (
    <Layout>
      {/* <BottomSheetProvider> */}
      {/* <FullSheetProvider> */}
      <AppLayout />
      <NewFullSheetProvider />
      <NewBottomSheetProvider />
      <OverlayProvider />
      {/* </FullSheetProvider> */}
      {/* </BottomSheetProvider> */}
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <VocabularyProvider>
          <NewFullSheetContextProvider>
            <NewBottomSheetContextProvider>
              <OverlayContextProvider>
                <GemAnimationProvider>
                  <ThemeProvider>
                    <AppWithContexts />
                  </ThemeProvider>
                </GemAnimationProvider>
              </OverlayContextProvider>
            </NewBottomSheetContextProvider>
          </NewFullSheetContextProvider>
        </VocabularyProvider>
      </UserProvider>
    </BrowserRouter>
  );
}

export default App;
