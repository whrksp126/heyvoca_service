import React from 'react';
import { useFitTier } from '../../utils/fitText';

/*
  글자 수 단계 크기 텍스트(utils/fitText.js). 목록 안에서 훅을 쓰기 위한 얇은 래퍼.
  text:     단계 계산에 쓸 글자(내용이 children 이면 그 글자 모양 그대로 — 품사 라벨 포함 등)
  scale:    utils/fitText SCALES 키
  maxLines: 이 줄 수를 넘으면 한 단계 더 줄인다
  as:       태그(기본 span, 측정을 위해 block 계열로 그린다)
*/
const FitTierText = ({ text, scale, maxLines = 2, as: Tag = 'span', className = '', children, ...rest }) => {
  const [ref, sizeClass] = useFitTier(text, scale, { maxLines });
  return (
    <Tag ref={ref} className={`${sizeClass} ${className}`} {...rest}>
      {children ?? text}
    </Tag>
  );
};

export default FitTierText;
