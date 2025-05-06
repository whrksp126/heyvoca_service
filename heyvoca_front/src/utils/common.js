export const backendUrl = import.meta.env.VITE_BACKEND_URL;
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


/**
 * SM-2 망각곡선 알고리즘
 * @param {Object} state - 단어의 기존 복습 상태
 * @param {number} state.ef - 기억 용이도 (Ease Factor), 기본 2.5
 * @param {number} state.repetition - 복습 성공 횟수
 * @param {number} state.interval - 이전 복습 간격 (일 수)
 * @param {number} q - 복습 평가 점수 (again: 0, hard: 3, good: 4, easy: 5)
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
    next_review: nextReviewDate.toISOString().split('T')[0]
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