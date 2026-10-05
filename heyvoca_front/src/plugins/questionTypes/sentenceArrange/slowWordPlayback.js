// 듣고 문장 만들기의 0.7 버튼 — 단어마다 일정한 짧은 간격을 둔 느린 재생.
//
// 문장 전체를 playbackRate 0.7 로 틀면 단어 사이 간격이 사라져 잘 안 들리고, 단어별로 순서대로
// getTextSound 를 부르면 단어마다 네트워크·로딩이 붙어 간격이 너무 길다. 그래서 문제 진입 시
// 단어별 TTS(기존 prefetchTextSound → /tts/resolve 캐시 경로)를 미리 받아 Web Audio 버퍼로 디코드해 두고,
// 느림은 배속이 아니라 단어 간격만으로 만든다(AudioBufferSource 의 playbackRate 는 음높이까지 내려 다른 목소리처럼 들린다).
// 재생 때는 각 버퍼의 앞뒤 무음을 잘라 AudioContext 시간으로 한 번에 스케줄한다(타이머 지터 없음).
//
// 캐시 단위: 서버는 정규화한 텍스트(공백 정리·NFC, 대소문자 구분)의 sha256 을 키로 쓴다. 그래서 단어는
// 소문자(대명사 I 는 대문자)로 맞춰 요청한다 — 단어 사전 TTS 가 보통 소문자 표제어로 캐시돼 있어 대부분 히트.
import { getAudioCtx } from '../../../utils/audio';
import { prefetchTextSound, registerSoundPreempt } from '../../../utils/common';

const GAP_SEC = 0.24;       // 단어 사이 고정 간격(실시간 기준)
const PAD_HEAD_SEC = 0.008; // 트림 후 앞쪽 여유
const PAD_TAIL_SEC = 0.02;  // 트림 후 뒤쪽 여유
const FADE_SEC = 0.006;     // 클릭 노이즈 방지 페이드
const MAX_WORDS = 20;
const FETCH_CONCURRENCY = 3;

const EDGE_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

// 문장 → 재생 순서의 단어 키 목록(구두점 제거, 소문자). 영어 외·띄어쓰기 없는 문장은 빈 배열.
export const splitSlowWords = (text, lang) => {
  if (lang !== 'en') return [];
  return String(text || '')
    .replace(/[’‘]/g, "'")
    .split(/\s+/)
    .map((w) => w.replace(EDGE_PUNCT, ''))
    .filter(Boolean)
    .map((w) => (/^i(?:'|$)/i.test(w) ? `I${w.slice(1).toLowerCase()}` : w.toLowerCase()));
};

const decode = (ctx, ab) => new Promise((resolve, reject) => {
  try {
    const ret = ctx.decodeAudioData(ab, resolve, reject);
    if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
  } catch (e) { reject(e); }
});

// 진폭 임계값으로 앞뒤 무음 구간을 잘라낸 { buffer, startSec, durSec }
const trimSilence = (buffer) => {
  const sr = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
  const thr = Math.max(0.01, peak * 0.04);
  let first = 0;
  while (first < data.length && Math.abs(data[first]) < thr) first += 1;
  let last = data.length - 1;
  while (last > first && Math.abs(data[last]) < thr) last -= 1;
  if (first >= last) return { buffer, startSec: 0, durSec: buffer.duration };
  const startSec = Math.max(0, first / sr - PAD_HEAD_SEC);
  const endSec = Math.min(buffer.duration, last / sr + PAD_TAIL_SEC);
  return { buffer, startSec, durSec: Math.max(0.05, endSec - startSec) };
};

const loadOne = async (ctx, word, lang) => {
  const url = await prefetchTextSound(word, lang);
  if (!url) return null;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const ab = await resp.arrayBuffer();
  return trimSilence(await decode(ctx, ab));
};

/**
 * 문장의 단어별 버퍼를 미리 받아 둔다. 하나라도 실패하거나 단어가 너무 적/많으면 null(→ 호출부가 문장 전체 0.7 폴백).
 * @param {() => boolean} isCancelled 언마운트 등으로 더 필요 없으면 true 를 돌려주는 함수
 */
export const loadSlowWords = async (text, lang, isCancelled = () => false) => {
  const ctx = getAudioCtx();
  const seq = splitSlowWords(text, lang);
  if (!ctx || seq.length < 2 || seq.length > MAX_WORDS) return null;
  const uniq = [...new Set(seq)];
  const map = new Map();
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (next < uniq.length && !failed && !isCancelled()) {
      const w = uniq[next]; next += 1;
      try {
        const item = await loadOne(ctx, w, lang);
        if (item) map.set(w, item); else failed = true;
      } catch (e) { failed = true; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, uniq.length) }, worker));
  if (failed || isCancelled() || map.size !== uniq.length) return null;
  return { seq, map };
};

let active = null; // { nodes, finish }

export const stopSlowWords = () => {
  if (!active) return;
  const cur = active;
  active = null;
  cur.nodes.forEach((n) => { try { n.src.stop(); } catch (e) { /* noop */ } try { n.src.disconnect(); n.gain.disconnect(); } catch (e) { /* noop */ } });
  cur.finish();
};
registerSoundPreempt(stopSlowWords);

/** 프리로드한 단어들을 AudioContext 시간으로 한 번에 스케줄해 재생. 끝나거나 중단되면 resolve. */
export const playSlowWords = (loaded) => new Promise((resolve) => {
  const ctx = getAudioCtx();
  if (!ctx || !loaded) { resolve(); return; }
  stopSlowWords();
  try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { /* noop */ }
  const nodes = [];
  let t = ctx.currentTime + 0.06;
  loaded.seq.forEach((w) => {
    const item = loaded.map.get(w);
    if (!item) return;
    const real = item.durSec; // 배속 없음(음높이 유지) — 느림은 단어 사이 간격으로만 만든다
    const src = ctx.createBufferSource();
    src.buffer = item.buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE_SEC);
    gain.gain.setValueAtTime(1, Math.max(t + FADE_SEC, t + real - FADE_SEC));
    gain.gain.linearRampToValueAtTime(0, t + real);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(t, item.startSec, item.durSec);
    nodes.push({ src, gain });
    t += real + GAP_SEC;
  });
  if (!nodes.length) { resolve(); return; }
  let done = false;
  const finish = () => { if (done) return; done = true; if (active && active.finish === finish) active = null; resolve(); };
  nodes[nodes.length - 1].src.onended = finish;
  active = { nodes, finish };
});
