export const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const MAX_TEST_VOCABULARY_COUNT = 30;
export const MIN_TEST_VOCABULARY_COUNT = 4;

console.log(backendUrl);
// 비동기 fetch api
export async function fetchDataAsync(url, method, data, form=false){
  let newUrl = url;
  const headers = {
    // 'Authorization': `Bearer ${accessToken}`
  }
  if(!form){ headers['Content-Type'] = `application/json`}
  let fetchOptions = { method, headers};
  if(method !== 'GET' && form) {
    const formData = new FormData();
    formData.append('json_data', JSON.stringify(data.json_data)) 
    data.form_data.forEach(({key, value})=>{
      formData.append(key, value);
    })
    fetchOptions.body = formData
  }
  if(method !== 'GET' && !form){
    fetchOptions.body = JSON.stringify(data);
  }
  if(method == 'GET' || method == 'DELETE'){
    newUrl += `?`
    for (const key in data) {
      const value = data[key];
      newUrl += `${key}=${value}&`;
    }
    console.log(newUrl);
  }
  fetchOptions.credentials = 'include';
  try {
    const response = await fetch(newUrl, fetchOptions);
    const contentType = response.headers.get('Content-Type');
    if (response.ok) {
      if (contentType.includes('application/json')) {
        return await response.json();
      } else if (contentType.includes('text')) {
        return await response.text();
      } else if (contentType.includes('audio')) {
        return await response.blob();
      } else {
        throw new Error(`Unsupported content type: ${contentType}`);
      }
    } else {
      throw new Error('문제가 발생했습니다.');
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

export const getTextSound = async (text, lang) => {
  // Stop and cleanup current audio if playing
  if (currentTTSAudio) {
    currentTTSAudio.pause();
    currentTTSAudio.src = ''; // Clear source
    currentTTSAudio = null;
  }

  // Revoke previous blob URL to prevent memory leak
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }

  const url = `${backendUrl}/tts/output`;
  const method = 'GET';
  const fetchData = {
    text : text,
    language : lang
  }
  const audioBlob = await fetchDataAsync(url, method, fetchData);
  const audioUrl = URL.createObjectURL(audioBlob);
  currentAudioUrl = audioUrl;
  
  const audio = new Audio(audioUrl);
  currentTTSAudio = audio;
  
  // Add ended event handler to cleanup
  audio.addEventListener('ended', () => {
    URL.revokeObjectURL(audioUrl);
    currentAudioUrl = null;
    currentTTSAudio = null;
  });

  audio.play();
}

/**
 * SM-2 망각곡선 알고리즘
 * @param {Object} state - 단어의 기존 복습 상태
 * @param {number} state.ef - 기억 용이도 (Ease Factor), 기본 2.5
 * @param {number} state.repetition - 복습 성공 횟수
 * @param {number} state.interval - 이전 복습 간격 (일 수)
 * @param {number} q - 복습 평가 점수 (again: 0, hard: 3, good: 4, easy: 5) // 3:easy, 7:good, 12:hard
 * @param {Date} today - 기준 날짜 (보통 new Date())
 * @returns {Object} - 갱신된 복습 상태
 */
export const updateSM2 = (state, q, today = new Date()) => {
  const MIN_EF = 1.3;

  let ef = state.ef ?? 2.5;
  let repetition = state.repetition ?? 0;
  let interval = state.interval ?? 0;

  if (q < 3) {
    // 복습 실패
    repetition = 0;
    interval = 1;
  } else {
    // 복습 성공
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    ef = Math.max(ef, MIN_EF);

    repetition += 1;

    if (repetition === 1) interval = 1;
    else if (repetition === 2) interval = 6;
    else interval = Math.round(interval * ef);
  }

  const nextReviewDate = new Date(today);
  nextReviewDate.setDate(today.getDate() + interval);

  return {
    ef: Number(ef.toFixed(2)),
    repetition,
    interval,
    nextReview: nextReviewDate.toISOString().split('T')[0]
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
