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
//  - v2(이슈 #25): 수준 맞춤 학습을 마쳤으면(학습 완료 표시 placement/flow + theta 또는 answers) 이전 대상.
//    예전 v2 데이터(추천 단어장 bookstore_id 를 고른 것)도 그대로 인식한다.
//  - v1(구 데이터): 레벨을 골랐으면 이전 대상(맛보기를 건너뛰어 answers 가 비어도).
export const isV2Guest = (g) => !!g && (g.flow === 'v2' || g.placement != null)
  && (g.theta != null || (Array.isArray(g.answers) && g.answers.length > 0));

export function pendingGuestMigration() {
  const g = getGuest();
  if (g && (isV2Guest(g) || g.bookstore_id != null || g.level != null)) return g;
  return null;
}

// /onboarding/migrate body — v2 는 { flow, theta, answers } 만(단어장·질문 답 없음, 하루 심기 수는 서버 기본값).
// 닉네임은 보내지 않는다 — 온보딩에서 묻지 않고(이슈 #25 3차) 서버가 기본 닉네임을 넣는다.
// 구 v1(레벨만 있는 예전 게스트 데이터)은 예전 모양 그대로.
export function buildMigrateBody(g, overrides = {}) {
  const d = { ...(g || {}), ...overrides };
  const answers = Array.isArray(d.answers) ? d.answers : [];
  if (isV2Guest(d) || d.bookstore_id != null || d.level == null) {
    return { flow: 'v2', theta: d.theta ?? null, answers };
  }
  return {
    level: d.level,
    answers,
    source_channel: d.source_channel ?? null,
    learning_goal: d.learning_goal ?? null,
    daily_new_limit: d.daily_new_limit ?? null,
    username: d.username ?? null,
  };
}
