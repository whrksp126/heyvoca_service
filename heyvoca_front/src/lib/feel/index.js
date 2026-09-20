// src/lib/feel/index.js
//
// 공통 인터랙션 피드백("손맛") 시스템 — 한 모듈에서 함수화해 재사용한다.
// 사용 규칙(어디서 어떤 kind 를 쓰는지)은 haptics.js 상단 표 참고.
//
//   import { haptic, SPRING, TAP, variants, Pressable, useCountUp } from '@/lib/feel';

export { haptic, isHapticsEnabled, setHapticsEnabled } from './haptics';
export { SPRING, TAP, variants, pickVariant } from './motion';
export { default as Pressable } from './Pressable';
export { useCountUp } from './useCountUp';
