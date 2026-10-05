// src/lib/feel/sfx.js
//
// 효과음 합성 — 파일·라이선스 없이 Web Audio(OscillatorNode/GainNode 엔벨로프)로 만든다.
// utils/audio.jsx 의 AudioContext 와 unlock(primeSfx)을 그대로 공유한다.
//
// 모든 큐는 `when`(ctx.currentTime 기준 절대 시각)을 받아 **그 시각에 시작하도록 예약**한다 —
// cue.js 가 진동 지연과 맞추려고 미리 계산한 시각을 넘긴다. 음 하나하나의 시작 시각(ms)은
// hapticPatterns.js 의 진동 이벤트 time 과 같은 값으로 짜여 있다(소리 음 ↔ 진동 톡이 1:1).
//
// 음색: 마림바/칼림바/물방울 같은 부드럽고 따뜻한 나무 질감. 순수 sine 의 전자음 느낌을 줄이려고
//  - 음역을 낮춤(G4~C6, 중심 C5~A5) + 공용 버스 lowpass(1.6kHz, Q 0.6)로 고역을 둥글게,
//  - 어택 10~12ms + 지수 감쇠(끝은 0 으로 램프해 클릭 없음),
//  - 기음을 ±5 cent 디튠한 2보이스(rich 음)로 미세한 두께,
//  - 타격 순간 5~12ms 의 필터드 노이즈 버스트(작은 음량)로 말렛이 닿는 느낌,
//  - 비정수 배음(약 3.9배)을 아주 약하고 빠르게,
//  - 공용 짧은 리버브(임펄스 0.16초, wet 12%)로 방 안의 공간감.
// 날카로운 square/saw 는 쓰지 않는다. 큐당 오실레이터는 6개 이내(노이즈 소스는 별도, 임펄스·노이즈 버퍼는 컨텍스트당 1회 생성).
//
// 볼륨은 절제: 합성음 피크는 0.04~0.12 안팎. 마스터 gain → DynamicsCompressor 를 거쳐 클리핑하지 않는다.
import { getAudioCtx } from '../../utils/audio';

// 큐별 총 길이(ms) — 대응 진동 패턴 길이와 맞춘다(hapticPatterns.js PATTERN_DURATION_MS 참고).
export const SFX_DURATION_MS = {
  tap: 40,
  select: 100,
  correct: 320,
  wrong: 380,
  match: 220,
  combo: 300,
  perfect: 480,
  progress: 50,
  bonus: 520,
  complete: 850,
};

// 큐별 소리 음 시작 시각(ms) — 아래 CUES 의 각 음 `t + d` 와 같은 값. 편집기 그래프의 세로 눈금선에 쓴다.
// (CUES 의 음 시각을 바꾸면 여기도 같이 고칠 것)
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

let chain = null; // { ctx, input, noise }
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
  chain = { ctx, input, noise };
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

/**
 * 효과음을 `when`(AudioContext 시각, 초)에 시작하도록 예약한다.
 * @returns {boolean} 합성 재생이 예약됐는지(컨텍스트 없음/suspended 등이면 false)
 */
export function playSfx(name, { when, n } = {}) {
  const ctx = getAudioCtx();
  const fn = CUES[name];
  if (!ctx || !fn) return false;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* noop */ });
    const c = getChain(ctx);
    const t = Math.max(when ?? 0, ctx.currentTime + 0.001);
    fn(ctx, c, t, n);
    return true;
  } catch (e) {
    return false;
  }
}
