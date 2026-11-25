import { backendUrl, fetchDataAsync } from '../utils/common';

/**
 * 당근 농장 V2 API.
 * fetchDataAsync 는 비-2xx 를 throw 하지 않고 **Response 객체를 그대로** 돌려준다.
 * 그대로 넘기면 호출부의 `res?.message` 가 늘 비어 서버 사유('영양 회복제가 부족해요' 등)가
 * 사라지고 '잠시 뒤 다시 시도해 주세요'만 뜬다(2026-11-19 QA). 그래서 이 파일의 모든 호출은
 * `call()` 을 거쳐 항상 `{ code, message, data? }` 모양으로 돌려준다.
 * → 호출부는 `res?.code === 200` 을 확인하고, 실패면 `res.message` 를 그대로 보여 주면 된다.
 *
 * GET 파라미터는 값이 그대로 URL 에 붙으므로 null/undefined 는 빼고 보낸다.
 */
const NETWORK_MESSAGE = '연결이 잠시 끊겼어요. 잠시 뒤 다시 시도해 주세요.';
const SESSION_MESSAGE = '로그인이 만료됐어요. 다시 로그인해 주세요.';
// 조회(GET)는 이 시간 안에 응답이 없으면 실패로 돌려준다 — 화면이 '불러오는 중'에서 멈추지 않게.
// 쓰기(POST)는 서버가 이미 처리했을 수 있어 자르지 않는다(실패로 보이고 실제론 반영되는 일을 막는다).
const REQUEST_TIMEOUT_MS = 20000;

const withTimeout = (promise) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS);
  promise.then(
    (v) => { clearTimeout(timer); resolve(v); },
    (e) => { clearTimeout(timer); reject(e); },
  );
});

/** fetchDataAsync 결과를 `{ code, message, data? }` 로 맞춘다(실패해도 throw 하지 않는다). */
export const call = async (url, method, fetchData, label) => {
  let res;
  try {
    const pending = fetchDataAsync(url, method, fetchData);
    res = await (method === 'GET' ? withTimeout(pending) : pending);
  } catch (error) {
    console.error(`${label} 오류:`, error);
    return { code: 0, message: NETWORK_MESSAGE };
  }
  // 401 → 토큰 갱신까지 실패
  if (res === null || res === undefined) return { code: 401, message: SESSION_MESSAGE };
  // 비-2xx — 서버 본문의 message 를 살린다
  if (typeof Response !== 'undefined' && res instanceof Response) {
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return {
      ...(body && typeof body === 'object' ? body : {}),
      code: body?.code ?? res.status,
      message: body?.message || body?.msg || NETWORK_MESSAGE,
    };
  }
  return res;
};

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
  return call(url, method, fetchData, 'getFarmOverviewApi');
};

// 그룹별 작물 목록 조회 (커서 페이지네이션)
export const getFarmPlantsApi = async ({ group, health, limit = 50, cursor } = {}) => {
  const url = `${backendUrl}/farm/plants`;
  const method = 'GET';
  const fetchData = queryParams({ group, health, limit, cursor });
  return call(url, method, fetchData, 'getFarmPlantsApi');
};

// 홈 히어로 밭 배치 전용 — 서버가 이미 안정적으로 표본 추출(최대 96개, 미학습 제외)해
// 준다. 프론트에서 더 자르거나 다시 샘플링하지 않는다(2026-09-27 QA 3차 백엔드 안내).
export const getFarmHeroPlantsApi = async () => {
  const url = `${backendUrl}/farm/hero-plants`;
  const method = 'GET';
  const fetchData = {};
  return call(url, method, fetchData, 'getFarmHeroPlantsApi');
};

// 홈 "오늘 할 일" 카드 — 썩은 단어/시듦/돌봄/새 씨앗/씨앗 구매 안내 + 1주 불꽃 달력.
export const getFarmTodayTasksApi = async () => {
  const url = `${backendUrl}/farm/today-tasks`;
  const method = 'GET';
  const fetchData = {};
  return call(url, method, fetchData, 'getFarmTodayTasksApi');
};

// 홈 아래쪽 "지금 볼 만한 단어" 묶음 (care / rotten / seeds / recent 한 번에)
export const getFarmHomeFeedApi = async ({ limit = 5 } = {}) => {
  const url = `${backendUrl}/farm/home-feed`;
  const method = 'GET';
  const fetchData = queryParams({ limit });
  return call(url, method, fetchData, 'getFarmHomeFeedApi');
};

