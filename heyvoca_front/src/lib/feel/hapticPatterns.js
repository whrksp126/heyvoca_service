// src/lib/feel/hapticPatterns.js
//
// 커스텀 진동 패턴 표 — 듀오링고식 감각 어휘.
// 이벤트 모델: { time(ms), type:'transient'|'continuous', duration(ms), intensity 0~1, sharpness 0~1 }
//   - transient  : 톡(순간 탭). 짧은 duration.
//   - continuous : 여운/램프. duration 동안 이어진다.
//   - sharpness 높음 = 또렷·날카로움, 낮음 = 묵직·둔함.
//
// 【앱 브릿지 계약(앱 1.1.2, 확정)】 haptic_pattern 의 events 는 1~32개, time 은 수치,
//   총 길이 max(time+duration) ≤ 3000ms — 어기면 앱이 통째로 무시한다. 그리고 **이벤트가 시간상
//   겹치면 겹쳐 울리지 않고 순차 재생**되므로 모든 패턴은 [time, time+duration) 구간이 서로
//   겹치지 않게 짠다(validatePattern 이 검사한다. 손맛 테스트 화면에 결과를 보여 준다).
//   intensity 0 이벤트는 앱이 버린다.
//
// 【플랫폼 차이 — 변형(ios/android)을 따로 둔다】
//   iOS(CoreHaptics)  : intensity·sharpness 둘 다 반영 → sharpness 로 '톡'과 '묵직함'을 구분.
//   Android: sharpness 무시. 이벤트의 `effect`(프리베이크)를 우선하고, 없으면 waveform 폴백.
//
// 【Android 설계】 이 기기류는 진폭 제어가 안 돼 모든 진동이 최대 세기로 울린다 → duration 으로 세기를 흉내 내지 않고
//   시스템 프리베이크 효과(tick/click/heavyClick)를 쓴다. 진동 횟수·총 길이도 최소화했다(progress 는 없음).
//
// 【Android 재생 방식 — 변형 3개】
//   'android-waveform' : 진폭 제어(hasAmplitudeControl) 기기의 기본. effect 없이 intensity→진폭, duration 그대로.
//                        세기 조절(전역 세기·편집기)이 실제로 먹힌다. 아주 약하고 짧게('가볍게') 잡았다.
//   'android'          : 프리베이크 effect(tick/click/heavyClick) 전용 — 세기 조절 불가. 진폭 제어가 없는 기기나 수동 비교용.
//   (위 Android 설계 문단은 'android' 변형에 대한 설명이다.)
//   사용자가 손맛 테스트에서 편집한 패턴은 hapticSettings 의 오버라이드(플랫폼·변형별)로 우선 적용된다.
//
// 각 패턴의 time 은 sfx.js 의 음 시작 시각과 1:1 로 맞춰져 있다(소리 음 ↔ 진동 톡).
// 패턴 길이(PATTERN_DURATION_MS)는 대응 효과음 길이(SFX_DURATION_MS)와 비슷하게 유지한다.

import { getOverride } from './hapticSettings';

const T = (time, intensity, sharpness, duration = 12) => ({ time, type: 'transient', duration, intensity, sharpness });
const C = (time, duration, intensity, sharpness) => ({ time, type: 'continuous', duration, intensity, sharpness });

