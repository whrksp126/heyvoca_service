import successSound from '../assets/sounds/success.mp3';
import errorSound from '../assets/sounds/error.mp3';

// 채점 효과음 저지연 재생.
//
// iOS WKWebView에서 HTMLAudioElement는 재생 시점에 src 로드/디코드가 얽혀 O/X 시각 표시보다
// 소리가 눈에 띄게 늦게 난다(채점 효과음 지연 이슈). 이를 없애기 위해 Web Audio API를 쓴다:
//  1) 첫 user gesture(primeSfx)에서 AudioContext를 만들고 resume(iOS unlock) + mp3를 미리 디코드.
//  2) 재생 시엔 이미 디코드된 AudioBuffer로 AudioBufferSourceNode를 만들어 start(0) — 로드/디코드가
//     전혀 없어 즉시(같은 프레임 수준) 소리가 난다.
// Web Audio 미지원/디코드 실패 시에만 HTMLAudioElement로 폴백한다.

const AudioCtx = typeof window !== 'undefined'
  ? (window.AudioContext || window.webkitAudioContext)
  : null;

let audioCtx = null;
const srcUrls = { success: successSound, error: errorSound };
const buffers = { success: null, error: null };
let decodeStarted = false;

const ensureCtx = () => {
  if (!AudioCtx) return null;
  if (!audioCtx) {
    try { audioCtx = new AudioCtx(); } catch (e) { audioCtx = null; }
  }
  return audioCtx;
};

// mp3 → ArrayBuffer → decodeAudioData → AudioBuffer 캐시. gesture와 무관하게 미리 받아둔다.
const decodeAll = () => {
  const ctx = ensureCtx();
  if (!ctx || decodeStarted) return;
  decodeStarted = true;
  Object.keys(srcUrls).forEach((key) => {
    fetch(srcUrls[key])
      .then((r) => r.arrayBuffer())
      .then((ab) => new Promise((resolve, reject) => {
        // Safari 호환: Promise 미반환 시그니처가 있어 콜백형으로 호출.
        try {
          const ret = ctx.decodeAudioData(ab, resolve, reject);
          if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
        } catch (e) { reject(e); }
      }))
      .then((buf) => { buffers[key] = buf; })
      .catch(() => { /* 디코드 실패 → 재생 시 HTMLAudio 폴백 */ });
  });
};

// ── HTMLAudio 폴백 ────────────────────────────────────────────────
let successAudio = null;
let errorAudio = null;
const getFallback = (key) => {
  if (key === 'success') {
    if (!successAudio) {
      successAudio = new Audio(successSound);
      successAudio.preload = 'auto';
      successAudio.volume = 0.5;
    }
    return successAudio;
  }
  if (!errorAudio) {
    errorAudio = new Audio(errorSound);
    errorAudio.preload = 'auto';
    errorAudio.volume = 0.5;
  }
  return errorAudio;
};

// 첫 user gesture에서 HTMLAudio element를 unlock하기 위한 무음 클립.
const SILENT_AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
let sfxPrimed = false;

// 반드시 클릭 등 user gesture의 동기 호출 스택에서 호출되어야 한다(await/setTimeout 이후 호출 시 unlock 실패).
// 이미 prime됐으면 no-op.
export const primeSfx = () => {
  if (sfxPrimed) return;
  sfxPrimed = true;

  // Web Audio: gesture 안에서 resume(iOS unlock) + 디코드 시작 + 무음 버퍼 1회로 확실히 unlock.
  const ctx = ensureCtx();
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
    decodeAll();
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch (e) { /* noop */ }
  }

  // HTMLAudio 폴백도 unlock.
  [getFallback('success'), getFallback('error')].forEach((audio) => {
    try {
      audio.src = SILENT_AUDIO;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* 무음 재생 reject 무시 */ });
    } catch (e) { /* noop */ }
  });
};

const playSfx = (key) => {
  // 1순위: Web Audio (디코드 완료 시) — 지연 없이 즉시 재생.
  const ctx = audioCtx;
  if (ctx && buffers[key]) {
    try {
      if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
      const source = ctx.createBufferSource();
      source.buffer = buffers[key];
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      source.connect(gain).connect(ctx.destination);
      source.start(0);
      return;
    } catch (e) { /* 폴백으로 */ }
  }

  // 2순위: HTMLAudio 폴백. primeSfx가 src를 무음으로 바꿔둘 수 있어 실제 src로 되돌린 뒤 재생.
  const audio = getFallback(key);
  try {
    const realSrc = key === 'success' ? successSound : errorSound;
    if (!audio.src || audio.src.startsWith('data:')) audio.src = realSrc;
    audio.currentTime = 0;
    audio.play().catch((e) => console.error('Error playing sfx:', e));
  } catch (e) { /* noop */ }
};

/**
 * 정답 시 효과음 재생
 */
export const playSuccessSound = () => playSfx('success');

/**
 * 오답 시 효과음 재생
 */
export const playErrorSound = () => playSfx('error');
