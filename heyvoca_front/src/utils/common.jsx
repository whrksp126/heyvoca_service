export const backendUrl = import.meta.env.VITE_BACKEND_URL;
export const nodeEnv = import.meta.env.VITE_ENV;
export const MAX_TEST_VOCABULARY_COUNT = 1000;
export const MIN_TEST_VOCABULARY_COUNT = 4;

export const stripHtmlTags = (html) => {
  if (html == null) return '';
  if (typeof html !== 'string') return String(html);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

// FSRS 기반 학습 상태 정의 (stability 임계값 기준)
export const MEMORY_STATES = {
  ALL: 'all',                  // 전체 (모든 암기 상태)
  UNLEARNED: 'unlearned',      // 미학습 (repetition: 0, ef: 2.5)
  OVERDUE: 'overdue',          // 복습 지연 (nextReview < 오늘)
  SHORT_TERM: 'shortTerm',     // 단기 복습 (간격 10일 미만)
  MEDIUM_TERM: 'mediumTerm',   // 중기 복습 (간격 10일 이상 60일 미만)
  LONG_TERM: 'longTerm'        // 장기 복습 (간격 60일 이상)
};

/**
 * 단어가 복습 지연 상태인지 판별 (next_review < 오늘)
 * @param {Object} word
 * @returns {boolean}
 */
export function isWordOverdue(word) {
  const next = word?.fsrs?.next_review;
  if (!next) return false;
  const d = new Date(next);
  d.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/**
 * 단어의 암기 상태를 판단하는 함수 (FSRS 기반)
 * @param {Object} word - 단어 객체
 * @returns {string} - 암기 상태 (unlearned, shortTerm, mediumTerm, longTerm)
 */
export function getWordMemoryState(word) {
  const fsrs = word?.fsrs;
  if (!fsrs || fsrs.state === 'new' || !fsrs.state) return MEMORY_STATES.UNLEARNED;
  const stability = fsrs.stability ?? 0;
  if (stability < 10) return MEMORY_STATES.SHORT_TERM;
  if (stability < 60) return MEMORY_STATES.MEDIUM_TERM;
  return MEMORY_STATES.LONG_TERM;
}

// 쿠키 조회
export function getCookie(name) {
  const cookieString = document.cookie;
  const cookies = cookieString.split("; ");
  for (const cookie of cookies) {
    const [key, value] = cookie.split("=");
    if (key === name) return value;
  }
  return null;
}

// 쿠키 설정
export function setCookie(name, value, days = 365) {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "expires=" + date.toUTCString();
  document.cookie = name + "=" + value + "; " + expires + "; path=/";
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ 'type': 'setCookie', 'props': { name: name, value: value, expires: date.toUTCString() } }));
  }

}

// URL에서 마지막 경로 값을 가져오는 함수
export function getLastPathFromURL() {
  const path = window.location.pathname;
  let lastPath = path.substring(path.lastIndexOf('/') + 1);
  if (lastPath.endsWith('.html')) {
    lastPath = lastPath.substring(0, lastPath.lastIndexOf('.'));
  }
  return lastPath;
}