// Android 프리베이크 효과 이벤트 — 앱이 `effect` 를 지원하면 시스템 효과(VibrationEffect.EFFECT_*)로 재생하고,
// 모르는 앱(effect 무시)은 같은 이벤트의 waveform(intensity·duration)으로 재생한다. 그래서 waveform 폴백도
// 뭉개지지 않게 duration 을 짧게 잡는다(톡 8~12ms, 강 18~25ms, 여운 없음).
//   effect: 'tick' | 'click' | 'heavyClick' | 'doubleClick'
// duration 은 [time, time+duration) 비중첩 검사용 근사 길이(tick≈10, click≈16, heavyClick≈24, doubleClick≈60).
// 앱 계약: effect 이벤트 사이는 60ms 이상(진동기 하나 — 새 진동이 진행 중인 진동을 끊는다), 한 패턴에 effect 와
// waveform 이벤트를 섞지 않는다(Android 변형은 effect 만으로 구성), doubleClick 은 OS 고정 길이 2연타.
// 프리베이크 미지원 기기(supportsPrebaked=false)는 platform:'android-waveform' 으로 effect 를 뗀 짧은 waveform 변형을 쓴다.
const E = (time, effect, intensity, duration) => ({
  time, type: 'transient', duration, intensity, sharpness: 0.8, effect,
});
const TICK = (time) => E(time, 'tick', 0.3, 10);
const CLICK = (time, i = 0.55) => E(time, 'click', i, 16);
const HEAVY = (time) => E(time, 'heavyClick', 1, 24);

// waveform 변형 이벤트 — sharpness 는 Android 가 무시(iOS 와 필드 모양만 맞춘다)
const W = (time, intensity, duration) => ({ time, type: 'transient', duration, intensity, sharpness: 0.5 });

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const comboK = (n = 2) => clamp01((Math.min(Math.max(n, 2), 14) - 2) / 12); // 0~1

const PATTERNS = {
  // 아주 약한 톡 (선택지 탭마다 울려도 가장 약한 tick)
  tap: {
    ios: () => [T(0, 0.25, 0.8)],
    android: () => [TICK(0)],
    androidWave: () => [W(0, 0.15, 8)],
  },
  // 또렷한 톡
  select: {
    ios: () => [T(0, 0.45, 0.9)],
    android: () => [CLICK(0)],
    androidWave: () => [W(0, 0.25, 10)],
  },
  // 약하다가 세게 — tick → 90ms → click (= 소리 두 음)
  correct: {
    ios: () => [T(0, 0.25, 0.7), T(90, 0.8, 0.9)],
    android: () => [TICK(0), CLICK(90, 0.8)],
    androidWave: () => [W(0, 0.2, 10), W(90, 0.45, 14)],
  },
  // 한 번 묵직하게, 여운 없음
  wrong: {
    ios: () => [T(0, 0.85, 0.3, 20), C(30, 70, 0.25, 0.2)],
    android: () => [HEAVY(0)],
    androidWave: () => [W(0, 0.5, 22)],
  },
  // 가벼운 더블 탭(소리 두 음)
  match: {
    ios: () => [T(0, 0.35, 0.85), T(70, 0.5, 0.9)],
    android: () => [TICK(0), TICK(70)],
    androidWave: () => [W(0, 0.18, 10), W(70, 0.28, 10)],
  },
  // tick … click — 콤보가 높을수록 두 번째가 세진다
  combo: {
    ios: ({ n } = {}) => {
      const k = comboK(n);
      return [T(0, 0.25 + k * 0.15, 0.8), T(90, clamp01(0.5 + k * 0.4), 0.9)];
    },
    android: ({ n } = {}) => {
      const k = comboK(n);
      return [TICK(0), k > 0.6 ? HEAVY(90) : CLICK(90, 0.55 + k * 0.4)];
    },
    androidWave: ({ n } = {}) => [W(0, 0.2, 10), W(90, Math.round((0.3 + comboK(n) * 0.25) * 100) / 100, 14)],
  },
  // tick · tick · click 상승
  perfect: {
    ios: () => [T(0, 0.35, 0.8), T(90, 0.55, 0.85), T(180, 0.85, 0.9)],
    android: () => [TICK(0), TICK(90), CLICK(180, 0.8)],
    androidWave: () => [W(0, 0.2, 10), W(90, 0.3, 10), W(180, 0.5, 14)],
  },
  // 진동 없음 — 소리·시각만. (iOS 는 거의 느껴지지 않는 한 번)
  progress: {
    ios: () => [T(0, 0.1, 0.5)],
    android: () => null,
    androidWave: () => null,
  },
  // tick tick tick click 리듬
  bonus: {
    ios: () => [T(0, 0.35, 0.8), T(80, 0.45, 0.85), T(160, 0.55, 0.85), T(240, 0.85, 0.9)],
    android: () => [TICK(0), TICK(80), TICK(160), CLICK(240, 0.8)],
    androidWave: () => [W(0, 0.2, 8), W(80, 0.25, 8), W(160, 0.3, 10), W(240, 0.5, 14)],
  },
  complete: {
    ios: () => [
      T(0, 0.35, 0.8), T(110, 0.45, 0.85), T(220, 0.55, 0.85), T(330, 0.85, 0.9), T(560, 0.35, 0.7),
    ],
    android: () => [TICK(0), TICK(110), TICK(220), CLICK(330, 0.85), TICK(560)],
    androidWave: () => [W(0, 0.2, 10), W(110, 0.25, 10), W(220, 0.3, 12), W(330, 0.5, 16), W(560, 0.2, 10)],
  },
  // 경험치 오름 — 아주 가볍게 올라가는 3번(소리 3음 = 0/50/100ms). 프리베이크는 60ms 간격 제한이라 0·100 두 번만
  xpUp: {
    ios: () => [T(0, 0.12, 0.7, 8), T(50, 0.16, 0.7, 8), T(100, 0.22, 0.75, 8)],
    android: () => [TICK(0), TICK(100)],
    androidWave: () => [W(0, 0.12, 8), W(50, 0.16, 8), W(100, 0.22, 8)],
  },
  // 경험치 내림 — 가볍고 살짝 무딘 2번(0/70ms)
  xpDown: {
    ios: () => [T(0, 0.2, 0.4, 10), T(70, 0.14, 0.35, 10)],
    android: () => [TICK(0), TICK(70)],
    androidWave: () => [W(0, 0.2, 10), W(70, 0.14, 10)],
  },
  // 진화 — 또렷하게 올라가다 마지막(240ms)에 한 번 강조
  evolve: {
    ios: () => [T(0, 0.15, 0.8, 8), T(60, 0.2, 0.8, 8), T(120, 0.25, 0.85, 8), T(180, 0.3, 0.85, 8), T(240, 0.5, 0.9, 14)],
    android: () => [TICK(0), TICK(60), TICK(120), TICK(180), CLICK(240, 0.8)],
    androidWave: () => [W(0, 0.15, 8), W(60, 0.2, 8), W(120, 0.25, 8), W(180, 0.3, 8), W(240, 0.5, 14)],
  },
};

