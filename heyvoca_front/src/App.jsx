// src/App.jsx

import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import Home from './pages/Home';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import InitialProfile from './pages/InitialProfile';
import VocabularySheets from './pages/VocabularySheets';
import BookStore from './pages/BookStore';
import Dictionary from './pages/Dictionary';
import Class from './pages/Class';
import Farm from './pages/Farm';
import TakeTest from './pages/TakeTest';
import StudyResult from './components/takeTest/StudyResult';
import Study from './pages/Study';

import MyPage from './pages/myPage';

// import { BottomSheetProvider } from './context/BottomSheetContext';
// import { FullSheetProvider } from './context/FullSheetContext';
import { NewFullSheetProvider as NewFullSheetContextProvider, NewFullSheetContext, NewFullSheetActionsContext } from './context/NewFullSheetContext';
import { NewFullSheetProvider } from './components/newfullsheet/NewFullSheetProvider';

import { NewBottomSheetProvider as NewBottomSheetContextProvider, NewBottomSheetContext, NewBottomSheetActionsContext } from './context/NewBottomSheetContext';
import { NewBottomSheetProvider } from './components/newBottomSheet/NewBottomSheetProvider';
import Layout from './components/Layout';
import { VocabularyProvider } from './context/VocabularyContext';
import { UserProvider } from './context/UserContext';
import { OverlayContextProvider, OverlayStateContext, OverlayActionsContext } from './context/OverlayContext';
import { OverlayProvider } from './components/overlay/OverlayProvider';
import { GemAnimationProvider } from './context/GemAnimationContext';
import { ThemeProvider } from './context/ThemeContext';
import { ExampleSettingsProvider } from './context/ExampleSettingsContext';
import { KeyboardProvider } from './context/KeyboardContext';
import { AttendanceCalendarProvider } from './context/AttendanceCalendarContext';
import { OnboardingUnlockProvider, OnboardingUnlockContext } from './context/OnboardingUnlockContext';
import { StatsProvider } from './context/StatsContext';
import WebStorageMigration from './context/WebStorageMigration';
import OnboardingMissionRewardWatcher from './components/onboarding/OnboardingMissionRewardWatcher';

const AppLayout = () => {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/initial-profile" element={<InitialProfile />} />

      <Route path="/home" element={<Home />} />
      <Route path="/farm" element={<Farm />} />
      <Route path="/vocabulary-sheets" element={<VocabularySheets />} />
      <Route path="/vocabulary-sheets/:id" element={<VocabularySheets />} />
      <Route path="/dictionary" element={<Dictionary />} />
      <Route path="/book-store" element={<BookStore />} />
      <Route path="/class" element={<Class />} />
      <Route path="/take-test" element={<TakeTest />} />
      <Route path="/take-test/result" element={<StudyResult />} />
      <Route path="/study" element={<Study />} />

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
  const onboardingUnlockContext = useContext(OnboardingUnlockContext);

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
  // OnboardingUnlockContext를 전역에 등록 — VocabularyContext(Provider 트리 상 이 Context보다 바깥)에서
  // 단어장 생성/서점 담기 성공 후 refreshUnlock()을 호출하기 위한 용도(다른 window.*Context와 동일 패턴).
  window.onboardingUnlockContext = onboardingUnlockContext;

  return (
    <Layout>
      {/* <BottomSheetProvider> */}
      {/* <FullSheetProvider> */}
      <WebStorageMigration />
      <OnboardingMissionRewardWatcher />
      <AppLayout />
      <NewFullSheetProvider />
      <NewBottomSheetProvider />
      <OverlayProvider />
      {/* </FullSheetProvider> */}
      {/* </BottomSheetProvider> */}
    </Layout>
  );
}

/**
 * 일반 사용자 라우트. (어드민은 별도 heyvoca_admin 서비스로 분리됨)
 */
function AppRouter() {
  return (
    <UserProvider>
      <AttendanceCalendarProvider>
        <VocabularyProvider>
          <NewFullSheetContextProvider>
            <NewBottomSheetContextProvider>
              <OverlayContextProvider>
                <GemAnimationProvider>
                  <ThemeProvider>
                    <ExampleSettingsProvider>
                      <KeyboardProvider>
                        <OnboardingUnlockProvider>
                          <StatsProvider>
                            <AppWithContexts />
                          </StatsProvider>
                        </OnboardingUnlockProvider>
                      </KeyboardProvider>
                    </ExampleSettingsProvider>
                  </ThemeProvider>
                </GemAnimationProvider>
              </OverlayContextProvider>
            </NewBottomSheetContextProvider>
          </NewFullSheetContextProvider>
        </VocabularyProvider>
      </AttendanceCalendarProvider>
    </UserProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRouter />
    </BrowserRouter>
  );
}

export default App;
