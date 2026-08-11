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

// 연속 학습일 복구 (48시간 안에 보호권 1개 사용)
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
