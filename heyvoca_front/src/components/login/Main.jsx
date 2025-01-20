import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Btn from '../component/Btn';
import { setToken } from '../../utils/auth';

const Main = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Test account validation
    if (formData.email === 'test' && formData.password === 'test') {
      setToken('test_session_token');
      navigate('/vocabulary');
    } else {
      setError('아이디 또는 비밀번호가 일치하지 않습니다.');
    }
  };

  return (
    <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">로그인</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="아이디"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500"
            required
          />
        </div>
        <div>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="비밀번호"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500"
            required
          />
        </div>
        {error && (
          <p className="text-red-500 text-sm">{error}</p>
        )}
        <Btn type="submit" text="로그인" />
        <div className="text-sm text-gray-600 mt-4">
          계정이 없으신가요?{' '}
          <button
            type="button"
            onClick={() => navigate('/register')}
            className="text-cyan-500 hover:text-cyan-600"
          >
            회원가입
          </button>
        </div>
      </form>
    </div>
  );
};

export default Main; 