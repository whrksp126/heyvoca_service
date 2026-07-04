// 게스트(비로그인) 온보딩 임시 저장 — localStorage 'heyvoca_guest_v1'
// 가입 시 /onboarding/migrate로 서버 이전 후 clear.

const KEY = 'heyvoca_guest_v1';

export function getGuest() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

export function setGuest(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ schema: 1, ...data }));
  } catch { /* 저장 실패 무시 */ }
}

export function patchGuest(patch) {
  const cur = getGuest() || {};
  setGuest({ ...cur, ...patch });
}

export function clearGuest() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* 무시 */ }
}

// 온보딩 맛보기를 마쳤고 아직 서버 이전 전인 게스트 데이터가 있으면 반환.
export function pendingGuestMigration() {
  const g = getGuest();
  if (g && Array.isArray(g.answers) && g.answers.length > 0) return g;
  return null;
}
