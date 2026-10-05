// src/lib/feel/sfx.js
//
// 효과음 — 실제 악기 녹음(CC0, VCSL)을 큐별로 미리 렌더한 WAV 샘플을 재생한다(테마: marimba | kalimba).
// 'synth' 테마는 예전 Web Audio 합성음(비교용 + 샘플 디코드 실패 시 폴백)으로 남겨 둔다.
// 샘플 출처·규칙: src/assets/sounds/feel/README.md. 파일은 WAV 24kHz mono 16-bit(인코더 지연이 없어
// 진동과 타이밍이 맞는다). 컨텍스트 샘플레이트(44.1/48kHz)가 달라도 decodeAudioData 가 컨텍스트 레이트로
// 리샘플해 주므로 길이(초)·음 시작 시각은 그대로 유지된다.
//
// utils/audio.jsx 의 AudioContext 와 unlock(primeSfx)을 그대로 공유한다. 모든 큐는 `when`(ctx.currentTime
// 기준 절대 시각)에 시작하도록 예약한다 — cue.js 가 진동 지연과 맞추려고 미리 계산한 시각을 넘긴다.
// 샘플 파일 안의 음 시작 시각(ms)은 SFX_NOTE_STARTS_MS 와 같고 hapticPatterns.js 의 진동 이벤트 time 과 1:1.
//
// 샘플 경로: AudioBufferSourceNode → 테마 gain → 마스터 gain → DynamicsCompressor(원음 유지, lowpass/리버브 없음).
// 합성 경로: 예전 그대로(lowpass 1.6kHz + 짧은 리버브 버스).
import { getAudioCtx, registerPrimeHook } from '../../utils/audio';

// ── 설정(이 기기 localStorage) ─────────────────────────────────────
//   feel.sfxTheme    'marimba' | 'kalimba' | 'synth'
//   feel.sfxVolume   0~150 (%)
export const SFX_THEMES = ['marimba', 'kalimba', 'synth'];
export const SFX_THEME_LABEL = { marimba: '마림바', kalimba: '칼림바', synth: '합성' };
export const SFX_VOLUME_MIN = 0;
export const SFX_VOLUME_MAX = 150;
const KEY_THEME = 'feel.sfxTheme';
const KEY_VOLUME = 'feel.sfxVolume';
// 테마 전체 gain(샘플은 이미 큐 간 상대 음량으로 정규화돼 있어 큐별 gain 은 1)
const THEME_GAIN = 0.9;

const readLS = (k) => {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null; } catch (e) { return null; }
};
const writeLS = (k, v) => {
  try { localStorage.setItem(k, v); } catch (e) { /* noop */ }
};

let themeCache = null;
let volumeCache = null;

export function getSfxTheme() {
  if (themeCache !== null) return themeCache;
  const raw = readLS(KEY_THEME);
  themeCache = SFX_THEMES.includes(raw) ? raw : 'marimba';
  return themeCache;
}

export function setSfxTheme(theme) {
  const v = SFX_THEMES.includes(theme) ? theme : 'marimba';
  themeCache = v;
  writeLS(KEY_THEME, v);
  preloadSfx(v);
  return v;
}

export function getSfxVolumePercent() {
  if (volumeCache !== null) return volumeCache;
  const raw = readLS(KEY_VOLUME);
  const p = raw === null ? 100 : parseInt(raw, 10);
  volumeCache = Number.isFinite(p) ? Math.max(SFX_VOLUME_MIN, Math.min(SFX_VOLUME_MAX, p)) : 100;
  return volumeCache;
}

export function setSfxVolumePercent(p) {
  const v = Math.max(SFX_VOLUME_MIN, Math.min(SFX_VOLUME_MAX, Math.round(Number(p) || 0)));
  volumeCache = v;
  writeLS(KEY_VOLUME, String(v));
  return v;
}

// 큐별 샘플 파일 길이(ms, 감쇠 꼬리 포함). 합성 테마도 같은 값을 쓴다(표시용).
export const SFX_DURATION_MS = {
  tap: 58,
  select: 176,
  correct: 602,
  wrong: 600,
  match: 454,
  combo: 506,
  perfect: 820,
  progress: 45,
  bonus: 880,
  complete: 1354,
};

// 겹침 대기(cue.js 의 busyUntil)에 쓰는 '체감상 끝나는 지점' — 감쇠 꼬리가 길어 전체 길이만큼 기다리면 과하다.
export const SFX_BUSY_MS = Object.fromEntries(
  Object.entries(SFX_DURATION_MS).map(([k, v]) => [k, Math.round(v * 0.6)]),
);

