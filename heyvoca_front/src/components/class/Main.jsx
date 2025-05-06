import React from 'react';
import { updateSM2 } from '../../utils/common';
const Main = () => {
  const word = {
    
    id: '1', // 사용자 단어장 데이터 기준 단어 ID,
    dictionary_id : 1, // 헤이보카 사전의 단어 ID, 없으면 null
    origin: 'apple', // 학습할 단어
    meanings: ['사과', '빨간 사과', '빨간 비닐봉지 안에 있는 사과'], // 학습할 단어의 뜻
    examples: [{ // 학습할 단어의 예시 리스트
      origin: 'I eat an apple every day.', // 학습할 단어의 예시
      meaning: '나는 매일 사과를 먹는다.' // 학습할 단어의 예시의 뜻
    }],
    ef: 2.5,
    repetition: 0,
    interval: 0,
    next_review: null,
    created_at: new Date('2024-01-01').toISOString(), // 단어 등록 일자
    updated_at: new Date('2024-01-01').toISOString(), // 단어 수정 일자
  };


  const q = 5; // 사용자 선택: easy
  const today = new Date("2025-05-01");
  
  const updated = updateSM2(word, q, today);

  return (
    <div>
      <h1>테스트 : 메인</h1>
      <button></button>
    </div>
  );
};

export default Main; 