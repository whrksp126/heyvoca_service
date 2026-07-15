import successSound from '../assets/sounds/success.mp3';
import errorSound from '../assets/sounds/error.mp3';

// 브라우저(특히 iOS WKWebView) autoplay 정책: 매번 new Audio()를 생성하면 파일을
// 새로 로드해야 해서 재생 지연/무음이 발생한다(../utils/common.jsx의 sharedAudio와
// 동일한 문제). 효과음도 모듈 레벨에서 element를 1개씩만 만들어 재사용한다.
let successAudio = null;
let errorAudio = null;

const getSuccessAudio = () => {
  if (!successAudio) {
    successAudio = new Audio(successSound);
    successAudio.preload = 'auto';
    successAudio.volume = 0.5;
  }
  return successAudio;
};

const getErrorAudio = () => {
  if (!errorAudio) {
    errorAudio = new Audio(errorSound);
    errorAudio.preload = 'auto';
    errorAudio.volume = 0.5;
  }
  return errorAudio;
};

// 첫 user gesture에서 효과음 element를 unlock하기 위한 무음 클립 (common.jsx의
// SILENT_AUDIO/primeAudioWithinGesture와 동일한 패턴).
const SILENT_AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
let sfxPrimed = false;

// 반드시 클릭 등 user gesture의 동기 호출 스택에서 호출되어야 한다(await/setTimeout 이후 호출 시 unlock 실패).
// 이미 prime됐으면 no-op. common.jsx의 primeAudioWithinGesture와 동일하게, 여기서는
// element의 src를 무음 클립으로 바꿔 play()만 걸어두고 즉시 원복하지 않는다 —
// 실제 효과음 재생 시(playSuccessSound/playErrorSound) src를 다시 지정하면서 재생한다.
export const primeSfx = () => {
  if (sfxPrimed) return;
  sfxPrimed = true;

  [getSuccessAudio(), getErrorAudio()].forEach((audio) => {
    try {
      audio.src = SILENT_AUDIO;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* 무음 재생 reject 무시 */ });
    } catch (e) { /* noop */ }
  });
};

/**
 * 정답 시 효과음 재생
 */
export const playSuccessSound = () => {
  const audio = getSuccessAudio();
  audio.src = successSound;
  audio.currentTime = 0;
  audio.play().catch(e => console.error("Error playing success sound:", e));
};

/**
 * 오답 시 효과음 재생
 */
export const playErrorSound = () => {
  const audio = getErrorAudio();
  audio.src = errorSound;
  audio.currentTime = 0;
  audio.play().catch(e => console.error("Error playing error sound:", e));
};