// 큐별 소리 음 시작 시각(ms) — 샘플 파일 렌더 시각이자 합성 CUES 의 각 음 `t + d`. 편집기 그래프의 세로 눈금선에 쓴다.
export const SFX_NOTE_STARTS_MS = {
  tap: [0],
  select: [0],
  correct: [0, 90],
  wrong: [0, 120],
  match: [0, 70],
  combo: [0, 90],
  perfect: [0, 90, 180],
  progress: [0],
  bonus: [0, 80, 160, 240],
  complete: [0, 110, 220, 330],
};

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 메이저 펜타토닉(C D E G A) MIDI. 스케일 인덱스 → 음. (G4 A4 C5 D5 E5 G5 A5 C6)
const PENTA = [67, 69, 72, 74, 76, 79, 81, 84];
const N = { C5: 72, D5: 74, E5: 76, G5: 79, A5: 81, C6: 84, G4: 67, A4: 69 };

const BUS_LP_HZ = 1600;
const REVERB_WET = 0.12;
const REVERB_SEC = 0.16;

let chain = null; // { ctx, input, noise, sample, synthVol }
const getChain = (ctx) => {
  if (chain && chain.ctx === ctx) return chain;
  const input = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = BUS_LP_HZ;
  lp.Q.value = 0.6;
  const master = ctx.createGain();
  master.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 14;
  comp.ratio.value = 5;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  input.connect(lp);
  lp.connect(master); // dry
  // 짧고 얕은 리버브 — 지수 감쇠 노이즈 임펄스(한 번만 생성)
  const len = Math.max(1, Math.floor(ctx.sampleRate * REVERB_SEC));
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = REVERB_WET;
  lp.connect(conv).connect(wet).connect(master);
  master.connect(comp).connect(ctx.destination);
  // 타격 노이즈용 짧은 백색잡음 버퍼(공유)
  const nlen = Math.max(1, Math.floor(ctx.sampleRate * 0.03));
  const noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  // 샘플 버스 — lowpass/리버브 없이 마스터로 직결(원음 유지)
  const sample = ctx.createGain();
  sample.connect(master);
  chain = { ctx, input, noise, sample };
  return chain;
};

// 사인 보이스 하나 — 어택(attack) 후 지수 감쇠, 끝은 0 으로 램프(클릭 방지). cents 로 디튠, slideTo/from 은 완만한 피치 변화.
function voice(ctx, out, {
  at, freq, dur, peak, cents = 0, attack = 0.011, from = null, bendSec = 0.05, slideTo = null,
}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  if (cents) osc.detune.value = cents;
  if (from) {
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + bendSec);
  } else {
    osc.frequency.setValueAtTime(freq, at);
  }
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  const a = Math.min(attack, dur * 0.3);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + a);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.gain.linearRampToValueAtTime(0, at + dur + 0.012);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.03);
}

// 말렛이 닿는 순간의 짧은 노이즈(밴드패스) 버스트. 노이즈 소스는 오실레이터 수에 넣지 않는다.
function knock(ctx, c, at, hz, peak, sec = 0.008) {
  const src = ctx.createBufferSource();
  const bp = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = c.noise;
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(Math.max(hz, 500), 1800);
  bp.Q.value = 0.9;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + sec);
  g.gain.linearRampToValueAtTime(0, at + sec + 0.004);
  src.connect(bp).connect(g).connect(c.input);
  src.start(at);
  src.stop(at + sec + 0.01);
}

// 마림바/칼림바 음. lean = sine 1 + 노이즈(오실레이터 1개),
// rich = ±5 cent 디튠 2보이스 + 비정수(3.9배) 약한 부분음 + 노이즈(오실레이터 3개).
function note(ctx, c, at, midi, { dur = 0.16, peak = 0.1, rich = false } = {}) {
  const f = midiToFreq(midi);
  const out = c.input;
  if (rich) {
    voice(ctx, out, { at, freq: f, dur, peak: peak * 0.55, cents: -5 });
    voice(ctx, out, { at, freq: f, dur, peak: peak * 0.55, cents: 5 });
    voice(ctx, out, { at, freq: f * 3.9, dur: Math.min(dur * 0.2, 0.05), peak: peak * 0.06, attack: 0.004 });
  } else {
    voice(ctx, out, { at, freq: f, dur, peak });
  }
  knock(ctx, c, at, f * 2.5, peak * 0.3);
}

