// src/components/admin/TokenGate.jsx
import React, { useState } from 'react';
import { loginAdmin } from '@/api/admin';

const STORAGE_KEY = 'heyvoca_admin_token';

/**
 * 운영자 ID/PW 로그인 폼.
 * POST /admin/login 호출 → 성공 시 토큰을 받아 localStorage 저장 후 onSuccess.
 */
const TokenGate = ({ onSuccess }) => {
  "use memo";

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = await loginAdmin({ username: username.trim(), password });
      if (!token) throw new Error('서버 응답에 토큰이 없습니다.');
      localStorage.setItem(STORAGE_KEY, token);
      onSuccess(token);
    } catch (err) {
      const status = err.status;
      if (status === 401) {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      } else if (status === 503) {
        setError('서버에 ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.');
      } else {
        setError(`오류가 발생했습니다. (${status ?? 'NETWORK'})`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">heyvoca Admin</h1>
          <p className="text-gray-400 text-sm">운영자 전용 대시보드입니다. 로그인해주세요.</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800 space-y-4">
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              아이디
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="운영자 ID"
              className="w-full bg-gray-800 text-white placeholder-gray-500 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="비밀번호"
              className="w-full bg-gray-800 text-white placeholder-gray-500 border border-gray-700 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-medium rounded-lg py-3 text-sm transition-colors"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TokenGate;
