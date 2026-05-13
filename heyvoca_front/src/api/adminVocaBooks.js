// src/api/adminVocaBooks.js
// 관리자 단어장(AdminVocaBook) 관리 전용 API 클라이언트.
// admin.js와 동일한 X-Admin-Token 헤더 인증을 사용한다.

const ADMIN_BASE = import.meta.env.VITE_BACKEND_URL;

async function adminFetch(path, token, { method = 'GET', body } = {}) {
  const headers = { 'X-Admin-Token': token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${ADMIN_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.message || 'Admin API 호출 실패');
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

function buildQuery(params) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.append(k, String(v));
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const listVocaBooks = (token, { page = 1, pageSize = 20, source = 'all', q = '', sort = 'updated_at' } = {}) =>
  adminFetch(`/admin/voca-books${buildQuery({ page, page_size: pageSize, source, q, sort })}`, token);

export const getVocaBook = (token, id) =>
  adminFetch(`/admin/voca-books/${id}`, token);

export const patchVocaBook = (token, id, patch) =>
  adminFetch(`/admin/voca-books/${id}`, token, { method: 'PATCH', body: patch });

export const patchWord = (token, bookId, mapId, patch) =>
  adminFetch(`/admin/voca-books/${bookId}/words/${mapId}`, token, { method: 'PATCH', body: patch });

export const addWord = (token, bookId, payload, { force = false } = {}) =>
  adminFetch(`/admin/voca-books/${bookId}/words${force ? '?force=true' : ''}`, token, { method: 'POST', body: payload });

export const deleteWord = (token, bookId, mapId) =>
  adminFetch(`/admin/voca-books/${bookId}/words/${mapId}`, token, { method: 'DELETE' });

export const toggleBookstore = (token, bookId, payload = {}) =>
  adminFetch(`/admin/voca-books/${bookId}/bookstore/toggle`, token, { method: 'POST', body: payload });

export const patchBookstore = (token, bookId, patch) =>
  adminFetch(`/admin/voca-books/${bookId}/bookstore`, token, { method: 'PATCH', body: patch });

export const searchVoca = (token, q, limit = 20) =>
  adminFetch(`/admin/voca-books/_search-voca${buildQuery({ q, limit })}`, token);

export const getVocaDictionary = (token, vocaId) =>
  adminFetch(`/admin/voca-books/_voca/${vocaId}/dictionary`, token);
