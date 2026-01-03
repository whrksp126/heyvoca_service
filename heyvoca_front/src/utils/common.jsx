export const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const MAX_TEST_VOCABULARY_COUNT = 30;
export const MIN_TEST_VOCABULARY_COUNT = 4;

// SM-2 알고리즘 기준 학습 상태 정의
export const MEMORY_STATES = {
  ALL: 'all',                  // 전체 (모든 암기 상태)
  UNLEARNED: 'unlearned',      // 미학습 (repetition: 0, ef: 2.5)
  SHORT_TERM: 'shortTerm',     // 단기 복습 (암기율 0-29%)
  MEDIUM_TERM: 'mediumTerm',   // 중기 복습 (암기율 30-69%)
  LONG_TERM: 'longTerm'        // 장기 복습 (암기율 70-100%)
};

/**
 * 단어의 암기 상태를 판단하는 함수 (암기율 계산 방식)
 * @param {Object} word - 단어 객체
 * @param {number} word.repetition - 복습 성공 횟수
 * @param {number} word.interval - 복습 간격 (일 수)
 * @param {number} word.ef - 기억 용이도 (Ease Factor)
 * @param {Object} word.memoryState - 메모리 상태 객체 (있는 경우)
 * @returns {string} - 암기 상태 (unlearned, shortTerm, mediumTerm, longTerm)
 */
export function getWordMemoryState(word) {
  // memoryState 객체가 있는 경우 우선 사용
  const repetition = word.memoryState?.repetition ?? word.repetition ?? 0;
  const interval = word.memoryState?.interval ?? word.interval ?? 0;
  const ef = word.memoryState?.ef ?? word.ef ?? 2.5;
  
  // 미학습: repetition === 0 && interval === 0 (한 번도 학습하지 않은 단어만)
  if (repetition === 0 && interval === 0) return MEMORY_STATES.UNLEARNED;
  
  // 암기율 계산 (MemorizationStatus와 동일한 로직)
  let score = 0;
  score += repetition * 15;
  score += interval * 2;
  score += (ef - 1.3) * 20;
  const percent = Math.max(0, Math.min(100, Math.round(score)));
  
  // 퍼센트에 따라 분류
  if (percent < 30) {
    return MEMORY_STATES.SHORT_TERM;  // 단기 암기 (0-29%)
  } else if (percent < 70) {
    return MEMORY_STATES.MEDIUM_TERM; // 중기 암기 (30-69%)
  } else {
    return MEMORY_STATES.LONG_TERM;   // 장기 암기 (70-100%)
  }
}


console.log("import.meta.env",import.meta.env);

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
  if(window.ReactNativeWebView){
    window.ReactNativeWebView.postMessage(JSON.stringify({'type': 'setCookie', 'props': {name: name, value: value, expires: date.toUTCString()}}));
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

// URL에서 파라미터 값 가져오기
export const getValueFromURL = (param) => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
};

let currentTTSAudio = null;
let currentAudioUrl = null;
let currentRequestId = 0;

