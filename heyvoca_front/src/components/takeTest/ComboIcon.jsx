// src/components/takeTest/ComboIcon.jsx
//
// 콤보(연속 정답) 아이콘 — 클레이 질감 '번개 당근'. 농작물·아이템 그림과 같은 화풍으로 맞췄다.
// 단계는 콤보 마일스톤 주기(COMBO_MILESTONE_STEP)를 따른다 — 진행바 강조(getComboFillClass)와 같은 구간.
//   1단계(주기 미만)      번개 당근
//   2단계(주기 이상)      번개 당근 + 불꽃
//   3단계(주기 2배 이상)  황금 번개 당근 + 겹불꽃 + 반짝임
// 원본은 assets/images/farm/combo/ 의 SVG(generate.py 로 생성)이고, 화면에는 그것을 구운 PNG 를 쓴다
// (SVG 필터는 WebView 마다 결과·비용이 달라서).
import React from 'react';
import combo1 from '../../assets/images/farm/combo/combo-1.png';
import combo2 from '../../assets/images/farm/combo/combo-2.png';
import combo3 from '../../assets/images/farm/combo/combo-3.png';
import { COMBO_MILESTONE_STEP } from './ComboBar';

export const COMBO_ICON_ASSETS = { 1: combo1, 2: combo2, 3: combo3 };

/** 콤보 수 → 아이콘 단계(1·2·3) */
export const getComboTier = (n = 0) => {
  if (n >= COMBO_MILESTONE_STEP * 2) return 3;
  if (n >= COMBO_MILESTONE_STEP) return 2;
  return 1;
};

/**
 * @param {number} n 콤보 수 — 단계를 고른다
 * @param {1|2|3} [tier] 단계를 직접 정할 때
 * @param {string} [className] 크기는 호출부가 정한다(예: 'w-[24px] h-[24px]')
 */
const ComboIcon = ({ n = 0, tier, className = '', alt = '콤보' }) => (
  <img
    src={COMBO_ICON_ASSETS[tier ?? getComboTier(n)] ?? combo1}
    alt={alt}
    draggable={false}
    className={`select-none object-contain ${className}`}
  />
);

export default ComboIcon;
