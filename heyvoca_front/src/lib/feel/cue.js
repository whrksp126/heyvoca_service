// src/lib/feel/cue.js
//
// 손맛 단일 진입점 — `feel(cue, opts)` 한 번으로 그 큐의 소리 + 진동을 **같은 순간**에 발사한다.
//
// 【타이밍 동기화 방식】 (이 파일이 시스템의 핵심. 숫자는 전부 아래 FEEL_TIMING 한 곳)
//   소리: AudioContext 에서 `currentTime + 리드`에 시작하도록 "예약"한다(즉시 재생 X). 오디오
//         스레드가 샘플 단위로 정확히 그 시각에 시작하므로 JS 타이머 지터가 없다.
//   진동: 소리가 **스피커에서 실제로 나는 순간**에 모터가 울려야 하므로 네이티브에
//         delayMs = 리드 + 오디오 출력 지연(ctx.outputLatency ?? baseLatency ?? 플랫폼 기본값)
//                 − 브릿지 지연 추정 + 플랫폼 보정 + 사용자 오프셋
//         을 실어 보낸다(네이티브가 그만큼 뒤에 시작하도록 예약).
//   시각: 호출부가 feel() 을 부르는 **같은 이벤트 핸들러 틱**에서 setState 한다(지연된 effect 에서
//         소리만 따로 내지 않는다). 렌더 한두 프레임(≈16~33ms)이 리드(25ms)와 비슷해 "눌림 프레임"이
//         소리 시작과 맞는다. 애니메이션 임팩트 프레임은 호출부가 키프레임 시간으로 맞춘다.
//
//   delay 가 음수(진동이 소리보다 먼저 가야 하는 보정)면 진동을 앞당길 수 없으므로 반대로 **소리를
//   그만큼 늦춘다**(둘의 상대 간격 유지가 목적). 상한 100ms.
//
// 【실기기 튜닝】 숫자(브릿지 지연·플랫폼 보정·기본 출력 지연)는 전부 **추정치**다. 실기기에서
//   '손맛 테스트'(마이페이지 > 설정 > 실험실)로 엇박을 맞춘 뒤 PLATFORM_OFFSET_MS 상수에 반영한다.
//   그 전까지는 localStorage `feel.hapticOffsetMs`(ms, 정수)로 기기마다 덮어쓸 수 있다.
import { getAudioCtx, primeSfx, playSuccessSound, playErrorSound } from '../../utils/audio';
import { getDevicePlatform } from '../../utils/osFunction';
import { playSfx, SFX_DURATION_MS, SFX_BUSY_MS } from './sfx';
import { hapticPattern, supportsHapticPattern } from './haptics';

export const FEEL_TIMING = {
  // 오디오 예약 리드(ms) — 이 시간 뒤에 소리가 시작한다. 렌더 1~2프레임 정도.
  LEAD_MS: 25,
  // postMessage → 네이티브 핸들러 → 모터 구동까지의 지연 추정(ms). 이만큼 일찍 보낸 효과.
  BRIDGE_MS: { ios: 10, android: 18, web: 0 },
  // 플랫폼별 보정(ms). +면 진동을 늦춤, −면 일찍(모터 기동 지연이 큰 기기). 실기기 튜닝 대상.
  PLATFORM_OFFSET_MS: { ios: 0, android: -10, web: 0 },
  // ctx.outputLatency / baseLatency 를 못 얻을 때(Safari 는 outputLatency 미지원) 쓰는 기본값(ms).
  DEFAULT_OUTPUT_LATENCY_MS: { ios: 20, android: 40, web: 20 },
  // 소리를 늦춰서라도 맞출 수 있는 최대치(ms)
  MAX_AUDIO_SHIFT_MS: 100,
};

const OFFSET_KEY = 'feel.hapticOffsetMs';
let offsetCache = null;

export function getHapticOffsetMs() {
  if (offsetCache !== null) return offsetCache;
  let v = 0;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(OFFSET_KEY) : null;
    const parsed = raw === null ? 0 : parseInt(raw, 10);
    v = Number.isFinite(parsed) ? parsed : 0;
  } catch (e) { v = 0; }
  offsetCache = v;
  return v;
}

export function setHapticOffsetMs(ms) {
  const v = Math.max(-100, Math.min(200, Math.round(Number(ms) || 0)));
  offsetCache = v;
  try { localStorage.setItem(OFFSET_KEY, String(v)); } catch (e) { /* noop */ }
  return v;
}

const platformKey = () => {
  const p = getDevicePlatform();
  if (p === 'android') return 'android';
  if (p === 'ios' || p === 'app') return 'ios';
  return 'web';
};

/** 현재 오디오 출력 지연(ms)과 출처 — 튜닝 화면에서도 쓴다. */
export function measureOutputLatency() {
  const key = platformKey();
  const fallback = FEEL_TIMING.DEFAULT_OUTPUT_LATENCY_MS[key];
  const ctx = getAudioCtx();
  if (!ctx) return { ms: fallback, source: 'default(no ctx)' };
  const out = Number(ctx.outputLatency);
  if (Number.isFinite(out) && out > 0.001) return { ms: out * 1000, source: 'outputLatency' };
  const base = Number(ctx.baseLatency);
  // baseLatency 는 내부 버퍼만 뜻해 실제 출력 지연보다 작다 — 너무 작으면 기본값 사용
  if (Number.isFinite(base) && base * 1000 >= 10) return { ms: base * 1000, source: 'baseLatency' };
  return { ms: fallback, source: 'default' };
}

