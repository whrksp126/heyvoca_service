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

let currentTTSAudio = null;
let currentAudioUrl = null;
let currentRequestId = 0;
let currentAudioResolve = null; // 현재 재생 중인 오디오의 Promise resolve

export const getTextSound = async (text, lang) => {
  // 즉시 기존 오디오 중단 + 이전 Promise resolve (대기 중인 호출 해제)
  if (currentTTSAudio) {
    currentTTSAudio.pause();
    currentTTSAudio.currentTime = 0;
    currentTTSAudio.src = '';
    currentTTSAudio = null;
  }
  if (currentAudioResolve) {
    currentAudioResolve();
    currentAudioResolve = null;
  }

  // 이전 blob URL 정리
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }

  // 새로운 요청 ID 생성 (이전 요청과 구분하기 위해)
  const requestId = ++currentRequestId;

  const url = `${backendUrl}/tts/output`;
  const method = 'GET';
  const fetchData = {
    text: text,
    language: lang
  }

  try {
    const audioBlob = await fetchDataAsync(url, method, fetchData, false, null);

    // 요청이 완료되었지만, 이미 새로운 요청이 와서 이 요청이 무효화된 경우
    if (requestId !== currentRequestId) {
      return;
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    currentAudioUrl = audioUrl;

    const audio = new Audio(audioUrl);

    // 재생 전에 다시 한 번 확인 (새로운 요청이 왔는지)
    if (requestId !== currentRequestId) {
      URL.revokeObjectURL(audioUrl);
      return;
    }

    currentTTSAudio = audio;

    // 오디오 재생 완료까지 기다리는 Promise 반환
    return new Promise((resolve) => {
      currentAudioResolve = resolve;

      const cleanup = () => {
        if (currentTTSAudio === audio) {
          URL.revokeObjectURL(audioUrl);
          currentAudioUrl = null;
          currentTTSAudio = null;
        }
        if (currentAudioResolve === resolve) {
          currentAudioResolve = null;
        }
        resolve();
      };

      audio.addEventListener('ended', cleanup);
      audio.addEventListener('error', cleanup);

      audio.play().catch(err => {
        console.error('오디오 재생 실패:', err);
        cleanup();
      });
    });
  } catch (error) {
    console.error('TTS 요청 실패:', error);
    if (requestId === currentRequestId) {
      currentTTSAudio = null;
      currentAudioUrl = null;
    }
  }
}

export const stopCurrentSound = () => {
  if (currentTTSAudio) {
    currentTTSAudio.pause();
    currentTTSAudio.currentTime = 0;
    currentTTSAudio.src = '';
    currentTTSAudio = null;
  }
  if (currentAudioResolve) {
    currentAudioResolve();
    currentAudioResolve = null;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
  currentRequestId++;
};

/**
 * 학습 패턴 분석 - 의심스러운 상황 감지 (FSRS 기반)
 * @param {Object} wordState - 단어의 현재 상태 (fsrs 필드 포함)
 * @param {number} q - 사용자 평가 점수 (0-5, UX 분기용)
 * @returns {Object} - 분석 결과
 */
export const analyzeLearningPattern = (wordState, q) => {
  const difficulty = wordState?.fsrs?.difficulty ?? 5;
  const reps = wordState?.fsrs?.reps ?? 0;
  console.log("difficulty", difficulty, "reps", reps, "q", q);

  // 의심스러운 패턴들
  const suspiciousPatterns = {

    // 실수로 틀렸을 가능성
    suspiciousMistake: {
      condition: reps >= 5 && q === 0,
      message: "정말 이 단어가 기억나지 않나요?",
      icon: "WarningCircle",
      reason: "연속 5번 이상 정답인데 갑자기 완전히 잊어버렸다고 함",
      bgColor: "bg-[linear-gradient(180deg,rgba(230,255,244,0)_0%,rgba(230,255,244,.5)_10%,rgba(230,255,244,1)_30%,rgba(230,255,244,1)_100%)]",
      btn: [
        {
          type: "mistake",
          text: "실수에요, 알고 있어요",
          color: "bg-layout-gray-200",

        },
        {
          type: "normal",
          text: "기억이 잘 안나요",
          color: "bg-[#F26A6A]",

        }
      ]
    },

    // 찍어서 맞췄을 가능성
    suspiciousGuess: {
      condition: difficulty >= 8 && q === 5,
      message: "정말 이 단어를 기억하나요?",
      icon: "HandsClapping",
      reason: "매우 어려운 단어(ef ≤ 1.5)인데 갑자기 완벽하게 기억한다고 함",

      bgColor: "bg-[linear-gradient(180deg,rgba(255,233,233,0)_0%,rgba(255,233,233,.5)_10%,rgba(255,233,233,1)_30%,rgba(255,233,233,1)_100%)]",
      btn: [
        {
          type: "mistake",
          text: "사실 몰랐어요",
          color: "bg-layout-gray-200",
        },
        {
          type: "normal",
          text: "당연히 알고 있어요",
          color: "bg-[#39E859]",
        }
      ]
    }
  };

  // 의심스러운 패턴 찾기
  const detectedPatterns = Object.values(suspiciousPatterns).filter(
    pattern => pattern.condition
  );

  if (detectedPatterns.length > 0) {
    // 가장 의심도가 높은 패턴 반환
    const mostSuspicious = detectedPatterns.reduce((prev, current) => {
      // ef가 낮을수록, repetition이 높을수록 더 의심스러움
      const prevScore = (1.5 - prev.condition.ef) + (prev.condition.repetition || 0);
      const currentScore = (1.5 - current.condition.ef) + (current.condition.repetition || 0);
      return currentScore > prevScore ? current : prev;
    });

    return {
      isSuspicious: true,
      message: mostSuspicious.message,
      reason: mostSuspicious.reason,
      btn: mostSuspicious.btn,
      bgColor: mostSuspicious.bgColor,
      icon: mostSuspicious.icon,
      confidence: "high"
    };
  }

  return {
    isSuspicious: false,
    message: "특이사항 없음",
    reason: "정상적인 학습 패턴",
    confidence: "normal"
  };
};


// 효과음 재생 함수
export const playButtonSound = (audioUrl) => {
  const audio = new Audio(audioUrl); // 효과음 파일 경로
  audio.volume = 0.5; // 볼륨 설정
  audio.play().catch(err => console.log('효과음 재생 실패:', err));
};
