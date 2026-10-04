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
//   Android(진폭 waveform): **sharpness 무시**, continuous 는 상수 진폭. 그래서
//     - '약→강' 램프는 30~50ms continuous 계단을 intensity 를 올려가며 이어 붙이고
//     - '묵직한 턱'은 높은 intensity + 긴 duration(40~60ms), '가벼운 톡'은 낮은 intensity + 짧은 duration(10~20ms)
//   로 구분한다.
//
// 각 패턴의 time 은 sfx.js 의 음 시작 시각과 1:1 로 맞춰져 있다(소리 음 ↔ 진동 톡).
// 패턴 길이(PATTERN_DURATION_MS)는 대응 효과음 길이(SFX_DURATION_MS)와 비슷하게 유지한다.

const T = (time, intensity, sharpness, duration = 12) => ({ time, type: 'transient', duration, intensity, sharpness });
const C = (time, duration, intensity, sharpness) => ({ time, type: 'continuous', duration, intensity, sharpness });

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const comboK = (n = 2) => clamp01((Math.min(Math.max(n, 2), 14) - 2) / 12); // 0~1

// Android 용 계단 램프 — [from, from+steps*stepMs) 구간을 intensity i0→i1 로 올려가며 채운다.
const stepRamp = (from, steps, stepMs, i0, i1) => Array.from({ length: steps }, (_, s) => (
  C(from + s * stepMs, stepMs, clamp01(i0 + ((i1 - i0) * s) / Math.max(steps - 1, 1)), 0.5)
));

const PATTERNS = {
  // 아주 가벼운 톡
  tap: {
    ios: () => [T(0, 0.35, 0.6)],
    android: () => [T(0, 0.3, 0.6, 10)],
  },
  // 또렷한 톡
  select: {
    ios: () => [T(0, 0.6, 0.85)],
    android: () => [T(0, 0.55, 0.85, 14)],
  },
  // 약하다가 세게 — 약한 톡 → 90ms 뒤 강한 톡(= 두 번째 음) + 짧은 여운
  correct: {
    ios: () => [T(0, 0.3, 0.5), T(90, 0.95, 0.8), C(110, 110, 0.2, 0.3)],
    android: () => [T(0, 0.28, 0.5, 10), T(90, 1, 0.8, 26), C(120, 90, 0.2, 0.3)],
  },
  // 턱 때리듯 묵직하게 — 강한 저-sharpness 톡 + 짧은 continuous 여운
  wrong: {
    ios: () => [T(0, 1, 0.15, 20), C(30, 130, 0.45, 0.1), C(180, 100, 0.18, 0.05)],
    android: () => [C(0, 55, 1, 0.1), C(60, 70, 0.5, 0.1), C(135, 100, 0.2, 0.1)],
  },
  // 가벼운 더블 탭
  match: {
    ios: () => [T(0, 0.45, 0.7), T(55, 0.6, 0.8)],
    android: () => [T(0, 0.4, 0.7, 10), T(55, 0.55, 0.8, 14)],
  },
  // 짧은 상승 램프(0~90ms) 후 톡 — 콤보가 높을수록 강하게
  combo: {
    ios: ({ n } = {}) => {
      const k = comboK(n);
      return [
        C(0, 90, 0.2 + k * 0.25, 0.4),
        T(90, clamp01(0.6 + k * 0.4), clamp01(0.7 + k * 0.2)),
        C(110, 110, 0.12 + k * 0.2, 0.3),
      ];
    },
    android: ({ n } = {}) => {
      const k = comboK(n);
      return [
        ...stepRamp(0, 3, 30, 0.18 + k * 0.2, 0.4 + k * 0.3),
        T(90, clamp01(0.65 + k * 0.35), 0.8, 20 + Math.round(k * 12)),
        C(125, 90, 0.12 + k * 0.18, 0.3),
      ];
    },
  },
  // 3연타 상승
  perfect: {
    ios: () => [T(0, 0.5, 0.7), T(90, 0.75, 0.8), T(180, 1, 0.9), C(200, 160, 0.25, 0.3)],
    android: () => [T(0, 0.45, 0.7, 12), T(90, 0.7, 0.8, 16), T(180, 1, 0.9, 28), C(215, 120, 0.22, 0.3)],
  },
  // 거의 안 느껴질 정도
  progress: {
    ios: () => [T(0, 0.12, 0.3)],
    android: () => [T(0, 0.12, 0.3, 8)],
  },
  // 리듬 있는 축하 시퀀스(1초 이내)
  bonus: {
    ios: () => [T(0, 0.5, 0.7), T(80, 0.6, 0.75), T(160, 0.75, 0.8), T(240, 1, 0.9), C(260, 240, 0.3, 0.3)],
    android: () => [T(0, 0.45, 0.7, 12), T(80, 0.55, 0.75, 14), T(160, 0.7, 0.8, 18), T(240, 1, 0.9, 30), C(280, 200, 0.25, 0.3)],
  },
  complete: {
    ios: () => [
      T(0, 0.5, 0.7), T(110, 0.6, 0.75), T(220, 0.75, 0.8), T(330, 1, 0.9),
      C(350, 200, 0.35, 0.3), T(560, 0.5, 0.6), T(720, 0.4, 0.5),
    ],
    android: () => [
      T(0, 0.45, 0.7, 12), T(110, 0.55, 0.75, 14), T(220, 0.7, 0.8, 18), T(330, 1, 0.9, 30),
      C(370, 170, 0.3, 0.3), T(560, 0.45, 0.6, 14), T(720, 0.35, 0.5, 12),
    ],
  },
};

export const HAPTIC_NAMES = Object.keys(PATTERNS);

/**
 * 패턴 이벤트 배열 반환(없는 이름이면 null).
 * @param {{n?:number, platform?:'ios'|'android'}} opts  n=콤보 수(combo 세기), platform=변형 선택(기본 ios)
 */
export function getHapticPattern(name, opts = {}) {
  const entry = PATTERNS[name];
  if (!entry) return null;
  const make = opts.platform === 'android' ? entry.android : entry.ios;
  return make(opts);
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

export const PATTERN_DURATION_MS = Object.fromEntries(
  HAPTIC_NAMES.map((k) => [k, patternDuration(getHapticPattern(k))]),
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