// 물방울 '뽁' — 살짝만 올라오는 둥근 sine(오실레이터 1개). rich 면 디튠 2개.
function pop(ctx, c, at, midi, { dur = 0.1, peak = 0.1, bend = 0.9, rich = false } = {}) {
  const f = midiToFreq(midi);
  const o = { at, freq: f, from: f * bend, bendSec: 0.05, dur };
  if (rich) {
    voice(ctx, c.input, { ...o, peak: peak * 0.55, cents: -4 });
    voice(ctx, c.input, { ...o, peak: peak * 0.55, cents: 4 });
  } else {
    voice(ctx, c.input, { ...o, peak });
  }
}

// 음 시작 시각(ms)은 hapticPatterns.js 의 time 과 같다.
const CUES = {
  // 아주 작은 나무 톡
  tap: (x, c, t) => {
    voice(x, c.input, { at: t, freq: 520, slideTo: 440, dur: 0.035, peak: 0.035, attack: 0.006 });
    knock(x, c, t, 900, 0.02);
  },
  // 물방울 '뽁'
  select: (x, c, t) => pop(x, c, t, N.C5, { dur: 0.1, peak: 0.1 }),
  // 마림바 상승 2음 (E5 → A5)
  correct: (x, c, t) => {
    note(x, c, t, N.E5, { dur: 0.15, peak: 0.09 });
    note(x, c, t + 0.09, N.A5, { dur: 0.24, peak: 0.11, rich: true });
  },
  // 낮고 둥근 '툭… 툭' 2음 하강(불쾌감 없는 부드러운 나무 소리)
  wrong: (x, c, t) => {
    const lo = (at, m, to, dur) => {
      const f = midiToFreq(m);
      voice(x, c.input, { at, freq: f, slideTo: midiToFreq(to), dur, peak: 0.065, cents: -4, attack: 0.012 });
      voice(x, c.input, { at, freq: f, slideTo: midiToFreq(to), dur, peak: 0.065, cents: 4, attack: 0.012 });
      knock(x, c, at, f * 2, 0.03, 0.01);
    };
    lo(t, 57, 55, 0.2);
    lo(t + 0.12, 52, 50, 0.26);
  },
  // 맑은 '딩딩'
  match: (x, c, t) => {
    note(x, c, t, N.G5, { dur: 0.11, peak: 0.09 });
    note(x, c, t + 0.07, N.C6, { dur: 0.17, peak: 0.1, rich: true });
  },
  // 콤보 수가 오를수록 펜타토닉을 따라 한 음씩 올라간다('뽕' 두 번).
  combo: (x, c, t, n = 2) => {
    const idx = Math.min(Math.max(n - 2, 0), PENTA.length - 3);
    const vol = Math.min(0.085 + idx * 0.005, 0.11);
    pop(x, c, t, PENTA[idx], { dur: 0.11, peak: vol * 0.8 });
    pop(x, c, t + 0.09, PENTA[idx + 2], { dur: 0.17, peak: vol, rich: true });
  },
  // 반짝이는 3음
  perfect: (x, c, t) => {
    note(x, c, t, N.E5, { dur: 0.13, peak: 0.08 });
    note(x, c, t + 0.09, N.G5, { dur: 0.13, peak: 0.09 });
    note(x, c, t + 0.18, N.C6, { dur: 0.28, peak: 0.11, rich: true });
  },
  // 거의 안 들리는 작은 나무 톡
  progress: (x, c, t) => {
    voice(x, c.input, { at: t, freq: midiToFreq(79), dur: 0.035, peak: 0.014, attack: 0.008 });
    knock(x, c, t, 800, 0.008);
  },
  // 통통 튀는 4음
  bonus: (x, c, t) => {
    [[N.C5, 0], [N.G5, 0.08], [N.E5, 0.16], [N.C6, 0.24]].forEach(([m, d], i) => {
      pop(x, c, t + d, m, { dur: i === 3 ? 0.26 : 0.1, peak: 0.085 + i * 0.01, bend: 0.92, rich: i === 3 });
    });
  },
  // 짧고 사랑스러운 팡파르(0.85초 이내) — 마지막 음만 rich
  complete: (x, c, t) => {
    note(x, c, t, N.C5, { dur: 0.14, peak: 0.09 });
    note(x, c, t + 0.11, N.E5, { dur: 0.14, peak: 0.095 });
    note(x, c, t + 0.22, N.G5, { dur: 0.14, peak: 0.1 });
    note(x, c, t + 0.33, N.C6, { dur: 0.45, peak: 0.115, rich: true });
  },
};

