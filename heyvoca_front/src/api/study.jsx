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

// ─── 학습 세션 / 로그 API ───────────────────────────────────────────────────

// 한 문제 결과 기록
// POST /study/log
export const logStudyQuestion = async (payload) => {
  const url = `${backendUrl}/study/log`;
  const method = 'POST';
  const result = await fetchDataAsync(url, method, payload);
  return result;
};

// 오늘(KST) 처음 학습한 새 단어 수(누적) 조회
// GET /study/today-summary → { code:200, data:{ new_words } }
export const getTodaySummary = async () => {
  const url = `${backendUrl}/study/today-summary`;
  try {
    return await fetchDataAsync(url, 'GET', {});
  } catch (error) {
    console.error('getTodaySummary 오류:', error);
  }
};

// 정답/오답별 복습 예정일 미리 계산 (채점 시 즉시·고정 표시용)
// POST /study/predict-reviews
// 응답: { code:200, data: { "<user_voca_id>": { correct:{...}, wrong:{...} } } }
export const predictReviews = async (userVocaIds) => {
  if (!Array.isArray(userVocaIds) || userVocaIds.length === 0) return null;
  const url = `${backendUrl}/study/predict-reviews`;
  const items = userVocaIds.map(id => ({ user_voca_id: id }));
  return await fetchDataAsync(url, 'POST', { items });
};

// 학습 세션 종료
// POST /study/sessions/<session_id>/finish
export const finishStudySession = async (sessionId) => {
  const url = `${backendUrl}/study/sessions/${sessionId}/finish`;
  const method = 'POST';
  const result = await fetchDataAsync(url, method, {});
  return result;
};

// 복습 일정 및 분포 조회
// GET /study/review-schedule
// 응답: { code:200, data: { distribution, due, total, today, days } }
// days: [{ date:"YYYY-MM-DD", count:n, words:[{ user_voca_id, word, meaning }] }]
export const getReviewScheduleApi = async () => {
  const url = `${backendUrl}/study/review-schedule`;
  try {
    return await fetchDataAsync(url, 'GET', {});
  } catch (error) {
    console.error('getReviewScheduleApi 오류:', error);
  }
};

// ─── 온보딩 API ─────────────────────────────────────────────────────────────

// 게스트 맛보기 5문제 (비인증)
export const getTrialWordsApi = async () => {
  const url = `${backendUrl}/onboarding/trial-words`;
  try {
    return await fetchDataAsync(url, 'GET', {});
  } catch (error) {
    console.error('getTrialWordsApi 오류:', error);
  }
};

// 가입 직후 맛본 기록 이전 (인증)
export const migrateOnboardingApi = async ({ source_channel, learning_goal, username, answers }) => {
  const url = `${backendUrl}/onboarding/migrate`;
  try {
    return await fetchDataAsync(url, 'POST', { source_channel, learning_goal, username, answers });
  } catch (error) {
    console.error('migrateOnboardingApi 오류:', error);
  }
};

// 기능 해금 상태 (인증)
export const getUnlockStatusApi = async () => {
  const url = `${backendUrl}/onboarding/unlock-status`;
  try {
    return await fetchDataAsync(url, 'GET', {});
  } catch (error) {
    console.error('getUnlockStatusApi 오류:', error);
  }
};

// ─── 암기 인사이트 API ──────────────────────────────────────────────────────

// 단어별 기억 인사이트 (단어 상세 '나의 기억' 섹션)
// GET /insights/word/<user_voca_id>
// 응답: { code:200, data:{ memory, recent_results, streak, next_stage, timeline, total_count } }
export const getWordInsightsApi = async (userVocaId) => {
  const url = `${backendUrl}/insights/word/${userVocaId}`;
  try {
    return await fetchDataAsync(url, 'GET', {});
  } catch (error) {
    console.error('getWordInsightsApi 오류:', error);
  }
};

// 오늘의 기억 변화 (홈 위젯)
// GET /insights/today-changes
// 응답: { code:200, data:{ promoted, new, counts:{ promoted, new, by_state } } }
export const getTodayMemoryChangesApi = async () => {
  const url = `${backendUrl}/insights/today-changes`;
  try {
    return await fetchDataAsync(url, 'GET', {});
  } catch (error) {
    console.error('getTodayMemoryChangesApi 오류:', error);
  }
};

// ─── 추천 API ───────────────────────────────────────────────────────────────
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