// Access Token 갱신 함수
export async function refreshAccessToken() {
  try {
    const response = await fetch(`${backendUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // refresh token 쿠키 포함
    });

    if (response.ok) {
      const data = await response.json();
      setCookie('userAccessToken', data.access_token);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return false;
  }
}

// 비동기 fetch api
export async function fetchDataAsync(url, method, data, form = false) {
  const accessToken = getCookie("userAccessToken");

  let newUrl = url;
  const headers = {
    'Authorization': `Bearer ${accessToken}`
  }
  if (!form) { headers['Content-Type'] = `application/json` }
  const fetchOptions = { method, headers };

  if (method !== 'GET' && form) {
    const formData = new FormData();
    formData.append('json_data', JSON.stringify(data.json_data))
    data.form_data.forEach(({ key, value }) => {
      formData.append(key, value);
    })
    fetchOptions.body = formData
  }
  if (method !== 'GET' && !form) {
    fetchOptions.body = JSON.stringify(data);
  }
  if (method == 'GET' || method == 'DELETE') {
    newUrl += `?`
    for (const key in data) {
      const value = data[key];
      newUrl += `${key}=${value}&`;
    }
  }
  fetchOptions.credentials = 'include';

  try {
    const response = await fetch(newUrl, fetchOptions);
    if (response.ok) {
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      } else if (contentType.includes('image/') || contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
        return await response.blob();
      } else if (contentType.includes('text/')) {
        return await response.text();
      } else {
        throw new Error('지원하지 않는 데이터 형식입니다.');
      }
    } else if (response.status === 401) {
      console.log("Access Token 만료: 갱신 시도");
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return await fetchDataAsync(url, method, data, form) // 새 Access Token으로 재요청
      } else {
        return null;
      }
    } else {
      return response;
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * Date 객체를 로컬 날짜 문자열(YYYY-MM-DD)로 변환
 * @param {Date} date 
 * @returns {string}
 */
export const toLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// URL에서 파라미터 값 가져오기
export const getValueFromURL = (param) => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
};

// 브라우저 autoplay 정책: 첫 user gesture로 unlock된 같은 Audio element만 후속 재생이 허용된다.
// 매번 new Audio()를 만들면 setTimeout/await 체인을 거친 후속 호출에서 NotAllowedError가 발생하므로,
// 모듈 레벨에서 하나의 인스턴스를 재사용한다.
let sharedAudio = null;
let currentRequestId = 0;
let currentAudioResolve = null; // 현재 재생 중인 오디오의 Promise resolve
let currentCleanup = null; // 현재 등록된 ended/error 리스너 제거 핸들

// 첫 user gesture에서 sharedAudio를 unlock하기 위한 무음 클립.
// 캐시 미스(uncached) 단어는 resolveTtsUrl await 이후에 play()가 호출되는데, 그 사이
// gesture activation이 만료되어 "첫 클릭 무음, 둘째 클릭부터 재생" 버그가 있었다.
// 클릭 동기 컨텍스트에서 무음을 한 번 play()해 element를 활성화하면 이후 async play()도 허용된다.
const SILENT_AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
// unlock "성공"(무음 재생 resolve) 시에만 true. 실패하면 다음 gesture에서 다시 시도한다.
// (과거엔 시도 즉시 true로 막아, 자동재생 흐름이 먼저 실패하면 이후 탭에서도 영영 unlock 못 했다.)
let audioUnlocked = false;

// 반드시 클릭 등 user gesture의 동기 호출 스택에서 호출되어야 한다.
// 자동재생(집중 반복 학습 등 gesture 밖 play)이 iOS WebView autoplay 정책에 막혀 무음+즉시 스킵되는
// 문제를, 앱 사용 중 발생한 gesture에서 element를 미리 unlock해 해결한다.
const primeAudioWithinGesture = () => {
  if (!sharedAudio) sharedAudio = new Audio();
  if (audioUnlocked) return;
  // 현재 실제 음성이 재생 중이면 unlock을 미룬다(무음 src로 덮어써 재생을 끊지 않도록).
  if (!sharedAudio.paused && sharedAudio.src && !sharedAudio.src.startsWith('data:')) return;
  // 최초 1회만 무음 재생으로 unlock한다(성공 여부와 무관하게 이후 재시도하지 않음).
  // 매 제스처마다 무음 HTMLAudio를 재생하면, 정답 탭 순간 재생되는 효과음(Web Audio)과
  // iOS 오디오 세션에서 충돌해 효과음 꼬리가 잘리는 문제가 있어 반드시 1회로 제한한다.
  // (첫 unlock은 학습 진입 전 네비게이션 탭에서 일어나므로 자동재생 시점엔 이미 unlock 상태)
  audioUnlocked = true;
  try {
    sharedAudio.src = SILENT_AUDIO;
    const p = sharedAudio.play();
    if (p && typeof p.catch === 'function') p.catch(() => { /* 무음 재생 reject 무시 */ });
  } catch (e) { /* noop */ }
};

// 앱 전역: 실제 user gesture에서 오디오를 미리 unlock한다(자동재생 대비).
// unlock에 성공할 때까지 리스너를 유지하다가, 성공하면 스스로 제거한다.
if (typeof window !== 'undefined') {
  const _tryUnlockAudio = () => {
    primeAudioWithinGesture();
    if (audioUnlocked) {
      window.removeEventListener('pointerdown', _tryUnlockAudio, true);
      window.removeEventListener('touchend', _tryUnlockAudio, true);
      window.removeEventListener('mousedown', _tryUnlockAudio, true);
      window.removeEventListener('keydown', _tryUnlockAudio, true);
    }
  };
  window.addEventListener('pointerdown', _tryUnlockAudio, true);
  window.addEventListener('touchend', _tryUnlockAudio, true);
  window.addEventListener('mousedown', _tryUnlockAudio, true);
  window.addEventListener('keydown', _tryUnlockAudio, true);
}

// ── 클라이언트 TTS 오디오 prefetch 캐시 ─────────────────────────────────
// presigned URL이 가리키는 mp3를 미리 받아 objectURL로 들고 있다가, 클릭 시
// 네트워크 왕복 없이 즉시 재생한다(클릭=즉시). objectstore가 CORS를 허용하므로
// fetch→blob 가능. 실패 시 prefetch는 null을 반환하고 getTextSound가 직접 재생으로 폴백.
const ttsBlobCache = new Map();   // key -> objectURL
const ttsInflight = new Map();    // key -> Promise<string|null>
const TTS_BLOB_CACHE_MAX = 500;

const ttsVoiceFor = (lang) => {
  try {
    const tv = JSON.parse(localStorage.getItem('ttsVoices') || '{}');
    return tv && tv[lang] ? tv[lang] : '';
  } catch (e) { return ''; }
};

const ttsCacheKey = (text, lang) => `${lang}::${ttsVoiceFor(lang)}::${text}`;

// 백엔드 /tts/resolve만 호출해 presigned mp3 URL을 받는다(다운로드/blob 없음 → 빠름).
// 캐시 miss(비로그인 등)나 실패 시 null. <audio>에 직접 물려 progressive 재생하는 용도.
export const resolveTtsUrl = async (text, lang) => {
  const t = (text ?? '').trim();
  if (!t || (lang !== 'en' && lang !== 'ko')) return null;
  try {
    const fetchData = { text: t, language: lang };
    const v = ttsVoiceFor(lang);
    if (v) fetchData.voice = v;
    const data = await fetchDataAsync(`${backendUrl}/tts/resolve`, 'GET', fetchData);
    return (data && data.url) || null;
  } catch (e) {
    return null;
  }
};

// 단일 텍스트의 mp3를 미리 받아 objectURL 캐시에 저장. 반환: objectURL | null
export const prefetchTextSound = (text, lang) => {
  const t = (text ?? '').trim();
  if (!t || (lang !== 'en' && lang !== 'ko')) return Promise.resolve(null);
  const key = ttsCacheKey(t, lang);
  if (ttsBlobCache.has(key)) return Promise.resolve(ttsBlobCache.get(key));
  if (ttsInflight.has(key)) return ttsInflight.get(key);

  const p = (async () => {
    try {
      const url = await resolveTtsUrl(t, lang);
      if (!url) return null;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      // 간단 FIFO 상한 관리
      if (ttsBlobCache.size >= TTS_BLOB_CACHE_MAX) {
        const firstKey = ttsBlobCache.keys().next().value;
        const oldUrl = ttsBlobCache.get(firstKey);
        ttsBlobCache.delete(firstKey);
        try { URL.revokeObjectURL(oldUrl); } catch (e) { /* noop */ }
      }
      ttsBlobCache.set(key, objectUrl);
      return objectUrl;
    } catch (e) {
      return null; // 실패 시 폴백(직접 재생)에 맡김
    } finally {
      ttsInflight.delete(key);
    }
  })();
  ttsInflight.set(key, p);
  return p;
};

// 목록을 동시성 제한으로 prefetch. 학습/테스트/결과 진입 시 백그라운드 호출.
// onProgress(done, total): 항목 하나가 prefetch될 때마다 진행률 콜백(선택) — 준비 화면 프로그래스바용.
export const prefetchTtsList = async (items, concurrency = 4, onProgress = null) => {
  if (!Array.isArray(items) || items.length === 0) return;
  const seen = new Set();
  const queue = [];
  for (const it of items) {
    const t = (it?.text ?? '').trim();
    const lang = it?.language;
    if (!t || (lang !== 'en' && lang !== 'ko')) continue;
    const k = `${lang}::${t}`;
    if (seen.has(k)) continue;
    seen.add(k);
    queue.push({ text: t, lang });
  }
  const total = queue.length;
  if (total === 0) return;
  let done = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < queue.length) {
      const cur = queue[idx++];
      await prefetchTextSound(cur.text, cur.lang);
      done += 1;
      if (typeof onProgress === 'function') {
        try { onProgress(done, total); } catch (e) { /* 콜백 오류는 무시 */ }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, worker)
  );
};

// 백엔드 /tts/resolve가 objectstore presigned URL을 JSON으로 반환 → 직접 재생.
// 클라이언트 blob 캐시에 있으면 네트워크 없이 즉시 재생, 없으면 받아서(생성 포함) 재생.
// 캐시 미스(비로그인 등)면 url이 없으므로 조용히 종료한다.
// onMeta: 오디오 메타데이터 로드 시 실제 재생 길이(초)를 전달하는 콜백(선택).
//         ripple 등 시각 효과를 실제 재생 시간에 동기화하는 데 사용한다.
export const getTextSound = async (text, lang, onMeta) => {
  // 오디오 unlock은 전역 gesture 리스너(_tryUnlockAudio)가 실제 첫 탭에서 처리한다.
  // 여기서(대개 gesture 밖에서 호출됨) prime하면 one-shot unlock을 헛되이 소모해
  // 자동재생이 영영 무음이 되므로, 여기서는 prime을 호출하지 않는다.

  // 이전 재생의 cleanup을 먼저 호출하여 리스너 제거 + resolve.
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  if (sharedAudio && !sharedAudio.paused) {
    sharedAudio.pause();
    sharedAudio.currentTime = 0;
  }
  if (currentAudioResolve) {
    currentAudioResolve();
    currentAudioResolve = null;
  }

  // 새로운 요청 ID 생성 (이전 요청과 구분하기 위해)
  const requestId = ++currentRequestId;

  try {
    // 1) 클라이언트 blob 캐시 동기 조회 → 있으면 네트워크 없이 즉시 재생
    const key = ttsCacheKey(text, lang);
    let audioUrl = ttsBlobCache.get(key) || null;

    // 2) blob 캐시 miss → mp3 blob을 받아 objectURL로 재생.
    //    presigned URL을 <audio>에 직접 물리면 응답 Content-Type에 따라 NotSupportedError가
    //    날 수 있으므로(캐시 미스 첫 클릭 무음 원인), blob을 받아 재생한다(느리지만 확실).
    //    prefetchTextSound가 resolve→fetch→objectURL 후 캐시까지 채운다(inflight 재사용).
    if (!audioUrl) {
      audioUrl = await prefetchTextSound(text, lang);
      // 받아오는 사이 더 새 요청이 왔으면 무효화
      if (requestId !== currentRequestId) {
        return;
      }
    }

    if (!audioUrl) {
      // 캐시 미스(비로그인) 또는 resolve/다운로드 실패 — 음성 없이 조용히 종료
      return;
    }

    if (!sharedAudio) sharedAudio = new Audio();
    sharedAudio.src = audioUrl;

    // 오디오 재생 완료까지 기다리는 Promise 반환
    return new Promise((resolve) => {
      currentAudioResolve = resolve;

      let watchdog = null;

      const cleanup = () => {
        sharedAudio.removeEventListener('ended', cleanup);
        sharedAudio.removeEventListener('error', cleanup);
        sharedAudio.removeEventListener('loadedmetadata', scheduleWatchdog);
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        if (currentCleanup === cleanup) currentCleanup = null;
        if (currentAudioResolve === resolve) {
          currentAudioResolve = null;
        }
        resolve();
      };

      // 'ended' 이벤트가 일부 환경(WebView/짧은 mp3)에서 누락될 수 있어,
      // 재생 길이 기반 안전 타이머로 반드시 종료 처리한다.
      const scheduleWatchdog = () => {
        const dur = sharedAudio.duration;
        if (Number.isFinite(dur) && dur > 0) {
          if (typeof onMeta === 'function') {
            try { onMeta(dur); } catch { /* 콜백 오류는 재생에 영향 주지 않음 */ }
          }
          if (watchdog) clearTimeout(watchdog);
          watchdog = setTimeout(cleanup, (dur + 0.4) * 1000);
        }
      };

      currentCleanup = cleanup;

      sharedAudio.addEventListener('ended', cleanup);
      sharedAudio.addEventListener('error', cleanup);
      sharedAudio.addEventListener('loadedmetadata', scheduleWatchdog);
      scheduleWatchdog(); // 메타데이터가 이미 로드된 경우 대비

      sharedAudio.play().catch(err => {
        console.error('오디오 재생 실패:', err);
        cleanup();
      });
    });
  } catch (error) {
    console.error('TTS 요청 실패:', error);
  }
}

export const stopCurrentSound = () => {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  if (sharedAudio && !sharedAudio.paused) {
    sharedAudio.pause();
    sharedAudio.currentTime = 0;
  }
  if (currentAudioResolve) {
    currentAudioResolve();
    currentAudioResolve = null;
  }
  currentRequestId++;
};

// 효과음 재생 함수
export const playButtonSound = (audioUrl) => {
  const audio = new Audio(audioUrl); // 효과음 파일 경로
  audio.volume = 0.5; // 볼륨 설정
  audio.play().catch(err => console.log('효과음 재생 실패:', err));
};
