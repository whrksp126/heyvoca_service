import React from 'react';
import { useNavigate } from 'react-router-dom';
import Btn from '../component/Btn';

const ProgressBar = ({ value, max, color, label, emoji }) => (
  <div className="mb-4 bg-white p-4 rounded-xl shadow-sm">
    <div className="flex justify-between mb-2">
      <span className="text-gray-700">{label} {emoji}</span>
      <span className="text-gray-500">{value}/{max}</span>
    </div>
    <div className="w-full bg-gray-100 rounded-full h-4">
      <div 
        className={`h-full rounded-full ${color}`}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  </div>
);

const Main = () => {
  const today = new Date().toLocaleDateString('ko-KR', { weekday: 'long' });

  return (
    <div className="w-full max-w-md p-4">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">단어장</h2>
      <div className="bg-pink-50 rounded-xl p-6 mb-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">{today}의 문장 ✨</h2>
          <div className="flex gap-2">
            <button className="text-pink-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
            <button className="text-pink-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-gray-700 mb-2">Could you recommend a dish that's not too spicy but still flavorful?</p>
        <p className="text-gray-500 text-sm">너무 맵지 않으면서도 맛있는 음식을 추천해 주실 수 있나요?</p>
      </div>
      
      <ProgressBar 
        label="토익 준비용" 
        emoji="🔥" 
        value={100} 
        max={500} 
        color="bg-pink-300"
      />
      <ProgressBar 
        label="고등 수능 영단어" 
        emoji="👀" 
        value={150} 
        max={300} 
        color="bg-purple-300"
      />
      <ProgressBar 
        label="30일 완성 TEPS" 
        emoji="👍" 
        value={150} 
        max={300} 
        color="bg-blue-300"
      />
      <ProgressBar 
        label="직장인 만남의 영단어" 
        emoji="🌟" 
        value={275} 
        max={500} 
        color="bg-green-300"
      />
    </div>
  );
};

export default Main; 