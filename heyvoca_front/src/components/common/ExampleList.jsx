import React from 'react';

/**
 * 단어 목록 화면에서 예문을 표시하는 공용 컴포넌트.
 * 예문 origin 에는 강조 마크업(<strong class="target-word">..</strong>)이 포함되어 있어
 * dangerouslySetInnerHTML 로 렌더한다. meaning 은 한글 번역(일반 텍스트).
 *
 * @param {Array<{origin?: string, meaning?: string}>} examples
 * @param {string} className - 바깥 컨테이너 추가 클래스
 */
const ExampleList = ({ examples, className = '' }) => {
  if (!Array.isArray(examples) || examples.length === 0) return null;

  return (
    <div className={`flex flex-col gap-[8px] w-full ${className}`}>
      {examples.map((ex, i) => {
        if (!ex) return null;
        // 예문 키 호환: 앱 표준은 origin/meaning 이지만 admin 저장본은 en/ko 를 쓰기도 함.
        const origin = ex.origin ?? ex.en ?? '';
        const meaning = ex.meaning ?? ex.ko ?? '';
        if (!origin && !meaning) return null;
        return (
          <div
            key={i}
            className="flex flex-col gap-[1px]"
          >
            {origin && (
              <p className="text-[12px] font-[400] leading-snug text-layout-black dark:text-layout-white">
                <span dangerouslySetInnerHTML={{ __html: origin }} />
              </p>
            )}
            {meaning && (
              <p className="text-[12px] font-[400] leading-snug text-layout-gray-400 dark:text-layout-gray-300">
                <span dangerouslySetInnerHTML={{ __html: meaning }} />
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ExampleList;