// 썩은 작물 목록 조회 (다시 심기 / 회복제 선택용)
export const getRottenPlantsApi = async ({ limit = 50, cursor } = {}) => {
  const url = `${backendUrl}/farm/rotten`;
  const method = 'GET';
  const fetchData = queryParams({ limit, cursor });
  return call(url, method, fetchData, 'getRottenPlantsApi');
};

// 다시 심기 예약 (삽 예약 → 진단 정답 시 확정 소비, 10초 취소 창)
export const replantApi = async (userVocaIds) => {
  const url = `${backendUrl}/farm/replant`;
  const method = 'POST';
  const fetchData = { user_voca_ids: userVocaIds };
  return call(url, method, fetchData, 'replantApi');
};

// 다시 심기 예약 취소 (첫 진단 시작 전 10초 안에만 — 삽 반환)
export const cancelReplantApi = async (userVocaIds) => {
  const url = `${backendUrl}/farm/replant/cancel`;
  const method = 'POST';
  const fetchData = { user_voca_ids: userVocaIds };
  return call(url, method, fetchData, 'cancelReplantApi');
};

// 영양 회복제 사용 (지금까지 키운 단계를 그대로 두고 되살리기)
export const recoverPlantsApi = async (userVocaIds) => {
  const url = `${backendUrl}/farm/recover`;
  const method = 'POST';
  const fetchData = { user_voca_ids: userVocaIds };
  return call(url, method, fetchData, 'recoverPlantsApi');
};

// 보유 아이템 + 보석 조회
export const getFarmItemsApi = async () => {
  const url = `${backendUrl}/farm/items`;
  const method = 'GET';
  const fetchData = {};
  return call(url, method, fetchData, 'getFarmItemsApi');
};

// 상점 상품(팩) 목록 조회
export const getFarmShopApi = async () => {
  const url = `${backendUrl}/farm/shop`;
  const method = 'GET';
  const fetchData = {};
  return call(url, method, fetchData, 'getFarmShopApi');
};

// 상점 구매 (보석 차감 → 아이템 지급)
export const purchaseFarmItemApi = async ({ sku, qty = 1 }) => {
  const url = `${backendUrl}/farm/shop/purchase`;
  const method = 'POST';
  const fetchData = { sku, qty };
  return call(url, method, fetchData, 'purchaseFarmItemApi');
};

// 연속 학습일 조회 (최근 35일 달력 포함)
export const getStreakApi = async () => {
  const url = `${backendUrl}/farm/streak`;
  const method = 'GET';
  const fetchData = {};
  return call(url, method, fetchData, 'getStreakApi');
};

// 연속 학습일 복구 (48시간 안에 보호권 1개 사용) — 하위호환. 내부적으로 protect와 같은 로직.
export const recoverStreakApi = async () => {
  const url = `${backendUrl}/farm/streak/recover`;
  const method = 'POST';
  const fetchData = {};
  return call(url, method, fetchData, 'recoverStreakApi');
};

// 멈춤(paused) 상태 지키기 — 부족분 구매 + 즉시 적용(원자적). body 없음(서버가 short 계산).
export const protectStreakApi = async () => {
  const url = `${backendUrl}/farm/streak/protect`;
  const method = 'POST';
  const fetchData = {};
  return call(url, method, fetchData, 'protectStreakApi');
};

// 다시 잇기 도전 시작 (offered → active, start_day=오늘)
export const startEarnBackApi = async () => {
  const url = `${backendUrl}/farm/streak/earn-back/start`;
  const method = 'POST';
  const fetchData = {};
  return call(url, method, fetchData, 'startEarnBackApi');
};

// 정산 알림을 봤음으로 표시 (같은 id는 한 번만 노출)
export const ackStreakNoticeApi = async (id) => {
  const url = `${backendUrl}/farm/streak/notice/ack`;
  const method = 'POST';
  const fetchData = { id };
  return call(url, method, fetchData, 'ackStreakNoticeApi');
};

// 세션 종료 요약 조회 (심은 씨앗 / 자란 작물 / 되살린 작물 / 보상 / 연속 학습일)
export const getSessionFarmSummaryApi = async (sessionId) => {
  const url = `${backendUrl}/farm/session-summary`;
  const method = 'GET';
  const fetchData = queryParams({ session_id: sessionId });
  return call(url, method, fetchData, 'getSessionFarmSummaryApi');
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
