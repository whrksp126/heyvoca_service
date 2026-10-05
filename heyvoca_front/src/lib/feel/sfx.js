// src/lib/feel/sfx.js
//
// 효과음 합성 — 파일·라이선스 없이 Web Audio(OscillatorNode/GainNode 엔벨로프)로 만든다.
// utils/audio.jsx 의 AudioContext 와 unlock(primeSfx)을 그대로 공유한다.
//
// 모든 큐는 `when`(ctx.currentTime 기준 절대 시각)을 받아 **그 시각에 시작하도록 예약**한다 —
// cue.js 가 진동 지연과 맞추려고 미리 계산한 시각을 넘긴다. 음 하나하나의 시작 시각(ms)은
// hapticPatterns.js 의 진동 이벤트 time 과 같은 값으로 짜여 있다(소리 음 ↔ 진동 톡이 1:1).
//
// 음색: 마림바/칼림바/물방울 같은 부드럽고 둥근 장난감 소리. sine 기음 + 약한 배음(2·4배음)을
// 빠른 어택(4ms)·짧은 지수 감쇠로 울리고 lowpass 로 고역을 둥글게 깎는다. 날카로운 square/saw 는 쓰지 않는다.
// 음계는 밝은 메이저 펜타토닉(C D E G A) 800~2100Hz 중심.
//
// 볼륨은 절제: 기존 success/error mp3 가 gain 0.5 였던 것에 비해 합성음 피크는 0.06~0.14 안팎.
// 동시에 여러 개가 겹쳐도 마스터 gain → DynamicsCompressor 를 거쳐 클리핑하지 않는다.
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

// 메이저 펜타토닉(C D E G A) MIDI. 스케일 인덱스 → 음.
const PENTA = [79, 81, 84, 86, 88, 91, 93, 96]; // G5 A5 C6 D6 E6 G6 A6 C7
const N = { C6: 84, D6: 86, E6: 88, G6: 91, A6: 93, C7: 96, G5: 79, A5: 81 };

let chain = null; // { ctx, input }
const getChain = (ctx) => {
  if (chain && chain.ctx === ctx) return chain.input;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 14;
  comp.ratio.value = 5;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;
  master.connect(comp).connect(ctx.destination);
  chain = { ctx, input: master };
  return master;
};

// 부분음 하나 — 4ms 어택 후 지수 감쇠. from 이 있으면 from → freq 로 빠르게 올라오는 '뽁'(pitch-bend).
function partial(ctx, out, {
  at, freq, dur, peak, type = 'sine', from = null, bendMs = 0.04, slideTo = null, lp = 3200,
}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  osc.type = type;
  if (from) {
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + bendMs);
  } else {
    osc.frequency.setValueAtTime(freq, at);
  }
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  f.type = 'lowpass';
  f.frequency.value = lp;
  osc.connect(f).connect(g).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

// 마림바/칼림바 음 — 기음(sine) + 2배음(triangle, 약하게·짧게) + 4배음(아주 약하고 매우 짧게, '톡' 어택)
function marimba(ctx, out, at, midi, { dur = 0.16, peak = 0.1 } = {}) {
  const f = midiToFreq(midi);
  partial(ctx, out, { at, freq: f, dur, peak });
  partial(ctx, out, { at, freq: f * 2, dur: dur * 0.5, peak: peak * 0.22, type: 'triangle' });
  partial(ctx, out, { at, freq: f * 4, dur: dur * 0.2, peak: peak * 0.08 });
}

// 물방울 '뽁' — 낮은 음에서 올라오는 짧은 sine blip
function pop(ctx, out, at, midi, { dur = 0.1, peak = 0.1, bend = 0.7 } = {}) {
  const f = midiToFreq(midi);
  partial(ctx, out, { at, freq: f, from: f * bend, bendMs: 0.035, dur, peak, lp: 2600 });
  partial(ctx, out, { at, freq: f * 2, from: f * bend * 2, bendMs: 0.035, dur: dur * 0.4, peak: peak * 0.12, lp: 3500 });
}

