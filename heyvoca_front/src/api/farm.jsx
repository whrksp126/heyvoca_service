import { backendUrl, fetchDataAsync } from '../utils/common';

/**
 * 당근 농장 V2 API.
 * fetchDataAsync 는 비-2xx 를 throw 하지 않고 response 를 그대로 돌려준다.
 * → 호출부는 반드시 `res?.code === 200` 을 확인한다.
 *
 * GET 파라미터는 값이 그대로 URL 에 붙으므로 null/undefined 는 빼고 보낸다.
 */
const queryParams = (params) => {
  const result = {};
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    result[key] = value;
  });
  return result;
};

// 농장 전체 요약 조회 (홈 히어로 — 그룹별 개수, 건강, 오늘 할 일, 아이템, 연속 학습일)
export const getFarmOverviewApi = async () => {
  const url = `${backendUrl}/farm/overview`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getFarmOverviewApi 오류:', error);
  }
};

// 그룹별 작물 목록 조회 (커서 페이지네이션)
export const getFarmPlantsApi = async ({ group, health, limit = 50, cursor } = {}) => {
  const url = `${backendUrl}/farm/plants`;
  const method = 'GET';
  const fetchData = queryParams({ group, health, limit, cursor });
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getFarmPlantsApi 오류:', error);
  }
};

// 홈 히어로 밭 배치 전용 — 서버가 이미 안정적으로 표본 추출(최대 96개, 미학습 제외)해
// 준다. 프론트에서 더 자르거나 다시 샘플링하지 않는다(2026-09-27 QA 3차 백엔드 안내).
export const getFarmHeroPlantsApi = async () => {
  const url = `${backendUrl}/farm/hero-plants`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getFarmHeroPlantsApi 오류:', error);
  }
};

// 홈 "오늘 할 일" 카드 — 썩은 단어/시듦/돌봄/새 씨앗/씨앗 구매 안내 + 1주 불꽃 달력.
export const getFarmTodayTasksApi = async () => {
  const url = `${backendUrl}/farm/today-tasks`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getFarmTodayTasksApi 오류:', error);
  }
};

// 홈 아래쪽 "지금 볼 만한 단어" 묶음 (care / rotten / seeds / recent 한 번에)
export const getFarmHomeFeedApi = async ({ limit = 5 } = {}) => {
  const url = `${backendUrl}/farm/home-feed`;
  const method = 'GET';
  const fetchData = queryParams({ limit });
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getFarmHomeFeedApi 오류:', error);
  }
};

// 썩은 작물 목록 조회 (다시 심기 / 회복제 선택용)
export const getRottenPlantsApi = async ({ limit = 50, cursor } = {}) => {
  const url = `${backendUrl}/farm/rotten`;
  const method = 'GET';
  const fetchData = queryParams({ limit, cursor });
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getRottenPlantsApi 오류:', error);
  }
};

// 다시 심기 예약 (삽 예약 → 진단 정답 시 확정 소비, 10초 취소 창)
export const replantApi = async (userVocaIds) => {
  const url = `${backendUrl}/farm/replant`;
  const method = 'POST';
  const fetchData = { user_voca_ids: userVocaIds };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('replantApi 오류:', error);
  }
};

// 다시 심기 예약 취소 (첫 진단 시작 전 10초 안에만 — 삽 반환)
export const cancelReplantApi = async (userVocaIds) => {
  const url = `${backendUrl}/farm/replant/cancel`;
  const method = 'POST';
  const fetchData = { user_voca_ids: userVocaIds };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('cancelReplantApi 오류:', error);
  }
};

// 영양 회복제 사용 (지금까지 키운 단계를 그대로 두고 되살리기)
export const recoverPlantsApi = async (userVocaIds) => {
  const url = `${backendUrl}/farm/recover`;
  const method = 'POST';
  const fetchData = { user_voca_ids: userVocaIds };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('recoverPlantsApi 오류:', error);
  }
};

