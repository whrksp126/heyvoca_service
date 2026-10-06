// src/components/takeTest/rewards/ResultCta.jsx
//
// 학습 결과 화면 하단 버튼 — 보상 슬라이드와 최종 결과가 같이 쓴다.
import React from 'react';
import { motion } from 'framer-motion';

/*
  하단 버튼 — **온보딩 하단 CTA와 같은 규격**(pages/Onboarding.jsx `Cta`).
    52px / radius 12 / 16px·700 / tracking -0.03em / whileTap 0.97
  결과 화면은 온보딩 첫 학습에서 그대로 이어지는 화면이라, 같은 자리의 버튼이 45px·radius 8 로
  달라 보이면 화면이 바뀐 게 아니라 앱이 바뀐 것처럼 읽힌다.

  【면 — 2026-09-27 실기기 피드백】
    주 버튼: 홈 주 CTA(home/FarmCta.jsx)와 같은 세로 핑크 그라데이션 + 상단 안쪽 하이라이트.
      글자는 모드와 무관하게 흰색이다(홈 CTA 와 같다). 다크에서 바깥 그림자를 쓰지 않는 것도 같다.
    보조 버튼: 상점 `Btn` sec 톤(purchaseParts.jsx) — 라이트 회색 면 / 다크 gray-dark 면.
      예전의 "빈 면 + 2px 테두리"는 다크에서 검은 바탕 위 검은 버튼이 되어 거의 안 보였다.
  두 버튼은 높이·라운드·글자 규격이 같고 색만 다르다.
*/
export const CTA_BASE = 'h-[52px] rounded-[12px] text-[16px] font-[700] tracking-[-0.03em]';
export const CTA_PRIMARY_FACE = `
  bg-[linear-gradient(180deg,#FF88DC_0%,#FF70D4_100%)] text-layout-white
  shadow-[inset_0_1px_0_rgba(255,255,255,.34),0_6px_16px_rgba(255,112,212,.28)]
  dark:shadow-[inset_0_1px_0_rgba(255,255,255,.34)]
`;
export const CTA_SECONDARY_FACE = 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200';

export const ResultCta = ({ label, onClick, secondary = false, className = '' }) => (
  <motion.button
    type="button"
    onClick={onClick}
    whileTap={{ scale: 0.97 }}
    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
    className={`${CTA_BASE} ${secondary ? CTA_SECONDARY_FACE : CTA_PRIMARY_FACE} ${className}`}
  >
    {label}
  </motion.button>
);

/*
  하단 버튼 자리 — 온보딩과 같은 여백(px 24 / pt 18 / pb 26).
  면은 토큰 배경 한 겹이다. 예전에는 흰색→흰색 그라데이션을 인라인 style 로 깔았는데,
  라이트 모드 문자열의 괄호가 닫히지 않아(`... 100%'`) 값 자체가 무효였다 —
  결국 아무것도 안 깔린 채 목록이 버튼 뒤로 비쳤다.
*/
export const ResultCtaBar = ({ children, className = '' }) => (
  <div className={`flex items-center gap-[12px] px-[24px] pt-[18px] pb-[26px] bg-layout-white dark:bg-layout-black ${className}`}>
    {children}
  </div>
);
