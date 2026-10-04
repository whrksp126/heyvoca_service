// src/lib/feel/index.js
//
// 공통 인터랙션 피드백("손맛") 시스템 — 한 모듈에서 함수화해 재사용한다.
// 사용 규칙(어디서 어떤 kind 를 쓰는지)은 haptics.js 상단 표 참고.
//
//   import { feel, haptic, SPRING, TAP, variants, Pressable, useCountUp } from '@/lib/feel';
//
// 문제 화면(takeTest·questionTypes)은 소리·진동을 직접 부르지 말고 feel(cue) 한 줄만 쓴다.
// 큐: tap select correct wrong match combo perfect progress bonus complete (cue.js 참고)

export { haptic, hapticPattern, hapticWarmup, supportsHapticPattern } from './haptics';
export { feel, FEEL_TIMING, getHapticOffsetMs, setHapticOffsetMs, getFeelTimingSnapshot, measureOutputLatency } from './cue';
export { SFX_NAMES, SFX_DURATION_MS } from './sfx';
export { HAPTIC_NAMES, PATTERN_DURATION_MS, validatePattern, getHapticPattern } from './hapticPatterns';
export { SPRING, TAP, variants, pickVariant } from './motion';
export { default as Pressable } from './Pressable';
export { useCountUp } from './useCountUp';
export { CORRECT_PHRASES, pickCorrectPhrase } from './phrases';
export { default as ShineSweep } from './ShineSweep';
export { default as Burst } from './Burst';
export { default as PerfectBadge } from './PerfectBadge';
