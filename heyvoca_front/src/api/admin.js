// src/api/admin.js
// 어드민 전용 API 클라이언트 — 기존 fetchDataAsync와 분리된 독립 인스턴스
// X-Admin-Token 헤더를 수동으로 첨부하며, 사용자 인증 쿠키와는 무관하다.

const ADMIN_BASE = import.meta.env.VITE_BACKEND_URL;

/**
 * 어드민 엔드포인트 호출 공통 함수
 * @param {string} path   - 요청 경로 (예: '/admin/progress')
 * @param {string} token  - X-Admin-Token 헤더 값
 * @returns {Promise<any>} - 응답 JSON
 * @throws {{ message: string, status: number }}
 */
export async function fetchAdmin(path, token) {
  const res = await fetch(`${ADMIN_BASE}${path}`, {
    headers: { 'X-Admin-Token': token },
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.message || 'Admin API 호출 실패');
    err.status = res.status;
    throw err;
  }
  return json;
}

export const fetchProgress        = (token)              => fetchAdmin('/admin/progress', token);
export const fetchMetrics         = (token, days = 7)    => fetchAdmin(`/admin/study/metrics?days=${days}`, token);
export const fetchHealth          = (token)              => fetchAdmin('/admin/fsrs/health', token);
export const fetchRecentSessions  = (token, limit = 20)  => fetchAdmin(`/admin/study/recent-sessions?limit=${limit}`, token);

/**
 * ID/PW로 어드민 로그인. 성공 시 X-Admin-Token으로 사용할 토큰을 반환한다.
 * @param {{ username: string, password: string }} credentials
 * @returns {Promise<string>} token
 * @throws {{ message: string, status: number }}
 */
export async function loginAdmin({ username, password }) {
  const res = await fetch(`${ADMIN_BASE}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.message || '로그인 실패');
    err.status = res.status;
    throw err;
  }
  return json?.data?.token;
}
