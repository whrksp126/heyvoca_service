import React from 'react';
import { SealCheck } from '@phosphor-icons/react';
import { wordVerification } from '../../utils/vocaCrop';

/**
 * 사전 검증 마크 — 시안 vocabooks §3.
 *   검증됨  SealCheck 14px · #2E90FA — 단어 옆에 작고 조용하게
 *   미검증  글자 배지 "미검증" · #FB6514 on #FFF8E5 — 아이콘이 아니라 글자다
 *
 * 검증 여부를 알 수 없으면(백엔드가 아직 안 내려 줌) 아무것도 그리지 않는다.
 */
const VerifyMark = ({ word, size = 14, badgeClassName = '' }) => {
  const state = wordVerification(word);
  if (state === 'unknown') return null;

  if (state === 'verified') {
    return (
      <SealCheck
        size={size}
        weight="fill"
        className="shrink-0 text-secondary-blue-600"
        aria-label="헤이보카 사전에 연결된 단어"
      />
    );
  }

  return (
    <span
      className={`
        shrink-0 rounded-[4px] px-[5px] py-[1px]
        text-[10px] font-[800] tracking-[-0.02em]
        text-secondary-yellow-600
        bg-secondary-yellow-100 dark:bg-secondary-yellow-dark
        ${badgeClassName}
      `}
    >
      미검증
    </span>
  );
};

export default VerifyMark;