export const HAPTIC_NAMES = Object.keys(PATTERNS);

/**
 * 패턴 이벤트 배열 반환(없는 이름이면 null). 사용자 오버라이드가 있으면 그것을 우선한다(규격 위반이면 무시).
 * @param {{n?:number, platform?:'ios'|'android'|'android-waveform', noOverride?:boolean}} opts
 *   n=콤보 수(combo 세기), platform=변형 선택(기본 ios), noOverride=true 면 코드 기본값만.
 */
export function getHapticPattern(name, opts = {}) {
  const entry = PATTERNS[name];
  if (!entry) return null;
  const platform = opts.platform || 'ios';
  if (!opts.noOverride) {
    const ov = getOverride(platform, name);
    if (ov && validateForVariant(ov, platform).length === 0) return ov.map((e) => ({ ...e }));
  }
  if (platform === 'android-waveform') return entry.androidWave(opts) || null;
  const make = platform === 'android' ? entry.android : entry.ios;
  return make(opts) || null;
}

/** 패턴 전체 길이(ms) */
export function patternDuration(events) {
  return (events || []).reduce((m, e) => Math.max(m, e.time + e.duration), 0);
}

/**
 * 앱 계약 검사 — 1~32개, 숫자 time, 총 길이 ≤ 3000ms, 이벤트 구간 비중첩, intensity > 0.
 * @returns {string[]} 위반 사유 목록(빈 배열이면 통과)
 */
