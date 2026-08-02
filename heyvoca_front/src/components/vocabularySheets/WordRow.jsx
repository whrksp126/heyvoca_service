import React from 'react';
import CropImage from '../farm/CropImage';
import VerifyMark from './VerifyMark';
import { wordCropStage, wordHealth, wordDue, DUE_TONE_CLASS } from '../../utils/vocaCrop';

/**
 * 단어 목록 한 줄 — 시안 vocabooks §5.
 *   작물 아이콘 30px · 단어 15/700 · 검증 마크 · 뜻 12px 한 줄 말줄임 · 우측 다음 복습 11.5/700
 *   행 높이 58px · 구분선 #F4F4F4
 *
 * 정답률과 학습 횟수는 넣지 않는다 — 목록에서 필요한 판단은 "지금 이걸 봐야 하나" 하나다.
 */
const WordRow = ({ word, onClick }) => {
  "use memo";

  const stage = wordCropStage(word);
  const health = wordHealth(word);
  const due = wordDue(word);
  const meaning = Array.isArray(word?.meanings) ? word.meanings.join(', ') : '';

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        flex items-center gap-[11px] w-full h-[58px] shrink-0
        text-left
        border-b border-[#F4F4F4] dark:border-layout-gray-dark
      "
    >
      <CropImage stage={stage} health={health} size={30} className="shrink-0 object-bottom" />

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-[5px]">
          <span className="min-w-0 truncate text-[15px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
            {word?.origin}
          </span>
          <VerifyMark word={word} />
        </span>
        <span className="block mt-[1px] truncate text-[12px] tracking-[-0.02em] text-layout-gray-400 dark:text-layout-gray-300">
          {meaning}
        </span>
      </span>

      <span className={`shrink-0 text-right text-[11.5px] font-[700] ${DUE_TONE_CLASS[due.tone]}`}>
        {due.text}
      </span>
    </button>
  );
};

export default WordRow;
