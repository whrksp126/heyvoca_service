import { backendUrl, fetchDataAsync } from '../utils/common';

// 사용자 출석 체크 API
export const setUserCheckinApi = async () => {
  const url = `${backendUrl}/mainpage/checkin`;
  const method = 'GET';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('getUserCheckinApi 오류:', error);
  }
}

// 사용자 학습 기록 달력 조회 API
export const getUserDatesApi = async () => {
  const url = `${backendUrl}/mainpage/user_dates`;
  const method = 'GET';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  } catch (error) {
    console.error('getUserDatesApi 오류:', error);
  }
}

// 사용자 업적 조회 API
export const getUserGoalsApi = async () => {
  const url = `${backendUrl}/mainpage/user_goals`;
  const method = 'GET';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  } catch (error) {
    console.error('getUserGoalsApi 오류:', error);
  }
}



// 사용자 학습 기록 업데이트 API
export const updateUserStudyHistoryApi = async ({ correct_cnt, incorrect_cnt }) => {
  const url = `${backendUrl}/mainpage/user_study_history`;
  const method = 'POST';
  const fetchData = {
    'correct_cnt': correct_cnt,
    'incorrect_cnt': incorrect_cnt
  }
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  } catch (error) {
    console.error('updateUserStudyHistoryApi 오류:', error);
  }
}

// 사용자 최근 학습 데이터 조회 API
export const getUserRecentStudyDataApi = async () => {
  const url = `${backendUrl}/mainpage/user_recent_study_data`;
  const method = 'GET';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  } catch (error) {
    console.error('getUserRecentStudyDataApi 오류:', error);
  }
}

// 사용자 최근 학습 데이터 업데이트 API
export const updateUserRecentStudyDataApi = async ({ curRecentStudy }) => {
  const url = `${backendUrl}/mainpage/user_recent_study_create_update`;
  const method = 'POST';
  const fetchData = {
    ...curRecentStudy,
  };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  } catch (error) {
    console.error('updateUserRecentStudyDataApi 오류:', error);
  }
}

// 사용자 월별 학습 기록 달력 조회 API
export const getUserDatesMonthlyApi = async (year, month) => {
  const url = `${backendUrl}/mainpage/user_dates_monthly`;
  const method = 'GET';
  const fetchData = { year, month };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('getUserDatesMonthlyApi 오류:', error);
  }
};

// 사용자 최초 출석일 조회 API (출석체크 캘린더 이전 월 이동 제한용)
export const getUserFirstCheckinApi = async () => {
  const url = `${backendUrl}/mainpage/user_first_checkin`;
  const method = 'GET';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('getUserFirstCheckinApi 오류:', error);
  }
};

// 업적 달성 기준 조회 API
export const getAchievementCriteriaApi = async () => {
  const url = `${backendUrl}/mainpage/achievement_criteria`;
  const method = 'GET';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('getAchievementCriteriaApi 오류:', error);
  }
};

// ─── Phase 1.2 섀도잉 API ──────────────────────────────────────────────────
// 활성화: .env.local 에 VITE_FSRS_SHADOW=true 추가
// 비활성화(기본): VITE_FSRS_SHADOW 없거나 false

// 학습 세션 시작 (Phase 1.2 섀도잉)
// POST /study/sessions → { session_id }
export const createStudySession = async ({ testType, bookIds }) => {
  const url = `${backendUrl}/study/sessions`;
  const method = 'POST';
  const fetchData = {
    test_type: testType,
    book_ids: bookIds,
  };
  const result = await fetchDataAsync(url, method, fetchData);
  return result;
};

// 한 문제 결과 기록 (Phase 1.2 섀도잉)
// POST /study/log
export const logStudyQuestion = async (payload) => {
  const url = `${backendUrl}/study/log`;
  const method = 'POST';
  const result = await fetchDataAsync(url, method, payload);
  return result;
};

// 학습 세션 종료 (Phase 1.2 섀도잉)
// POST /study/sessions/<session_id>/finish
export const finishStudySession = async (sessionId) => {
  const url = `${backendUrl}/study/sessions/${sessionId}/finish`;
  const method = 'POST';
  const result = await fetchDataAsync(url, method, {});
  return result;
};

// ─── Phase 1.3 추천 API ───────────────────────────────────────────────────────
// GET /study/recommend — 단어 추천 (세션 구성 + session_id 동시 반환)
// 응답: { code: 200, data: { session_id, composition, items } }
export const getStudyRecommend = async ({
  type = 'daily',
  count = 20,
  bookIds = null,
  targetStates = null,
  selection = 'recommended',
}) => {
  const url = `${backendUrl}/study/recommend`;
  const params = {};

  params.type = type;
  params.count = count;

  // bookIds: 배열 → 콤마 구분 문자열. null → 'all' (생략 시 백엔드 default)
  if (Array.isArray(bookIds) && bookIds.length > 0) {
    params.book_ids = bookIds.join(',');
  } else {
    params.book_ids = 'all';
  }

  // targetStates: 배열 또는 문자열 → 콤마 구분 문자열
  if (targetStates) {
    const states = Array.isArray(targetStates) ? targetStates : [targetStates];
    params.target_states = states.join(',');
  }

  params.selection = selection;

  const result = await fetchDataAsync(url, 'GET', params);
  return result;
};