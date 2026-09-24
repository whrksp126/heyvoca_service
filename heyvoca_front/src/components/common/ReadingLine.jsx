import React from 'react';

// 일본어 단어의 읽기(히라가나) 줄 — 영어 발음 줄과 같은 스타일.
// romaji 는 표시하지 않는다(데이터만).
const ReadingLine = ({ reading, as: Tag = 'span', className = '' }) => {
  if (!reading) return null;
  return (
    <Tag lang="ja" className={`text-[12px] font-[500] text-layout-gray-300 ${className}`}>
      {reading}
    </Tag>
  );
};

export default ReadingLine;