// 보유 아이템 + 보석 조회
export const getFarmItemsApi = async () => {
  const url = `${backendUrl}/farm/items`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getFarmItemsApi 오류:', error);
  }
};

// 상점 상품(팩) 목록 조회
export const getFarmShopApi = async () => {
  const url = `${backendUrl}/farm/shop`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getFarmShopApi 오류:', error);
  }
};

// 상점 구매 (보석 차감 → 아이템 지급)
export const purchaseFarmItemApi = async ({ sku, qty = 1 }) => {
  const url = `${backendUrl}/farm/shop/purchase`;
  const method = 'POST';
  const fetchData = { sku, qty };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('purchaseFarmItemApi 오류:', error);
  }
};

// 연속 학습일 조회 (최근 35일 달력 포함)
export const getStreakApi = async () => {
  const url = `${backendUrl}/farm/streak`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getStreakApi 오류:', error);
  }
};

// 연속 학습일 복구 (48시간 안에 보호권 1개 사용) — 하위호환. 내부적으로 protect와 같은 로직.
export const recoverStreakApi = async () => {
  const url = `${backendUrl}/farm/streak/recover`;
  const method = 'POST';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('recoverStreakApi 오류:', error);
  }
};

// 멈춤(paused) 상태 지키기 — 부족분 구매 + 즉시 적용(원자적). body 없음(서버가 short 계산).
export const protectStreakApi = async () => {
  const url = `${backendUrl}/farm/streak/protect`;
  const method = 'POST';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('protectStreakApi 오류:', error);
  }
};

// 다시 잇기 도전 시작 (offered → active, start_day=오늘)
export const startEarnBackApi = async () => {
  const url = `${backendUrl}/farm/streak/earn-back/start`;
  const method = 'POST';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('startEarnBackApi 오류:', error);
  }
};

// 정산 알림을 봤음으로 표시 (같은 id는 한 번만 노출)
export const ackStreakNoticeApi = async (id) => {
  const url = `${backendUrl}/farm/streak/notice/ack`;
  const method = 'POST';
  const fetchData = { id };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('ackStreakNoticeApi 오류:', error);
  }
};

// 세션 종료 요약 조회 (심은 씨앗 / 자란 작물 / 되살린 작물 / 보상 / 연속 학습일)
export const getSessionFarmSummaryApi = async (sessionId) => {
  const url = `${backendUrl}/farm/session-summary`;
  const method = 'GET';
  const fetchData = queryParams({ session_id: sessionId });
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getSessionFarmSummaryApi 오류:', error);
  }
};

// 재출제(오답 후 다시 출제) 문제를 결국 정답으로 맞혔을 때 알림.
// /study/log 는 첫 시도만 보내(FSRS 원칙) 재출제 정답은 세션 로그에 안 남는다 —
// 이 호출로 그 단어를 "새로 심은 단어"로 반영하고 추천 대상(최근 틀림)에서 뺀다.
// fire-and-forget 호출부: 실패해도 학습 흐름에 영향 없어야 하며, 아래 catch가
// 콘솔 경고만 남기고 삼킨다(호출부에서 await 하지 않아도 안전).
export const retryCorrectApi = async ({ userVocaId, sessionId, questionType }) => {
  const url = `${backendUrl}/farm/retry-correct`;
  const method = 'POST';
  const fetchData = { user_voca_id: userVocaId, session_id: sessionId, question_type: questionType };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.warn('retryCorrectApi 오류:', error);
  }
};

// 전환 안내를 확인했다고 서버에 표시.
// 기기 저장소에만 남기면 기기를 바꿨을 때 이미 본 안내가 다시 뜬다.
export const markFarmMigrationSeenApi = async () => {
  const url = `${backendUrl}/farm/migration/seen`;
  try {
    return await fetchDataAsync(url, 'POST', {});
  } catch (error) {
    console.error('markFarmMigrationSeenApi 오류:', error);
  }
};
