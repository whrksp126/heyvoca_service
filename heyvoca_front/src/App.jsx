// src/App.jsx

import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Index from './pages/Index';
import Home from './pages/Home';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import InitialProfile from './pages/InitialProfile';
import VocabularySheets from './pages/VocabularySheets';
import BookStore from './pages/BookStore';
import Dictionary from './pages/Dictionary';
import Class from './pages/Class';
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
      {/* /farm(농장 상세 · 단계별 작물 목록)은 시안에 없는 화면이라 제거했다.
          홈 시안 §10 화면 구조는 히어로·보석 칩·주 CTA·연속 학습·성과 카드·바텀 네비뿐이고,
          §11 의 첫 탭 "농장"은 홈 그 자체다. 단계별 목록은 단어장 시안 4절(단어장 안)이,
          황금 당근은 마이페이지 시안 4절(창고 · 황금 온실)이 이미 맡고 있다.
          다만 이 앱에는 catch-all 라우트가 없어서 지우기만 하면 /farm 이 빈 화면이 된다
          (앱 WebView 히스토리·북마크에 남아 있을 수 있다) → 홈으로 넘긴다. */}
      <Route path="/farm" element={<Navigate to="/home" replace />} />
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
