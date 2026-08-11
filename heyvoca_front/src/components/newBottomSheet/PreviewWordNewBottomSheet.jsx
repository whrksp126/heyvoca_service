import React from 'react';

import CropImage from '../farm/CropImage';
import SpeakerButton from '../common/SpeakerButton';
import { stripHtmlTags } from '../../utils/common';
import { HEALTH_STATES } from '../../utils/crop';

/**
 * 미리보기 단어 상세 — 사기 전 단어장에서 단어 하나를 눌렀을 때.
 *
 * 산 뒤에 쓰는 `WordDetaileNewBottomSheet` 와 **일부러 다른 컴포넌트다.** 그쪽은
 * VocabularyContext 에서 내 단어를 꺼내 기억 상태·복습 예정일·다시 심기까지 보여 준다.
 * 미리보기 단어는 아직 내 것이 아니라 그 조회가 전부 빈손이고, 있지도 않은 학습 이력
 * 자리만 남는다. 그래서 여기서는 **살지 말지 정할 때 보는 것**만 담는다 —
 * 단어 · 발음 · 뜻 · 예문, 그리고 소리.
 *
 * 검증 마크는 달지 않는다. 상점에 올라온 단어장은 전부 검증된 것이라
 * 굳이 표시하면 "검증 안 된 것도 있다"는 뜻이 되어 버린다.
 */
const PreviewWordNewBottomSheet = ({ word }) => {
  "use memo";

  if (!word) return null;

  const meanings = (Array.isArray(word.meanings) ? word.meanings : [])
    .map((m) => (typeof m === 'string' ? m : (m?.meaning || '')))
    .filter(Boolean);
  const examples = Array.isArray(word.examples) ? word.examples : [];

  return (
    <div className="max-h-[90vh] overflow-y-auto px-[20px] pt-[8px] pb-[22px]">
      <span className="block w-[38px] h-[4px] mx-auto mb-[10px] rounded-full bg-layout-gray-100 dark:bg-[#3A3A3A]" />

      {/* 헤더 — 산 뒤 상세와 같은 짜임(작물 · 단어 24px · 발음 · 스피커).
          아직 심기 전이라 작물은 전부 씨앗이다. */}
      <div className="flex items-center gap-[13px]">
        <CropImage stage="seed" health={HEALTH_STATES.FRESH} size={88} className="shrink-0 -my-[10px]" />
        <div className="flex-1 min-w-0">
          <div className="text-[24px] font-[800] tracking-[-0.04em] leading-[1.15] text-layout-black dark:text-layout-white">
            <span className="min-w-0 break-words">{word.origin}</span>
          </div>
          {word.pronunciation && (
            <div className="mt-[3px] text-[12.5px] font-[500] text-layout-gray-300">
              {word.pronunciation}
            </div>
          )}
        </div>
        <span className="flex items-center justify-center w-[36px] h-[36px] shrink-0 rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark">
          <SpeakerButton text={word.origin} lang="en" size={19} label="단어 발음 듣기" />
        </span>
      </div>

      {meanings.length > 0 && (
        <>
          <div className="flex items-center mt-[16px]">
            <h5 className="flex-1 m-0 text-[13px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white">
              뜻
            </h5>
            <SpeakerButton text={meanings.join(', ')} lang="ko" size={17} label="의미 듣기" />
          </div>
          <div className="flex flex-col gap-[5px] mt-[8px]">
            {meanings.map((meaning, index) => (
              <div
                key={index}
                className="flex gap-[7px] text-[15px] font-[500] tracking-[-0.02em] leading-[1.4] text-layout-black dark:text-layout-white"
              >
                <span className="shrink-0 font-[700] text-layout-gray-200">{index + 1}</span>
                <span className="min-w-0 break-words">{meaning}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {examples.length > 0 && (
        <>
          <div className="flex items-center mt-[16px]">
            <h5 className="flex-1 m-0 text-[13px] font-[800] tracking-[-0.02em] text-layout-black dark:text-layout-white">
              예문
            </h5>
          </div>
          <div className="
            mt-[8px] rounded-[10px] pl-[13px] pr-[9px] py-[9px]
            bg-layout-gray-50 dark:bg-layout-gray-dark
            text-[13px] leading-[1.5] tracking-[-0.02em]
            [&_b]:text-primary-main-600 [&_strong]:text-primary-main-600 [&_.target-word]:text-primary-main-600
          ">
            {examples.map((example, index) => {
              // 예문 키 호환: 앱 표준 origin/meaning + admin 저장본 en/ko 모두 허용
              const origin = example?.origin ?? example?.en ?? '';
              const meaning = example?.meaning ?? example?.ko ?? '';
              const originText = stripHtmlTags(origin).trim();
              if (!originText) return null;
              return (
                <div key={`${word.id}-${index}`} className={index > 0 ? 'mt-[8px]' : ''}>
                  <div className="flex items-center gap-[8px]">
                    <span
                      className="flex-1 min-w-0 text-layout-black dark:text-layout-white"
                      dangerouslySetInnerHTML={{ __html: origin }}
                    />
                    <SpeakerButton text={originText} lang="en" size={16} label="예문 발음 듣기" />
                  </div>
                  {meaning && (
                    <div className="flex items-center gap-[8px] mt-[4px]">
                      <span
                        className="flex-1 min-w-0 text-[12px] text-layout-gray-400 dark:text-layout-gray-300"
                        dangerouslySetInnerHTML={{ __html: meaning }}
                      />
                      <SpeakerButton text={stripHtmlTags(meaning)} lang="ko" size={16} label="예문 의미 듣기" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default PreviewWordNewBottomSheet;