export const getTextSound = async (text, lang) => {
  // 즉시 기존 오디오 중단
  if (currentTTSAudio) {
    currentTTSAudio.pause();
    currentTTSAudio.currentTime = 0;
    currentTTSAudio.src = '';
    currentTTSAudio = null;
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
    text : text,
    language : lang
  }
  
  try {
    const audioBlob = await fetchDataAsync(url, method, fetchData, false, null);
    
    // 요청이 완료되었지만, 이미 새로운 요청이 와서 이 요청이 무효화된 경우
    if (requestId !== currentRequestId) {
      // 이전 요청이므로 종료 (blob은 자동으로 가비지 컬렉션됨)
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
    
    // Add ended event handler to cleanup
    audio.addEventListener('ended', () => {
      // 이 요청의 오디오가 끝났는지 확인
      if (currentTTSAudio === audio) {
        URL.revokeObjectURL(audioUrl);
        currentAudioUrl = null;
        currentTTSAudio = null;
      }
    });

    audio.play().catch(err => {
      console.error('오디오 재생 실패:', err);
      // 재생 실패 시 정리
      if (currentTTSAudio === audio) {
        URL.revokeObjectURL(audioUrl);
        currentAudioUrl = null;
        currentTTSAudio = null;
      }
    });
  } catch (error) {
    console.error('TTS 요청 실패:', error);
    // 요청 실패 시에도 이전 요청인지 확인
    if (requestId === currentRequestId) {
      currentTTSAudio = null;
      currentAudioUrl = null;
    }
  }
}

/**
 * 예정일 전 학습 횟수에 따른 ef 보너스 계산
 * @param {number} beforeScheduleCount - 예정일 전 학습 횟수
 * @returns {number} - ef 보너스 값
 */
const getBeforeScheduleEfBonus = (beforeScheduleCount) => {
  if (beforeScheduleCount === 0) return 0.1;   // 1회차: +0.1 (의미 있는 복습)
  if (beforeScheduleCount === 1) return 0.05;  // 2회차: +0.05 (여전히 도움)
  if (beforeScheduleCount === 2) return 0.02;  // 3회차: +0.02 (소폭 도움)
  return 0;  // 4회 이상: 0 (더 이상 효과 없음, 과도한 반복)
};

/**
 * SM-2 망각곡선 알고리즘
 * @param {Object} state - 단어의 기존 복습 상태
 * @param {number} state.ef - 기억 용이도 (Ease Factor), 기본 2.5
 * @param {number} state.repetition - 복습 성공 횟수
 * @param {number} state.interval - 이전 복습 간격 (일 수)
 * @param {string} state.nextReview - 다음 복습 예정일 (YYYY-MM-DD)
 * @param {string} state.lastStudyDate - 마지막 학습 날짜 (YYYY-MM-DD)
 * @param {number} state.beforeScheduleCount - 현재 주기 내 예정일 전 학습 횟수
 * @param {string} state.beforeScheduleLastDate - 마지막 예정일 전 학습 날짜
 * @param {number} q - 복습 평가 점수 (again: 0, hard: 3, good: 4, easy: 5)
 * @param {Object} options - 추가 옵션
 * @param {string} options.testType - 학습 모드 (test, exam, today)
 * @param {Date} options.today - 기준 날짜 (보통 new Date())
 * @returns {Object} - 갱신된 복습 상태
 */
export const updateSM2 = (state, q, options = {}) => {
  const MIN_EF = 1.3;
  const MAX_EF = 2.5;
  
  const { testType = 'test', today = new Date() } = options;

  let ef = state.ef ?? 2.5;
  let repetition = state.repetition ?? 0;
  let interval = state.interval ?? 0;
  const nextReview = state.nextReview;
  const lastStudyDate = state.lastStudyDate;
  let beforeScheduleCount = state.beforeScheduleCount ?? 0;

  // 오늘 날짜 (시간 제거)
  const todayStr = today.toISOString().split('T')[0];
  
  // 같은 날 중복 학습 체크
  if (lastStudyDate === todayStr) {
    if (q >= 3) {
      // 정답: ef만 소폭 상승 (+0.05), 나머지 유지
      console.log('[SM-2] 같은 날 중복 학습 - 정답: ef만 소폭 상승 (+0.05)');
      ef = Math.min(ef + 0.05, MAX_EF);
      
      return {
        ef: Number(ef.toFixed(2)),
        repetition,
        interval,
        nextReview: nextReview || todayStr, // 기존 nextReview 유지 (없으면 오늘)
        lastStudyDate: todayStr,
        beforeScheduleCount,
        updateType: 'duplicate' // 같은 날 중복 학습
      };
    } else {
      // 오답: 정상 망각곡선 오답 처리 (repetition, interval 리셋)
      console.log('[SM-2] 같은 날 중복 학습 - 오답: 정상 망각곡선 오답 처리 적용');
      repetition = 0;
      interval = 1;
      ef = Math.max(ef - 0.1, MIN_EF);
      
      return {
        ef: Number(ef.toFixed(2)),
        repetition,
        interval,
        nextReview: todayStr, // 틀렸을 때는 오늘로 설정 (바로 복습 가능)
        lastStudyDate: todayStr,
        beforeScheduleCount,
        updateType: 'duplicate' // 같은 날 중복 학습
      };
    }
  }

  // 예정일 전 학습인지 체크
  const isBeforeSchedule = nextReview && new Date(nextReview) > new Date(todayStr);
  
  // 예정일 전 학습인 경우 (모든 학습 모드에 적용)
  if (isBeforeSchedule) {
    if (q < 3) {
      // 틀렸을 때: 암기 상태 리셋하고 오늘 바로 복습할 수 있도록 설정
      console.log('[SM-2] 예정일 전 학습 - 오답: 암기 상태 리셋, 오늘 복습');
      repetition = 0;
      interval = 1;
      ef = Math.max(ef - 0.15, MIN_EF);
      
      return {
        ef: Number(ef.toFixed(2)),
        repetition,
        interval,
        nextReview: todayStr, // 틀렸을 때는 오늘로 설정 (바로 복습 가능)
        lastStudyDate: todayStr,
        beforeScheduleCount: 0, // 리셋
        updateType: 'normal' // 정상 업데이트 (틀렸으므로 리셋)
      };
    }
    
    // 정답인 경우: 예정일 전 학습 횟수에 따라 ef 조정
    const efBonus = getBeforeScheduleEfBonus(beforeScheduleCount);
    ef = Math.min(ef + efBonus, MAX_EF);
    beforeScheduleCount += 1;
    
    console.log(`[SM-2] 예정일 전 학습 ${beforeScheduleCount}회차 - 정답: ef +${efBonus} (repetition, interval, nextReview 유지)`);
    
    return {
      ef: Number(ef.toFixed(2)),
      repetition,
      interval,
      nextReview,
      lastStudyDate: todayStr,
      beforeScheduleCount,
      updateType: 'before_schedule' // 예정일 전 학습
    };
  }

  // 정상 SM-2 알고리즘 적용 (예정일 도래)
  console.log('[SM-2] 정상 SM-2 알고리즘 적용 (예정일 도래)');
  
  let nextReviewDate;
  
  if (q < 3) {
    // 복습 실패: 틀렸을 때는 오늘 바로 복습할 수 있도록 nextReview를 오늘로 설정
    console.log('[SM-2] 정상 SM-2 알고리즘 - 오답: ef 감소 (-0.15), repetition/interval 리셋');
    repetition = 0;
    interval = 1;
    ef = Math.max(ef - 0.15, MIN_EF);
    // 틀렸을 때는 오늘로 설정 (바로 복습 가능하도록)
    nextReviewDate = new Date(today);
  } else {
    // 복습 성공
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ef = Math.max(ef, MIN_EF);

    repetition += 1;

    if (repetition === 1) interval = 1;
    else if (repetition === 2) interval = 6;
    else interval = Math.round(interval * ef);
    
    // 정답일 때는 interval만큼 더한 날짜로 설정
    nextReviewDate = new Date(today);
    nextReviewDate.setDate(today.getDate() + interval);
  }

  return {
    ef: Number(ef.toFixed(2)),
    repetition,
    interval,
    nextReview: nextReviewDate.toISOString().split('T')[0],
    lastStudyDate: todayStr,
    beforeScheduleCount: 0, // 새로운 주기 시작으로 리셋
    updateType: 'normal' // 정상 업데이트
  };
}
// // 사용법
// // 단어 초기 상태
// const wordState = {
//   ef: 2.5,
//   repetition: 0,
//   interval: 0,
//   lastReview: new Date() // 오늘
// };

// // 사용자 평가: Easy → q = 5
// const updated = updateSM2(wordState, 5);

// console.log(updated);
// // {
// //   ef: 2.6,
// //   repetition: 1,
// //   interval: 1,
// //   next_review: '2025-03-28'
// // }

/**
 * 학습 패턴 분석 - 의심스러운 상황 감지
 * @param {Object} wordState - 단어의 현재 상태
 * @param {number} wordState.ef - 기억 용이도
 * @param {number} wordState.repetition - 연속 정답 횟수
 * @param {number} q - 사용자 평가 점수 (0-5)
 * @returns {Object} - 분석 결과
 */
export const analyzeLearningPattern = (wordState, q) => {
  const { ef, repetition } = wordState;
  console.log("ef", ef, "repetition", repetition, "q", q);

  // 의심스러운 패턴들
  const suspiciousPatterns = {

    // 실수로 틀렸을 가능성  
    suspiciousMistake: {
      condition: repetition >= 5 && q === 0,
      message: "정말 이 단어가 기억나지 않나요?", 
      icon: "WarningCircle",
      reason: "연속 5번 이상 정답인데 갑자기 완전히 잊어버렸다고 함",
      bgColor: "bg-[linear-gradient(180deg,rgba(230,255,244,0)_0%,rgba(230,255,244,.5)_10%,rgba(230,255,244,1)_30%,rgba(230,255,244,1)_100%)]",
      btn : [
        {
          type : "mistake",
          text: "실수에요, 알고 있어요",
          color: "bg-[#ccc]",

        },
        {
          type : "normal",
          text: "기억이 잘 안나요",
          color: "bg-[#F26A6A]",

        }
      ]
    },

    // 찍어서 맞췄을 가능성
    suspiciousGuess: {
      condition: ef <= 1.5 && q === 5,
      message: "정말 이 단어를 기억하나요?",
      icon: "HandsClapping",
      reason: "매우 어려운 단어(ef ≤ 1.5)인데 갑자기 완벽하게 기억한다고 함",
      
      bgColor: "bg-[linear-gradient(180deg,rgba(255,233,233,0)_0%,rgba(255,233,233,.5)_10%,rgba(255,233,233,1)_30%,rgba(255,233,233,1)_100%)]",
      btn : [
        {
          type : "mistake",
          text: "사실 몰랐어요",
          color: "bg-[#ccc]",
        },
        {
          type : "normal",
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
