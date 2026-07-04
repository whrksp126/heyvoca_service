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

// 온보딩(레벨 선택 이상)을 진행했고 아직 서버 이전 전인 게스트 데이터가 있으면 반환.
// 맛보기를 건너뛰어 answers가 비어도 레벨이 있으면 이전 대상(레벨 단어장 생성 + 설정).
export function pendingGuestMigration() {
  const g = getGuest();
  if (g && g.level != null) return g;
  return null;
}
