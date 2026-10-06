// src/components/takeTest/rewards/FarmGrowRow.jsx
import React from 'react';
import CropImage from '../../farm/CropImage';
import { wordLang, isJa } from '../../../utils/lang';
import { getReading, shouldShowReading } from '../../../utils/jaWord';

// 성장 목록 한 줄 — 시안 `.grow2` [작물][단어·뜻][오른쪽 결과].
// 단어장·최종 결과와 같은 배치다(시안 학습결과 §1 ①).
// `right` 는 선택이다 — 상태 라벨이 필요 없는 자리는 통째로 뺀다
// (빈 문자열 칸을 남기지 않고 단어·뜻 칸이 남은 폭을 그대로 채우도록 flex-1 만 남긴다).
// `meta` 는 이 행에 대응하는 단어 객체(문제 원본)다 — 농장 요약 행은 {word, meaning} 뿐이라
// ja 단어의 읽기·JLPT 는 문제 목록에서 찾아 붙인다(없으면 표기만).
// `tone` — 'card'(기본, 화면 바탕 위) / 'sheet'(시트 면 위. 시트가 이미 한 톤 올라와 있어 면을 바꾼다)
// `gold` — 오른쪽 결과를 금색으로(황금 당근).
const ROW_FACE = {
  card: 'bg-layout-gray-50 dark:bg-layout-gray-dark',
  sheet: 'bg-layout-gray-50 dark:bg-layout-black',
};

const FarmGrowRow = ({ crop, word, meaning, right, meta, tone = 'card', gold = false }) => {
  const ja = !!meta && isJa(wordLang(meta));
  return (
    <div className={`flex items-center gap-[11px] px-[14px] py-[12px] rounded-[10px] ${ROW_FACE[tone] ?? ROW_FACE.card}`}>
      <CropImage stage={crop} size={52} align="center" className='flex-shrink-0' />
      <div className='flex flex-col flex-1 min-w-0 text-left'>
        <span className='flex items-center gap-[6px] min-w-0'>
          <span lang={ja ? 'ja' : undefined} className='text-[15px] font-[700] text-layout-black dark:text-layout-white truncate'>{word}</span>
          {ja && shouldShowReading({ ...meta, origin: word }) && (
            <span lang="ja" className="shrink-0 truncate text-[11px] font-[500] text-layout-gray-300">
              {getReading(meta)}
            </span>
          )}
        </span>
        {meaning ? (
          <span className='mt-[2px] text-[11.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-50 truncate'>
            {meaning}
          </span>
        ) : null}
      </div>
      {/* 시안 `.grow2 .rt` — 11.5px/700 #12B76A(status-success-600) */}
      {right ? (
        <span className={`flex-shrink-0 whitespace-nowrap text-[11.5px] font-[700] ${gold ? 'text-crop-golden' : 'text-status-success-600'}`}>
          {right}
        </span>
      ) : null}
    </div>
  );
};

export default FarmGrowRow;