export function validatePattern(events) {
  const errs = [];
  if (!Array.isArray(events) || events.length < 1 || events.length > 32) {
    errs.push(`이벤트 수 ${Array.isArray(events) ? events.length : '?'} (1~32)`);
    return errs;
  }
  const sorted = [...events].sort((a, b) => a.time - b.time);
  sorted.forEach((e, i) => {
    if (typeof e.time !== 'number' || !Number.isFinite(e.time)) errs.push(`#${i} time 이 수치가 아님`);
    if (!(e.intensity > 0)) errs.push(`#${i} intensity 0`);
    if (i > 0) {
      const p = sorted[i - 1];
      if (p.time + p.duration > e.time) errs.push(`#${i - 1}~#${i} 구간 겹침`);
    }
  });
  if (patternDuration(events) > 3000) errs.push('총 길이 3000ms 초과');
  return errs;
}

/**
 * 변형별 규격 검사 — validatePattern + 값 범위 + effect/waveform 혼용 금지 + 프리베이크 이벤트 간격(시작 60ms 이상).
 * @param {'ios'|'android'|'android-waveform'} variant
 */
export function validateForVariant(events, variant) {
  const errs = validatePattern(events);
  if (!Array.isArray(events) || events.length < 1 || events.length > 32) return errs;
  const sorted = [...events].sort((a, b) => a.time - b.time);
  sorted.forEach((e, i) => {
    if (e.time < 0) errs.push(`#${i} 시작 시각이 0 미만`);
    if (!(e.duration >= 1)) errs.push(`#${i} 길이가 1ms 미만`);
    if (e.intensity > 1) errs.push(`#${i} 세기가 100% 초과`);
    if (variant === 'android' && !e.effect) errs.push(`#${i} 프리베이크 변형에는 effect 가 필요함(혼용 금지)`);
    if (variant !== 'android' && e.effect) errs.push(`#${i} effect 는 프리베이크 변형에서만 가능(혼용 금지)`);
    if (variant === 'android' && i > 0 && e.time - sorted[i - 1].time < 60) {
      errs.push(`#${i - 1}~#${i} 프리베이크 이벤트 간격 60ms 미만`);
    }
  });
  return errs;
}

// 코드 기본값 기준 길이(오버라이드 무관)
export const PATTERN_DURATION_MS = Object.fromEntries(
  HAPTIC_NAMES.map((k) => [k, patternDuration(getHapticPattern(k, { noOverride: true }))]),
);

// 앱이 haptic_pattern 을 모르는 경우(1.1.2 미만) 가장 가까운 기존 kind. null 이면 폴백 진동 없음.
export const KIND_FALLBACK = {
  tap: 'light',
  select: 'selection',
  correct: 'success',
  wrong: 'error',
  match: 'light',
  combo: 'medium',
  perfect: 'success',
  progress: null,
  bonus: 'success',
  complete: 'success',
  xpUp: 'light',
  xpDown: 'light',
  evolve: 'medium',
};

/**
 * 이벤트 → navigator.vibrate 패턴([on,off,on,...]) 근사. 순수 웹은 세기 조절이 없어
 * transient 는 intensity 에 비례한 짧은 펄스, continuous 는 그 길이의 3할로 줄여 쓴다.
 */
export function eventsToWebPattern(events) {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const out = [];
  let cursor = 0;
  for (const e of sorted) {
    const on = e.type === 'continuous'
      ? Math.max(6, Math.round(e.duration * 0.3 * e.intensity + 4))
      : Math.round(6 + e.intensity * 22);
    const gap = e.time - cursor;
    if (out.length === 0) {
      out.push(on); // 첫 펄스 앞 지연은 호출부 setTimeout 이 맡는다
    } else if (gap <= 0) {
      out[out.length - 1] = Math.max(out[out.length - 1], on); // 직전 펄스와 겹침 → 합친다
    } else {
      out.push(gap, on);
    }
    cursor = Math.max(cursor, e.time + on);
  }
  return out;
}
