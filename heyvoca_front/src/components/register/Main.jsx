// src/components/register/main
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Btn from '../component/Btn';

const Main = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    nickname: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    // TODO: Implement registration logic
    console.log('Register attempt with:', formData);
  };

  return (
    <div className="w-full max-w-md p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">회원가입</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="example@email.com"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">닉네임</label>
          <input
            type="text"
            name="nickname"
            value={formData.nickname}
            onChange={handleChange}
            placeholder="닉네임을 입력하세요"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="비밀번호를 입력하세요"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
          <input
            type="password"
            name="passwordConfirm"
            value={formData.passwordConfirm}
            onChange={handleChange}
            placeholder="비밀번호를 다시 입력하세요"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500"
            required
          />
        </div>
        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}
        <Btn type="submit" text="가입하기" color="cyan" />
        <div className="text-sm text-gray-600 text-center mt-4">
          이미 계정이 있으신가요?{' '}
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-cyan-500 hover:text-cyan-600"
          >
            로그인
          </button>
        </div>
      </form>
    </div>
  );
};

export default Main;