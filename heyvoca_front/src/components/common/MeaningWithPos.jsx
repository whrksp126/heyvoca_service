import React from 'react';
import { groupMeaningsByPos } from '../../utils/meaningPos';

/*
  뜻 + 품사 라벨 — "[동사] 환불하다, 돌려주다 [명사] 환불" 처럼 그린다(2026-11-19 회의 QA).
  라벨 모양은 단어 만나기 카드(WordMeetCard)의 사전 품사 칩과 같다.

  meanings: 표시할 뜻 문자열 배열(이미 고른/섞은 순서 그대로)
  posMap:   utils/meaningPos.buildMeaningPosMap(word) 결과
  size:     'md'(기본) | 'sm'(좁은 자리) — 라벨 글자 크기만 다르다
  품사를 모르는 뜻은 라벨 없이 텍스트만 나온다. 모든 뜻의 품사를 모르면 기존 "a, b" 와 같다.
*/
const MeaningWithPos = ({ meanings, posMap, size = 'md', separator = ', ', className = '' }) => {
  const groups = groupMeaningsByPos(meanings, posMap);
  const chip = size === 'sm'
    ? 'text-[9px] px-[4px] rounded-[3px] mr-[3px]'
    : 'text-[11px] px-[5px] rounded-[4px] mr-[4px]';
  return (
    <span className={className}>
      {groups.map((g, i) => (
        <React.Fragment key={`${g.label ?? 'none'}-${i}`}>
          {i > 0 && (g.label ? ' ' : separator)}
          {g.label && (
            <span
              className={`inline-block align-[1px] py-[0px] leading-[1.5] font-[600] bg-layout-gray-100 dark:bg-layout-gray-500 text-layout-gray-400 dark:text-layout-gray-100 ${chip}`}
            >
              {g.label}
            </span>
          )}
          {g.texts.join(separator)}
        </React.Fragment>
      ))}
    </span>
  );
};

export default MeaningWithPos;
