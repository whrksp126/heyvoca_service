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

// 맛보기(게스트 takeTest) 문제 배열 — 기기 WebView에서 router location.state가 유실돼도
// 맛보기가 게스트 모드로 뜨도록 localStorage에 별도 보관(진입 직전 저장, 완료 시 clear).
const TRIAL_KEY = 'heyvoca_guest_trial_v1';

export function setGuestTrial(questions) {
  try { localStorage.setItem(TRIAL_KEY, JSON.stringify(Array.isArray(questions) ? questions : [])); } catch { /* 무시 */ }
}
export function getGuestTrial() {
  try { return JSON.parse(localStorage.getItem(TRIAL_KEY) || 'null'); } catch { return null; }
}
export function clearGuestTrial() {
  try { localStorage.removeItem(TRIAL_KEY); } catch { /* 무시 */ }
}

// 온보딩을 진행했고 아직 서버 이전 전인 게스트 데이터가 있으면 반환.
//  - v2(이슈 #25): 추천 단어장을 골랐으면(bookstore_id) 이전 대상.
//  - v1(구 데이터): 레벨을 골랐으면 이전 대상(맛보기를 건너뛰어 answers 가 비어도).
export function pendingGuestMigration() {
  const g = getGuest();
  if (g && (g.bookstore_id != null || g.level != null)) return g;
  return null;
}

// /onboarding/migrate body — v2 데이터면 v2, 아니면 구 v1 그대로.
export function buildMigrateBody(g, overrides = {}) {
  const d = { ...(g || {}), ...overrides };
  const common = {
    source_channel: d.source_channel ?? null,
    learning_goal: d.learning_goal ?? null,
    daily_new_limit: d.daily_new_limit ?? null,
    username: d.username ?? null,
  };
  if (d.bookstore_id != null) {
    return {
      flow: 'v2',
      bookstore_id: d.bookstore_id,
      theta: d.theta ?? null,
      answers: Array.isArray(d.answers) ? d.answers : [],
      ...common,
    };
  }
  return { level: d.level, answers: Array.isArray(d.answers) ? d.answers : [], ...common };
}
