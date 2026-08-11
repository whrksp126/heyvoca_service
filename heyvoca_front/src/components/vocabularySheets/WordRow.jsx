import React from 'react';
import CropImage from '../farm/CropImage';
import { wordStage, wordHealth, wordDue, DUE_TONE_CLASS } from '../../utils/vocaCrop';

/**
 * 단어 목록 한 줄 — 시안 vocabooks §5.
 *   작물 아이콘 · 단어 15/700 · 뜻 12px 한 줄 말줄임 · 우측 다음 복습 11.5/700
 *   행 높이 58px · 구분선 #F4F4F4
 *
 * 정답률과 학습 횟수는 넣지 않는다 — 목록에서 필요한 판단은 "지금 이걸 봐야 하나" 하나다.
 */
const WordRow = ({ word, onClick }) => {
  "use memo";

  // 봉투(보유 씨앗)와 흙에 묻힌 씨앗(심은 씨앗)을 가르려면 visual_stage 가 필요하다
  const stage = wordStage(word);
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
      <CropImage stage={stage} health={health} size={52} className="shrink-0" />

      <span className="flex-1 min-w-0">
        {/* 검증 인장은 여기 두지 않는다.
            목록은 "지금 이걸 봐야 하나"에 답하는 자리인데, 사전 연결 여부는 그 판단을
            바꾸지 않는다. 게다가 대부분의 단어가 검증돼 있어 파란 점이 모든 줄에 찍히면
            정작 눈에 걸려야 할 것(작물 상태·지난 날짜)을 가린다. 상세 시트에만 둔다. */}
        <span className="flex items-center gap-[5px]">
          <span className="min-w-0 truncate text-[15px] font-[700] tracking-[-0.02em] text-layout-black dark:text-layout-white">
            {word?.origin}
          </span>
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
