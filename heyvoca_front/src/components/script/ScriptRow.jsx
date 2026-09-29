// src/components/script/ScriptRow.jsx — 글자 밭 그리드의 한 "묶음"(기본/탁음·반탁음/요음/
// 알파벳 전체) 렌더러. 2026-09-30 재개편: 예전엔 오십음도 행(あ행 등) 하나하나에 제목을
// 달고 행 사이를 구분선으로 나눴는데(원래 파일명의 유래), 지금은 듀오링고 문자표처럼
// 묶음 제목만 남기고 그 안은 하나로 이어진 CSS grid로 그린다 — 행 제목·구분선 없음.
//
// items(=utils/scriptData.js buildScriptGroups가 만든 cells)에는 null이 섞여 있을 수 있다
// (や행 등 오십음도에서 실제 글자가 없는 칸) — null은 칸 크기만 유지하는 보이지 않는
// 빈 자리로 그린다(탭 불가).

import React from 'react';
import ScriptCell from './ScriptCell';

// 기본(basic) 5열 묶음 맨 위에만 다는 옅은 모음 헤더 — 세로 정렬(あ/い/う/え/お 순)이
// 한눈에 보이도록 돕는 용도라 과하지 않게 아주 작고 흐리게 둔다.
const VOWEL_HEADER = ['a', 'i', 'u', 'e', 'o'];

const ScriptRow = ({ script, label, columns, items, showVowelHeader, onStart }) => {
  "use memo";

  const gridColsClass = columns === 3 ? 'grid-cols-3' : 'grid-cols-5';

  return (
    <div className="flex flex-col gap-[8px] mt-[20px] first:mt-[8px]">
      {label && (
        <span className="text-[13.5px] font-[800] text-layout-gray-400 dark:text-layout-gray-200">
          {label}
        </span>
      )}

      {showVowelHeader && columns === 5 && (
        <div className="grid grid-cols-5 gap-[8px]">
          {VOWEL_HEADER.map((v) => (
            <span
              key={v}
              className="text-[10px] font-[600] text-layout-gray-300 text-center"
            >
              {v}
            </span>
          ))}
        </div>
      )}

      <div className={`grid ${gridColsClass} gap-[8px]`}>
        {items.map((it, idx) => (
          it
            ? (
              <ScriptCell
                key={it.char}
                item={it}
                script={script}
                onStart={onStart}
              />
            )
            : <div key={`blank-${idx}`} className="w-full" style={{ minHeight: 48 }} aria-hidden="true" />
        ))}
      </div>
    </div>
  );
};

export default ScriptRow;
