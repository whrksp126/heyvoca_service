// src/components/script/ScriptRow.jsx — 글자 밭 그리드의 한 행(그룹).
// 2026-09-30 개편(듀오링고 문자 탭 방식): "이 줄 배우기"·"연습하기"·"이미 알아요" 같은 줄
// 단위 진입점을 없앴다 — 행 헤더는 라벨만 남기고, 학습/연습은 칸(ScriptCell) 하나하나를
// 탭해 여는 상세 시트에서 시작한다.

import React from 'react';
import ScriptCell from './ScriptCell';

const ScriptRow = ({ script, label, items, onStart }) => {
  "use memo";

  return (
    <div className="flex flex-col gap-[10px] py-[14px] border-b border-[#F0F0F0] dark:border-[rgba(255,255,255,.08)]">
      <span className="text-[14.5px] font-[800] text-layout-black dark:text-layout-white">
        {label}
      </span>

      <div className="flex flex-wrap gap-[6px]">
        {items.map((it) => (
          <ScriptCell key={it.char} item={it} script={script} onStart={onStart} />
        ))}
      </div>
    </div>
  );
};

export default ScriptRow;
