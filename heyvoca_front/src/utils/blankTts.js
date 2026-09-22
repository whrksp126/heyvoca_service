import { backendUrl, fetchDataAsync, stopCurrentSound, registerExternalSound } from './common';
import { getSharedAudioContext } from './audio';

/*
  빈칸 채우기 — "빈칸 구간만 무음"으로 예문을 읽어 주는 재생기.

  백엔드 `/tts/resolve?timestamps=1` 은 presigned mp3 URL 과 함께 단어 단위 타이밍
  `alignment: [{ text, start, end }] | null` (초; 영어=단어, 한국어=어절)을 돌려준다.
  여기서는
    1) resolveTtsWithAlignment — URL + alignment 조회
    2) findMuteSpan            — 빈칸 단어(blankFill)가 차지하는 시간 구간 찾기
    3) playWithMutedSpan       — Web Audio 로 재생하되 그 구간만 gain 0
  세 단계를 제공한다. HTMLAudio 로는 구간 무음이 불가능해(volume 변경의 지연/클릭음)
  Web Audio 를 쓴다. 공용 재생기(common.getTextSound)와 "한 번에 하나만" 규칙을
  공유하기 위해 registerExternalSound 에 자신의 stop 을 등록한다.
*/

// alignment 앞뒤로 더 무음 처리할 여유(초) — 단어 경계 타이밍 오차 흡수.
const MUTE_PAD_SEC = 0.03;
// gain 이 0↔1 로 바뀔 때 클릭음이 나지 않도록 짧게 램프한다(초).
const GAIN_RAMP_SEC = 0.008;
// 디코드된 버퍼 캐시 상한 — 문제당 한 문장이라 세션 내 수십 개면 충분하다.
const BUFFER_CACHE_MAX = 40;

const ttsVoiceFor = (lang) => {
  try {
    const tv = JSON.parse(localStorage.getItem('ttsVoices') || '{}');
    return tv && tv[lang] ? tv[lang] : '';
  } catch { return ''; }
};

// ── 1) resolve ────────────────────────────────────────────────────────────
// fetchDataAsync 는 GET 파라미터를 인코딩하지 않으므로(문장에 `&`, `#` 등이 있으면 깨짐)
// 여기서 직접 인코딩해 넘긴다. 반환: { url, alignment } | null (실패·비로그인 캐시 미스).
export const resolveTtsWithAlignment = async (text, lang) => {
  const t = (text ?? '').trim();
  if (!t || (lang !== 'en' && lang !== 'ko')) return null;
  try {
    const params = { text: encodeURIComponent(t), language: lang, timestamps: 1 };
    const v = ttsVoiceFor(lang);
    if (v) params.voice = encodeURIComponent(v);
    const data = await fetchDataAsync(`${backendUrl}/tts/resolve`, 'GET', params);
    if (!data || !data.url) return null;
    const alignment = Array.isArray(data.alignment) ? data.alignment : null;
    return { url: data.url, alignment };
  } catch {
    return null;
  }
};

