// 세션 요약(/farm/session-summary) 선조회 — 학습 완료 컷(약 1.1초) 동안 미리 받아 두면
// 결과 화면이 열린 뒤 기다리는 시간이 줄어든다. GET 이라 중복 호출해도 안전하다.
// TakeTest 가 prefetch, StudyResult 가 fetch(있으면 선조회분을 한 번만 소비, 없으면 직접 호출).
import { getSessionFarmSummaryApi } from '../api/farm';

const TTL_MS = 30000;
const cache = new Map();

export const prefetchSessionFarmSummary = (sessionId) => {
  if (!sessionId || cache.has(sessionId)) return;
  cache.set(sessionId, { at: Date.now(), promise: getSessionFarmSummaryApi(sessionId) });
};

export const fetchSessionFarmSummary = (sessionId) => {
  const hit = cache.get(sessionId);
  cache.delete(sessionId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  return getSessionFarmSummaryApi(sessionId);
};