export const SFX_NAMES = Object.keys(CUES);

// ── 샘플 로드 ─────────────────────────────────────────────────────
// Vite 가 wav 를 해시 파일명으로 내보낸다(4KB 미만 tap/progress 는 data URI 로 인라인될 수 있으나 fetch 가 둘 다 처리).
const SAMPLE_URLS = import.meta.glob('../../assets/sounds/feel/*/*.wav', { query: '?url', import: 'default', eager: true });
const sampleUrl = (theme, name) => SAMPLE_URLS[`../../assets/sounds/feel/${theme}/${name}.wav`];

const buffers = {}; // `${theme}/${name}` → AudioBuffer
const pending = {}; // `${theme}/${name}` → Promise<AudioBuffer|null> (null = 실패)

const decode = (ctx, ab) => new Promise((resolve, reject) => {
  // Safari 호환: Promise 미반환 시그니처가 있어 콜백형으로 호출.
  try {
    const ret = ctx.decodeAudioData(ab, resolve, reject);
    if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
  } catch (e) { reject(e); }
});

function loadSample(theme, name) {
  const key = `${theme}/${name}`;
  if (buffers[key]) return Promise.resolve(buffers[key]);
  if (pending[key]) return pending[key];
  const ctx = getAudioCtx();
  const url = sampleUrl(theme, name);
  if (!ctx || !url) return Promise.resolve(null);
  pending[key] = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((ab) => decode(ctx, ab))
    .then((buf) => { buffers[key] = buf; return buf; })
    .catch(() => { delete pending[key]; return null; }); // 실패 → 재생 시 synth 폴백(다음 요청에서 재시도)
  return pending[key];
}

/** 테마(기본: 현재 테마)의 10개 큐를 미리 디코드한다. 이미 받았으면 즉시 끝난다. */
export function preloadSfx(theme = getSfxTheme()) {
  if (theme === 'synth') return Promise.resolve();
  return Promise.all(SFX_NAMES.map((n) => loadSample(theme, n)));
}

// 첫 사용자 입력(primeSfx)에서도 프리로드, 앱 시작 직후 idle 에도 프리로드.
registerPrimeHook(() => { preloadSfx(); });
if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));
  idle(() => { preloadSfx(); });
}

// 콤보 수 → 반음 올림(펜타토닉 계단, 상한 +12). n=2 가 첫 단계.
const COMBO_SEMITONES = [0, 2, 4, 7, 9, 12];
const comboRate = (n) => {
  const i = Math.min(Math.max((Number(n) || 2) - 2, 0), COMBO_SEMITONES.length - 1);
  return Math.pow(2, COMBO_SEMITONES[i] / 12);
};

function startSample(ctx, c, buf, name, when, n) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (name === 'combo') src.playbackRate.value = comboRate(n);
  src.connect(c.sample);
  src.start(Math.max(when ?? 0, ctx.currentTime + 0.001));
}

const setVolumes = (c) => {
  const vol = getSfxVolumePercent() / 100;
  c.sample.gain.value = THEME_GAIN * vol;
  c.input.gain.value = vol;
};

/**
 * 효과음을 `when`(AudioContext 시각, 초)에 시작하도록 예약한다.
 * 샘플이 아직 디코드 전이면 준비되는 즉시(when 이 이미 지났으면 바로) 재생한다 — 무음으로 건너뛰지 않는다.
 * 디코드 실패 시에만 합성음으로 폴백.
 * @returns {boolean} 재생이 예약됐는지(컨텍스트 없음 등이면 false)
 */
export function playSfx(name, { when, n } = {}) {
  const ctx = getAudioCtx();
  const synth = CUES[name];
  if (!ctx || !synth) return false;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
    const c = getChain(ctx);
    setVolumes(c);
    const theme = getSfxTheme();
    const playSynth = (at) => synth(ctx, c, Math.max(at ?? 0, ctx.currentTime + 0.001), n);
    if (theme === 'synth' || !sampleUrl(theme, name)) { playSynth(when); return true; }
    const buf = buffers[`${theme}/${name}`];
    if (buf) { startSample(ctx, c, buf, name, when, n); return true; }
    loadSample(theme, name).then((b) => {
      try {
        if (b) startSample(ctx, c, b, name, when, n);
        else playSynth(when);
      } catch (e) { /* noop */ }
    });
    return true;
  } catch (e) {
    return false;
  }
}