// ── 2) 무음 구간 찾기 ──────────────────────────────────────────────────────
const stripTags = (s) => String(s ?? '').replace(/<[^>]*>/g, '');
// 소문자 + 문자/숫자만 남긴다(구두점·공백·따옴표·하이픈 제거). 한글도 \p{L} 에 포함.
const normalizeToken = (s) => stripTags(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/*
  alignment 토큰들을 정규화해 이어 붙인 문자열 위에서 목표 문자열을 찾고, 그 문자 범위를
  덮는 토큰 구간으로 되돌린다. 언어별 규칙:
  - 영어: 목표를 단어로 나눠, 토큰 시작 경계에서 시작하는 연속 매치만 인정한다.
          마지막 토큰은 "단어로 시작"하면 통과(adversary's ↔ adversary 처럼 소유격/접미).
          → 'art' 가 'start' 안에서 잡히는 오탐을 막는다.
  - 한국어: 어절이 목표를 "포함"하면 매치(책상을 ⊃ 책상). 목표가 두 어절에 걸치면 둘 다.
          어절 시작 경계 매치를 우선하고, 없으면 임의 위치 매치를 허용한다.
  못 찾으면 null. 찾으면 앞뒤 30ms 패딩을 더한 { start, end }.
*/
export const findMuteSpan = (alignment, blankFill, lang) => {
  if (!Array.isArray(alignment) || alignment.length === 0) return null;
  const target = normalizeToken(blankFill);
  if (!target) return null;

  // 토큰 정규화 + 이어 붙인 문자열의 시작 오프셋 기록
  const tokens = [];
  let joined = '';
  for (let i = 0; i < alignment.length; i += 1) {
    const a = alignment[i];
    const norm = normalizeToken(a?.text);
    const start = Number(a?.start);
    const end = Number(a?.end);
    if (!norm || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    tokens.push({ norm, start, end, offset: joined.length });
    joined += norm;
  }
  if (tokens.length === 0) return null;

  const tokenIndexAt = (charPos) => {
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      if (tokens[i].offset <= charPos) return i;
    }
    return 0;
  };
  const isTokenStart = (charPos) => tokens.some((tk) => tk.offset === charPos);

  let firstIdx = -1;
  let lastIdx = -1;

  if (lang === 'en') {
    const words = stripTags(blankFill).split(/\s+/).map(normalizeToken).filter(Boolean);
    if (words.length === 0) return null;
    for (let i = 0; i + words.length <= tokens.length && firstIdx < 0; i += 1) {
      let ok = true;
      for (let j = 0; j < words.length; j += 1) {
        const tk = tokens[i + j].norm;
        const w = words[j];
        const isLast = j === words.length - 1;
        if (!(tk === w || (isLast && tk.startsWith(w)))) { ok = false; break; }
      }
      if (ok) { firstIdx = i; lastIdx = i + words.length - 1; }
    }
    // 단어 단위로 못 맞추면(하이픈 분리 등) 이어 붙인 문자열에서 토큰 경계 시작 매치로 재시도
    if (firstIdx < 0) {
      let pos = joined.indexOf(target);
      while (pos >= 0 && !isTokenStart(pos)) pos = joined.indexOf(target, pos + 1);
      if (pos >= 0) {
        firstIdx = tokenIndexAt(pos);
        lastIdx = tokenIndexAt(pos + target.length - 1);
      }
    }
  } else {
    let pos = joined.indexOf(target);
    let boundaryPos = pos;
    while (boundaryPos >= 0 && !isTokenStart(boundaryPos)) boundaryPos = joined.indexOf(target, boundaryPos + 1);
    if (boundaryPos >= 0) pos = boundaryPos;
    if (pos >= 0) {
      firstIdx = tokenIndexAt(pos);
      lastIdx = tokenIndexAt(pos + target.length - 1);
    }
  }

  if (firstIdx < 0 || lastIdx < firstIdx) return null;
  const start = Math.max(0, tokens[firstIdx].start - MUTE_PAD_SEC);
  const end = Math.max(start, tokens[lastIdx].end + MUTE_PAD_SEC);
  return { start, end };
};

// ── 3) 재생 ───────────────────────────────────────────────────────────────
const bufferCache = new Map(); // url -> AudioBuffer
const bufferInflight = new Map(); // url -> Promise<AudioBuffer|null>

const decodeBuffer = (ctx, arrayBuffer) => new Promise((resolve, reject) => {
  // Safari 호환: Promise 를 돌려주지 않는 시그니처가 있어 콜백형으로도 받는다(audio.jsx 와 동일).
  try {
    const ret = ctx.decodeAudioData(arrayBuffer, resolve, reject);
    if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
  } catch (e) { reject(e); }
});

const loadBuffer = (ctx, url) => {
  if (bufferCache.has(url)) return Promise.resolve(bufferCache.get(url));
  if (bufferInflight.has(url)) return bufferInflight.get(url);
  const p = (async () => {
    try {
      // presigned URL — 인증 헤더/쿠키 불필요(붙이면 CORS 프리플라이트만 늘어난다)
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const ab = await resp.arrayBuffer();
      const buf = await decodeBuffer(ctx, ab);
      if (bufferCache.size >= BUFFER_CACHE_MAX) {
        bufferCache.delete(bufferCache.keys().next().value);
      }
      bufferCache.set(url, buf);
      return buf;
    } catch {
      return null;
    } finally {
      bufferInflight.delete(url);
    }
  })();
  bufferInflight.set(url, p);
  return p;
};

/*
  url 의 mp3 를 Web Audio 로 재생하되 span 구간(초)만 무음 처리한다.
  - 시작 전 stopCurrentSound() 로 공용 HTMLAudio 재생·이전 외부 재생을 끊고,
    자신의 stop 을 registerExternalSound 에 등록해 이후 getTextSound 가 이 재생을 끊을 수 있게 한다.
  - onMeta(duration초): 버퍼 길이 — TtsRipple 동기화용(getTextSound 의 onMeta 와 같은 시그니처).
  - onStart(): 실제 소리가 시작될 때. onEnd(): 자연 종료·정지·실패 모두에서 1회.
  - 반환: { stop() } — 재생을 못 시작하면(컨텍스트 없음/다운로드 실패) null.
  주의: AudioContext 는 iOS WebView 에서 user gesture 안의 resume() 이 있어야 소리가 난다.
  이 함수는 항상 탭 핸들러에서 시작되고 primeSfx 가 첫 제스처에서 unlock 해 두므로 대개 문제
  없지만, 만약 suspended 로 남아 있으면 무음으로 흘러가고 onEnd 는 watchdog 으로 정리된다.
*/
export const playWithMutedSpan = async (url, span, { onStart, onEnd, onMeta } = {}) => {
  if (!url) return null;
  // "한 번에 하나만" — 공용 HTMLAudio + 이전 Web Audio 재생 정지
  stopCurrentSound();

  const ctx = getSharedAudioContext();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    // 탭 컨텍스트 안에서 동기 호출되므로 await 없이 resume 만 건다(iOS 에서 await 시 매달릴 수 있음).
    ctx.resume().catch(() => { /* noop */ });
  }

  let ended = false;
  let watchdog = null;
  let unregister = null;
  let source = null;

  const finish = () => {
    if (ended) return;
    ended = true;
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
    if (unregister) { unregister(); unregister = null; }
    try { source?.disconnect(); } catch { /* noop */ }
    if (typeof onEnd === 'function') {
      try { onEnd(); } catch { /* 콜백 오류는 무시 */ }
    }
  };
  const stop = () => {
    try { source?.stop(); } catch { /* 이미 정지된 경우 */ }
    finish();
  };

  // 다운로드/디코드 중에 getTextSound 등 다른 재생이 시작되면 stopExternalSound 가 이 훅을
  // 부른다 → 소리를 내기 전에 취소한다(겹침 방지). 소리 시작 후에는 실제 stop 으로 바뀐다.
  unregister = registerExternalSound(stop);
  const buffer = await loadBuffer(ctx, url);
  if (ended) return null;
  if (!buffer) { finish(); return null; }

  try {
    source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    const g = gainNode.gain;
    const t0 = ctx.currentTime + 0.02;
    g.setValueAtTime(1, t0);
    if (span && Number.isFinite(span.start) && Number.isFinite(span.end) && span.end > span.start) {
      const s = Math.max(0, span.start);
      const e = Math.min(buffer.duration, span.end);
      if (s >= GAIN_RAMP_SEC) {
        g.setValueAtTime(1, t0 + s - GAIN_RAMP_SEC);
        g.linearRampToValueAtTime(0, t0 + s);
      } else {
        g.setValueAtTime(0, t0 + s);
      }
      g.setValueAtTime(0, t0 + e);
      g.linearRampToValueAtTime(1, t0 + e + GAIN_RAMP_SEC);
    }
    source.connect(gainNode).connect(ctx.destination);
    source.onended = finish;
    source.start(t0);
  } catch {
    finish();
    return null;
  }

  if (typeof onMeta === 'function') {
    try { onMeta(buffer.duration); } catch { /* noop */ }
  }
  if (typeof onStart === 'function') {
    try { onStart(); } catch { /* noop */ }
  }
  // onended 누락(일부 WebView) 대비 안전 타이머
  watchdog = setTimeout(finish, (buffer.duration + 0.5) * 1000);

  return { stop };
};
