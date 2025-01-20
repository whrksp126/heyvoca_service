// src/App.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import Register from './pages/Register';
import Login from './pages/Login';
import Vocabulary from './pages/Vocabulary';
import Store from './pages/Store';
import Class from './pages/Class';
import MyPage from './pages/MyPage';
import Header from './components/component/Header';
import BottomNav from './components/component/BottomNav';

const AppLayout = () => {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const needsBottomNav = ['/vocabulary', '/store', '/class', '/mypage'].includes(location.pathname);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {isAuthPage && <Header />}
      <main className={`flex-1 ${isAuthPage ? 'pt-[70px]' : ''}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/vocabulary" element={<Vocabulary />} />
          <Route path="/store" element={<Store />} />
          <Route path="/class" element={<Class />} />
          <Route path="/mypage" element={<MyPage />} />
        </Routes>
      </main>
      {needsBottomNav && <BottomNav />}
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
