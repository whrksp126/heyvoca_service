// src/lib/feel/sfx.js
//
// 효과음 합성 — 파일·라이선스 없이 Web Audio(OscillatorNode/GainNode 엔벨로프)로 만든다.
// utils/audio.jsx 의 AudioContext 와 unlock(primeSfx)을 그대로 공유한다.
//
// 모든 큐는 `when`(ctx.currentTime 기준 절대 시각)을 받아 **그 시각에 시작하도록 예약**한다 —
// cue.js 가 진동 지연과 맞추려고 미리 계산한 시각을 넘긴다. 음 하나하나의 시작 시각(ms)은
// hapticPatterns.js 의 진동 이벤트 time 과 같은 값으로 짜여 있다(소리 음 ↔ 진동 톡이 1:1).
//
// 볼륨은 절제: 기존 success/error mp3 가 gain 0.5 였던 것에 비해 합성음 피크는 0.12~0.2 안팎.
// 동시에 여러 개가 겹쳐도 마스터 gain → DynamicsCompressor 를 거쳐 클리핑하지 않는다.
import { getAudioCtx } from '../../utils/audio';

// 큐별 총 길이(ms) — 대응 진동 패턴 길이와 맞춘다(hapticPatterns.js PATTERN_DURATION_MS 참고).
export const SFX_DURATION_MS = {
  tap: 30,
  select: 70,
  correct: 300,
  wrong: 280,
  match: 160,
  combo: 260,
  perfect: 380,
  progress: 60,
  bonus: 520,
  complete: 900,
};

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

let chain = null; // { ctx, input }
const getChain = (ctx) => {
  if (chain && chain.ctx === ctx) return chain.input;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.12;
  master.connect(comp).connect(ctx.destination);
  chain = { ctx, input: master };
  return master;
};

// 음 하나 — 3ms 어택 후 지수 감쇠. slideTo 가 있으면 주파수가 그 값으로 미끄러진다.
function tone(ctx, out, {
  at, freq, dur, peak, type = 'sine', slideTo = null, filter = null,
}) {
  const t0 = at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    osc.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// 음 시작 시각(ms)은 hapticPatterns.js 의 time 과 같다.
const CUES = {
  tap: (c, o, t) => tone(c, o, { at: t, freq: 1500, slideTo: 1000, dur: 0.022, peak: 0.07, type: 'triangle' }),
  select: (c, o, t) => {
    tone(c, o, { at: t, freq: midiToFreq(84), dur: 0.05, peak: 0.1, type: 'triangle' });
  },
  correct: (c, o, t) => {
    tone(c, o, { at: t, freq: midiToFreq(76), dur: 0.12, peak: 0.1, type: 'triangle' });
    tone(c, o, { at: t + 0.09, freq: midiToFreq(83), dur: 0.2, peak: 0.16, type: 'triangle' });
    tone(c, o, { at: t + 0.09, freq: midiToFreq(95), dur: 0.14, peak: 0.04, type: 'sine' });
  },
  wrong: (c, o, t) => {
    tone(c, o, { at: t, freq: midiToFreq(55), slideTo: midiToFreq(48), dur: 0.26, peak: 0.2, type: 'triangle', filter: 700 });
    tone(c, o, { at: t, freq: midiToFreq(43), dur: 0.12, peak: 0.12, type: 'sine' });
  },
  match: (c, o, t) => {
    tone(c, o, { at: t, freq: midiToFreq(79), dur: 0.07, peak: 0.1, type: 'triangle' });
    tone(c, o, { at: t + 0.055, freq: midiToFreq(86), dur: 0.1, peak: 0.12, type: 'triangle' });
  },
  // 콤보 수가 오를수록 반음씩 올라간다(상한 12반음 = 한 옥타브).
  combo: (c, o, t, n = 2) => {
    const step = Math.min(Math.max(n - 2, 0), 12);
    const base = 72 + step;
    const vol = Math.min(0.1 + step * 0.006, 0.17);
    tone(c, o, { at: t, freq: midiToFreq(base), slideTo: midiToFreq(base + 7), dur: 0.09, peak: vol * 0.7, type: 'triangle' });
    tone(c, o, { at: t + 0.09, freq: midiToFreq(base + 12), dur: 0.17, peak: vol, type: 'triangle' });
  },
  perfect: (c, o, t) => {
    [[76, 0], [79, 0.09], [84, 0.18]].forEach(([m, d], i) => {
      tone(c, o, { at: t + d, freq: midiToFreq(m), dur: i === 2 ? 0.2 : 0.1, peak: 0.1 + i * 0.03, type: 'triangle' });
    });
    tone(c, o, { at: t + 0.18, freq: midiToFreq(96), dur: 0.2, peak: 0.035, type: 'sine' });
  },
  progress: (c, o, t) => tone(c, o, { at: t, freq: midiToFreq(91), dur: 0.04, peak: 0.03, type: 'sine' }),
  bonus: (c, o, t) => {
    [[72, 0], [76, 0.08], [79, 0.16], [84, 0.24]].forEach(([m, d], i) => {
      tone(c, o, { at: t + d, freq: midiToFreq(m), dur: i === 3 ? 0.26 : 0.1, peak: 0.1 + i * 0.015, type: 'triangle' });
    });
    tone(c, o, { at: t + 0.24, freq: midiToFreq(96), dur: 0.26, peak: 0.04, type: 'sine' });
  },
  complete: (c, o, t) => {
    [[72, 0, 0.12], [76, 0.11, 0.12], [79, 0.22, 0.12], [84, 0.33, 0.5]].forEach(([m, d, du], i) => {
      tone(c, o, { at: t + d, freq: midiToFreq(m), dur: du, peak: 0.11 + i * 0.015, type: 'triangle' });
    });
    [[79, 0.33], [88, 0.33]].forEach(([m, d]) => {
      tone(c, o, { at: t + d, freq: midiToFreq(m), dur: 0.5, peak: 0.05, type: 'sine' });
    });
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
