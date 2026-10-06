// src/components/takeTest/ComboIcon.jsx
//
// 콤보(연속 정답) 아이콘 — 클레이 질감 번개 하나. 농작물·아이템 그림과 재질 결만 맞췄다.
// 콤보는 끝없이 늘 수 있어 단계별 그림을 두지 않는다 — 콤보 수와 무관하게 항상 같은 아이콘이다.
// 원본은 assets/images/farm/combo/combo.svg(generate.py 로 생성)이고, 화면에는 그것을 구운 PNG 를 쓴다
// (SVG 필터는 WebView 마다 결과·비용이 달라서).
import React from 'react';
import comboImg from '../../assets/images/farm/combo/combo.png';

/**
 * @param {string} [className] 크기는 호출부가 정한다(예: 'w-[24px] h-[24px]')
 */
const ComboIcon = ({ className = '', alt = '콤보' }) => (
  <img
    src={comboImg}
    alt={alt}
    draggable={false}
    className={`select-none object-contain ${className}`}
  />
);

export default ComboIcon;