// 음 시작 시각(ms)은 hapticPatterns.js 의 time 과 같다.
const CUES = {
  // 아주 작은 나무 '톡'
  tap: (c, o, t) => partial(c, o, { at: t, freq: 980, slideTo: 720, dur: 0.03, peak: 0.055, lp: 2200 }),
  // 물방울 '뽁'
  select: (c, o, t) => pop(c, o, t, N.C6, { dur: 0.09, peak: 0.1 }),
  // 마림바 상승 2음 (E6 → A6)
  correct: (c, o, t) => {
    marimba(c, o, t, N.E6, { dur: 0.14, peak: 0.09 });
    marimba(c, o, t + 0.09, N.A6, { dur: 0.22, peak: 0.12 });
  },
  // 낮고 부드러운 '뿌웅' 2음 하강 — 살짝 김빠지는 느낌(버저 아님)
  wrong: (c, o, t) => {
    partial(c, o, { at: t, freq: midiToFreq(62), slideTo: midiToFreq(59), dur: 0.2, peak: 0.13, lp: 700 });
    partial(c, o, { at: t + 0.12, freq: midiToFreq(57), slideTo: midiToFreq(52), dur: 0.26, peak: 0.12, lp: 600 });
  },
  // 맑은 '딩딩'
  match: (c, o, t) => {
    marimba(c, o, t, N.G6, { dur: 0.1, peak: 0.09 });
    marimba(c, o, t + 0.07, N.C7, { dur: 0.16, peak: 0.1 });
  },
  // 콤보 수가 오를수록 펜타토닉을 따라 한 음씩 올라간다('뽕' 두 번).
  combo: (c, o, t, n = 2) => {
    const idx = Math.min(Math.max(n - 2, 0), PENTA.length - 3);
    const vol = Math.min(0.085 + idx * 0.005, 0.115);
    pop(c, o, t, PENTA[idx], { dur: 0.1, peak: vol * 0.8 });
    pop(c, o, t + 0.09, PENTA[idx + 2], { dur: 0.16, peak: vol });
  },
  // 반짝이는 3음 + 아주 약한 shimmer
  perfect: (c, o, t) => {
    marimba(c, o, t, N.E6, { dur: 0.12, peak: 0.08 });
    marimba(c, o, t + 0.09, N.G6, { dur: 0.12, peak: 0.09 });
    marimba(c, o, t + 0.18, N.C7, { dur: 0.26, peak: 0.11 });
    partial(c, o, { at: t + 0.18, freq: midiToFreq(103), dur: 0.28, peak: 0.012, lp: 5000 });
    partial(c, o, { at: t + 0.19, freq: midiToFreq(103.2), dur: 0.26, peak: 0.01, lp: 5000 });
  },
  // 거의 안 들리는 작은 틱
  progress: (c, o, t) => partial(c, o, { at: t, freq: midiToFreq(91), dur: 0.03, peak: 0.022, lp: 2400 }),
  // 통통 튀는 4음
  bonus: (c, o, t) => {
    [[N.C6, 0], [N.G6, 0.08], [N.E6, 0.16], [N.C7, 0.24]].forEach(([m, d], i) => {
      pop(c, o, t + d, m, { dur: i === 3 ? 0.26 : 0.09, peak: 0.085 + i * 0.01, bend: 0.8 });
    });
  },
  // 짧고 사랑스러운 팡파르(0.85초 이내)
  complete: (c, o, t) => {
    marimba(c, o, t, N.C6, { dur: 0.13, peak: 0.09 });
    marimba(c, o, t + 0.11, N.E6, { dur: 0.13, peak: 0.095 });
    marimba(c, o, t + 0.22, N.G6, { dur: 0.13, peak: 0.1 });
    marimba(c, o, t + 0.33, N.C7, { dur: 0.45, peak: 0.12 });
    marimba(c, o, t + 0.33, N.G6, { dur: 0.4, peak: 0.05 });
    marimba(c, o, t + 0.33, N.E6, { dur: 0.4, peak: 0.04 });
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
    const out = getChain(ctx);
    const t = Math.max(when ?? 0, ctx.currentTime + 0.001);
    fn(ctx, out, t, n);
    return true;
  } catch (e) {
    return false;
  }
}
