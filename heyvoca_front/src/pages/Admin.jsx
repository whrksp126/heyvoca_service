// src/pages/Admin.jsx
// 운영자 전용 어드민 대시보드 페이지.
// 일반 사용자용 메뉴/네비에는 노출되지 않으며, URL 직접 입력으로만 접근.
import React, { useState, useEffect } from 'react';
import TokenGate from '@/components/admin/TokenGate';
import Dashboard from '@/components/admin/Dashboard';

const STORAGE_KEY = 'heyvoca_admin_token';

const Admin = () => {
  "use memo";

  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '');

  // 다른 탭에서 localStorage 변경 시 동기화
  useEffect(() => {
    const handler = (e) => {
      if (e.key === STORAGE_KEY) {
        setToken(e.newValue ?? '');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  if (!token) {
    return <TokenGate onSuccess={(t) => setToken(t)} />;
  }

  return (
    <Dashboard
      token={token}
      onLogout={() => setToken('')}
    />
  );
};

export default Admin;