/** 진동 지연 계산에 쓰이는 현재 값 묶음(튜닝 화면 표시용) */
export function getFeelTimingSnapshot() {
  const key = platformKey();
  const lat = measureOutputLatency();
  return {
    platform: key,
    leadMs: FEEL_TIMING.LEAD_MS,
    outputLatencyMs: lat.ms,
    outputLatencySource: lat.source,
    bridgeMs: FEEL_TIMING.BRIDGE_MS[key],
    platformOffsetMs: FEEL_TIMING.PLATFORM_OFFSET_MS[key],
    userOffsetMs: getHapticOffsetMs(),
    patternSupported: supportsHapticPattern(),
  };
}

// 연타 디바운스(같은 큐). 선택·톡은 짧게, 채점류는 중복 발사만 막는다.
const DEBOUNCE_MS = {
  tap: 35, select: 60, correct: 150, wrong: 150, match: 60, combo: 150,
  perfect: 300, progress: 150, bonus: 300, complete: 300,
};
// 겹치면 뒤로 미룬다(소리가 겹쳐 시끄러워지는 축하류). 미룬 만큼 진동도 같이 밀린다.
const QUEUEABLE = new Set(['combo', 'perfect', 'bonus', 'complete']);
const MAX_QUEUE_SHIFT_MS = 400;

const lastAt = {};
let busyUntil = 0; // performance.now 기준, 마지막으로 예약된 큐 소리가 끝나는 시각

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * 소리 + 진동을 같은 순간에 발사한다.
 * @param {'tap'|'select'|'correct'|'wrong'|'match'|'combo'|'perfect'|'progress'|'bonus'|'complete'} cue
 * @param {{n?:number, events?:object[], sound?:boolean, vibe?:boolean, force?:boolean}} opts
 *   n = 콤보 수(combo 전용). 손맛 테스트 편집기용: events = 임시 진동 패턴, sound/vibe = false 로 끔, force = 디바운스·겹침 대기 무시, debounceMs = 이 큐의 디바운스 구간 덮어쓰기(카드 맞추기 연속 짝용)
 * @returns {{fired:boolean, startInMs:number}} startInMs = 호출 시점부터 소리(=진동)가 시작되기까지.
 *   호출부가 애니메이션 임팩트를 이 값만큼 지연시키고 싶을 때 쓴다(0 이상).
 */
export function feel(cue, opts = {}) {
  const none = { fired: false, startInMs: 0 };
  if (!(cue in SFX_DURATION_MS)) return none;
  if (typeof document !== 'undefined' && document.hidden) return none;

  const t = nowMs();
  if (!opts.force && t - (lastAt[cue] || -1e9) < (opts.debounceMs ?? DEBOUNCE_MS[cue] ?? 60)) return none;

  // 진행바 반짝임은 정답 큐와 겹치면 소리·진동을 생략한다(시각만 호출부가 처리).
  if (!opts.force && cue === 'progress' && t - (lastAt.correct || -1e9) < 350) return none;

  lastAt[cue] = t;
  const key = platformKey();
  const ctx = getAudioCtx();

  // 시작 지연: 리드 + (겹침 대기)
  let queueShift = 0;
  if (!opts.force && QUEUEABLE.has(cue) && busyUntil > t) {
    queueShift = Math.min(busyUntil - t, MAX_QUEUE_SHIFT_MS);
  }

  const outLatency = measureOutputLatency().ms;
  const hapticDelayRaw = FEEL_TIMING.LEAD_MS + outLatency
    - FEEL_TIMING.BRIDGE_MS[key]
    + FEEL_TIMING.PLATFORM_OFFSET_MS[key]
    + getHapticOffsetMs();
  // 음수면 진동은 0 에서 시작하고 소리를 그만큼 늦춰 상대 간격을 유지한다.
  const audioShift = Math.min(Math.max(0, -hapticDelayRaw), FEEL_TIMING.MAX_AUDIO_SHIFT_MS);
  const hapticDelay = Math.max(0, hapticDelayRaw + audioShift) + queueShift;
  const audioLead = FEEL_TIMING.LEAD_MS + audioShift + queueShift;

  let soundOk = false;
  if (opts.sound === false) {
    soundOk = true; // 소리 끔 — 폴백 mp3 도 울리지 않는다
  } else if (ctx) {
    soundOk = playSfx(cue, { when: ctx.currentTime + audioLead / 1000, n: opts.n });
  }
  if (!soundOk) {
    // Web Audio 를 못 쓰면 기존 mp3 폴백(정답/오답만) — 타이밍 보정 없이 즉시.
    if (cue === 'correct') playSuccessSound();
    else if (cue === 'wrong') playErrorSound();
  }

  if (opts.vibe !== false) hapticPattern(cue, { delayMs: hapticDelay, n: opts.n, events: opts.events, force: opts.force });

  busyUntil = t + audioLead + SFX_BUSY_MS[cue]; // 감쇠 꼬리 제외, 체감상 끝나는 지점
  return { fired: true, startInMs: audioLead };
}

// 첫 사용자 제스처에서 AudioContext 를 unlock 한다(primeSfx 는 gesture 의 동기 스택에서만 유효).
// 학습 진입 지점들이 이미 부르지만, 다른 경로(딥링크·재진입)로 문제 화면에 들어와도 첫 탭에서 보장.
if (typeof window !== 'undefined') {
  const unlock = () => { try { primeSfx(); } catch (e) { /* noop */ } };
  ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => {
    window.addEventListener(ev, unlock, { once: true, capture: true, passive: true });
  });
}
