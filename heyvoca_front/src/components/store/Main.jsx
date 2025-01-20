import React from 'react';

const BookCard = ({ title, count, isHot, isNew, emoji }) => (
  <div className="relative bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex flex-col h-32">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-gray-800">{title} {emoji}</h3>
        <div className="flex gap-2">
          {isHot && (
            <span className="px-2 py-1 text-xs bg-pink-100 text-pink-500 rounded-full font-medium">
              HOT
            </span>
          )}
          {isNew && (
            <span className="px-2 py-1 text-xs bg-green-100 text-green-500 rounded-full font-medium">
              NEW
            </span>
          )}
        </div>
      </div>
      <div className="flex items-end mt-auto">
        <span className="text-sm text-gray-500">
          <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {count.toLocaleString()}
        </span>
      </div>
    </div>
  </div>
);

const Main = () => {
  const books = [
    {
      title: '토익 준비용',
      count: 571024,
      isHot: true,
      isNew: false,
      emoji: '🔥'
    },
    {
      title: '고등 수능 영단어',
      count: 3871,
      isHot: false,
      isNew: false,
      emoji: '👀'
    },
    {
      title: '30일 완성 TEPS',
      count: 9307,
      isHot: false,
      isNew: false,
      emoji: '👍'
    },
    {
      title: '기적의 발음기 영단어',
      count: 970,
      isHot: false,
      isNew: true,
      emoji: '🗣️'
    },
    {
      title: 'ChatGPT 영어 공부 - 영단어편',
      count: 235480,
      isHot: true,
      isNew: false,
      emoji: '🤖'
    },
    {
      title: '토익 준비용 2',
      count: 571024,
      isHot: true,
      isNew: false,
      emoji: '🔥'
    }
  ];

  return (
    <div className="w-full max-w-2xl p-4 pb-24">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">서점</h2>
      <div className="grid grid-cols-2 gap-4">
        {books.map((book, index) => (
          <BookCard key={index} {...book} />
        ))}
      </div>
    </div>
  );
};

export default Main; 