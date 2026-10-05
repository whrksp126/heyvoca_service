// src/lib/feel/hapticSettings.js
//
// 진동 사용자 설정(이 기기 localStorage) — 전역 세기, 재생 방식, 패턴 오버라이드.
//   feel.hapticStrength   0~200 (%, 정수). 모든 이벤트 intensity 에 곱한 뒤 0.01~1 로 clamp.
//   feel.hapticMode       'auto' | 'waveform' | 'prebaked'  (Android 재생 방식. iOS 는 무시)
//   feel.hapticOverrides  { [variant]: { [cue]: events[] } }  variant = 'ios' | 'android' | 'android-waveform'
// 학습 화면 번들에도 들어가는 파일이라 의존성 없이 작게 유지한다(편집기 UI 는 lazy).

const KEY_STRENGTH = 'feel.hapticStrength';
const KEY_MODE = 'feel.hapticMode';
const KEY_OVERRIDES = 'feel.hapticOverrides';

export const STRENGTH_MIN = 0;
export const STRENGTH_MAX = 200;
export const HAPTIC_MODES = ['auto', 'waveform', 'prebaked'];
export const HAPTIC_VARIANTS = ['ios', 'android', 'android-waveform'];

const read = (k) => {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null; } catch (e) { return null; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, v); } catch (e) { /* noop */ }
};

let strengthCache = null;
let modeCache = null;
let overridesCache = null;

export function getHapticStrengthPercent() {
  if (strengthCache !== null) return strengthCache;
  const raw = read(KEY_STRENGTH);
  const p = raw === null ? 100 : parseInt(raw, 10);
  strengthCache = Number.isFinite(p) ? Math.max(STRENGTH_MIN, Math.min(STRENGTH_MAX, p)) : 100;
  return strengthCache;
}

export function setHapticStrengthPercent(p) {
  const v = Math.max(STRENGTH_MIN, Math.min(STRENGTH_MAX, Math.round(Number(p) || 0)));
  strengthCache = v;
  write(KEY_STRENGTH, String(v));
  return v;
}

export function getHapticMode() {
  if (modeCache !== null) return modeCache;
  const raw = read(KEY_MODE);
  modeCache = HAPTIC_MODES.includes(raw) ? raw : 'auto';
  return modeCache;
}

export function setHapticMode(mode) {
  const v = HAPTIC_MODES.includes(mode) ? mode : 'auto';
  modeCache = v;
  write(KEY_MODE, v);
  return v;
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/** 전역 세기를 이벤트 intensity 에 곱해 clamp(0.01~1). 새 배열을 반환한다. */
export function applyStrength(events) {
  const f = getHapticStrengthPercent() / 100;
  return events.map((e) => ({ ...e, intensity: Math.max(0.01, Math.min(1, round3((Number(e.intensity) || 0) * f))) }));
}

const cleanEvent = (e) => {
  if (!e || typeof e !== 'object') return null;
  const time = Number(e.time);
  const duration = Number(e.duration);
  const intensity = Number(e.intensity);
  if (![time, duration, intensity].every(Number.isFinite)) return null;
  const out = {
    time,
    type: e.type === 'continuous' ? 'continuous' : 'transient',
    duration,
    intensity,
    sharpness: Number.isFinite(Number(e.sharpness)) ? Number(e.sharpness) : 0.5,
  };
  if (typeof e.effect === 'string' && e.effect) out.effect = e.effect;
  return out;
};

/** 저장/가져오기 공용 정리 — 형식이 깨진 항목은 버린다. */
export function sanitizeOverrides(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  HAPTIC_VARIANTS.forEach((variant) => {
    const byCue = obj[variant];
    if (!byCue || typeof byCue !== 'object') return;
    Object.keys(byCue).forEach((cue) => {
      const list = byCue[cue];
      if (!Array.isArray(list) || list.length === 0) return;
      const cleaned = list.map(cleanEvent);
      if (cleaned.some((x) => !x)) return;
      out[variant] = out[variant] || {};
      out[variant][cue] = cleaned;
    });
  });
  return out;
}

export function getOverrides() {
  if (overridesCache !== null) return overridesCache;
  let parsed = {};
  try { parsed = JSON.parse(read(KEY_OVERRIDES) || '{}'); } catch (e) { parsed = {}; }
  overridesCache = sanitizeOverrides(parsed);
  return overridesCache;
}

const persistOverrides = () => write(KEY_OVERRIDES, JSON.stringify(overridesCache || {}));

export function getOverride(variant, cue) {
  return getOverrides()?.[variant]?.[cue] || null;
}

export function setOverride(variant, cue, events) {
  const cur = getOverrides();
  const cleaned = sanitizeOverrides({ [variant]: { [cue]: events } });
  if (!cleaned[variant]?.[cue]) return false;
  overridesCache = { ...cur, [variant]: { ...(cur[variant] || {}), [cue]: cleaned[variant][cue] } };
  persistOverrides();
  return true;
}

export function clearOverride(variant, cue) {
  const cur = getOverrides();
  if (!cur[variant]?.[cue]) return;
  const nextVariant = { ...cur[variant] };
  delete nextVariant[cue];
  const next = { ...cur, [variant]: nextVariant };
  if (Object.keys(nextVariant).length === 0) delete next[variant];
  overridesCache = next;
  persistOverrides();
}

export function clearAllOverrides() {
  overridesCache = {};
  persistOverrides();
}

export function replaceOverrides(obj) {
  overridesCache = sanitizeOverrides(obj);
  persistOverrides();
  return overridesCache;
}
