/**
 * 단어장 3화면(목록 · 단어 목록 · 단어 상세)이 쓰는 작물 파생값.
 *
 * 시안 vocabooks §2 · §5 · §7 의 규칙을 한곳에 모은다.
 * 화면마다 같은 판정을 다시 쓰면 목록의 그림과 시트의 그림이 어긋난다.
 *
 * 【중요】 `/vocaIndexs` 응답에는 `visual_stage` · `health` · `voca_id` 가 없다.
 * 그래서 여기서는 백엔드(farm_v2/growth.py · health.py)와 **같은 공식**으로 다시 계산한다.
 * 백엔드가 그 필드를 응답에 실어 주면 이 파일의 파생 함수는 그대로 버리고 값을 받아 쓰면 된다.
 */

import { HEALTH_STATES } from './crop';

/* ── 성장 단계 ─────────────────────────────────────────────
   시안 §2 — "이름만 바뀌고(미학습→씨앗, 단기→새싹, 중기→이파리, 장기→당근) 색은 유지".
   즉 기존 서비스의 암기 상태 판정(stability 10 / 60일)을 그대로 쓴다. */
const STABILITY_SPROUT = 10;
const STABILITY_LEAF = 60;

/** 아직 심지 않은 씨앗인가 — 학습을 한 번도 하지 않은 단어 */
/**
 * 서버가 실어 준 농장 상태. `/vocaIndexs` 응답의 `farm` 필드다.
 *
 * **있으면 무조건 이걸 쓴다.** 아래의 FSRS 재계산은 구버전 응답을 위한 폴백일 뿐이다.
 * 화면이 스스로 단계를 다시 매기면 서버 판정과 어긋난다 — 보유 씨앗/심은 씨앗 구분,
 * 황금, 무료 긴급 급수로 밀린 보호 일수는 FSRS 만으로 알 수 없어서, 같은 단어가
 * 홈에서는 새싹인데 단어장에서는 씨앗으로 보이는 일이 생긴다.
 */
const serverFarm = (word) => word?.farm || null;

export const isUnplanted = (word) => {
  const f = serverFarm(word);
  if (f) return f.stage === 'UNPLANTED_SEED';
  const fsrs = word?.fsrs;
  return !fsrs || !fsrs.state || fsrs.state === 'new';
};

/** 단어 → 작물 단계 키 (seed / sprout / leaf / carrot) */
export const wordCropStage = (word) => {
  const f = serverFarm(word);
  if (f?.crop) return f.crop;
  if (isUnplanted(word)) return 'seed';
  const stability = Number(word?.fsrs?.stability ?? 0);
  if (stability >= STABILITY_LEAF) return 'carrot';
  if (stability >= STABILITY_SPROUT) return 'leaf';
  return 'sprout';
};

/* ── 건강 ─────────────────────────────────────────────────
   기획 6.2 / farm_v2/constants.py 의 값 그대로.
     유예 G = clamp(ceil(I × 0.5), 3, 30), 초기 단어(씨앗·새싹)는 최소 5
     시듦   D + max(1, ceil(G × 0.25))
     심한 시듦 D + max(2, ceil(G × 0.6))
     부패   D + G                                                        */
const GRACE_RATIO = 0.5;
const GRACE_MIN = 3;
const GRACE_MAX = 30;
const GRACE_MIN_EARLY = 5;
const WILT_RATIO = 0.25;
const WILT_MIN_DAYS = 1;
const CRITICAL_RATIO = 0.6;
const CRITICAL_MIN_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 백엔드 created_at 처럼 타임존이 빠진 문자열도 UTC 로 읽는다 */
const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value);
  // 'YYYY-MM-DD' 만 오는 경우는 현지 자정으로 읽는다 (기존 formatReviewDue 와 같은 규칙)
  if (raw.includes('-') && !raw.includes('T')) {
    const [y, m, d] = raw.split('-');
    const local = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(local.getTime()) ? null : local;
  }
  const normalized = raw.endsWith('Z') || raw.includes('+') ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const graceDays = (stability, stage) => {
  const interval = Number(stability) || 0;
  let g = Math.ceil(interval * GRACE_RATIO);
  g = Math.max(GRACE_MIN, Math.min(GRACE_MAX, g));
  if (stage === 'seed' || stage === 'sprout') g = Math.max(g, GRACE_MIN_EARLY);
  return g;
};

/**
 * 단어 → 건강 상태(HEALTH_STATES 키).
 * 보유 씨앗(아직 안 심음)과 예정이 없는 단어는 언제나 FRESH 다 (기획 6.4).
 */
export const wordHealth = (word, now = new Date()) => {
  const f = serverFarm(word);
  if (f?.health) return f.health;
  if (isUnplanted(word)) return HEALTH_STATES.FRESH;

  const due = parseDate(word?.fsrs?.next_review);
  if (!due) return HEALTH_STATES.FRESH;

  const stage = wordCropStage(word);
  const g = graceDays(word?.fsrs?.stability, stage);
  const wilt = Math.max(WILT_MIN_DAYS, Math.ceil(g * WILT_RATIO));
  const critical = Math.max(CRITICAL_MIN_DAYS, Math.ceil(g * CRITICAL_RATIO));

  const t = now.getTime();
  const d = due.getTime();
  if (t >= d + g * DAY_MS) return HEALTH_STATES.ROTTEN;
  if (t >= d + critical * DAY_MS) return HEALTH_STATES.CRITICAL;
  if (t >= d + wilt * DAY_MS) return HEALTH_STATES.WILTED;
  if (t >= d) return HEALTH_STATES.THIRSTY;
  return HEALTH_STATES.FRESH;
};

export const isRotten = (word, now) => wordHealth(word, now) === HEALTH_STATES.ROTTEN;

/* ── 우측 상태 문구 ────────────────────────────────────────
   시안 §5 — 기본 #9A9A9A · 오늘 #FF70D4 · 지남 #FB6514 · 썩음은 회색 칩.
   "안 배움"도 날짜 자리에 글자로 쓴다 (— 를 넣으면 빈칸처럼 보인다). */
export const DUE_TONE_CLASS = {
  muted: 'text-layout-gray-300',
  today: 'text-primary-main-600',
  late: 'text-secondary-yellow-600',
  rot: 'text-layout-gray-400 dark:text-layout-gray-200 bg-layout-gray-50 dark:bg-layout-gray-dark px-[7px] py-[3px] rounded-full',
};

/** 오늘 자정 기준 남은 일수 (음수면 지남) */
export const daysToReview = (word) => {
  const due = parseDate(word?.fsrs?.next_review);
  if (!due) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(due);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / DAY_MS);
};

/** 단어 → 목록 우측에 그대로 찍는 { text, tone } */
export const wordDue = (word, now = new Date()) => {
  if (isRotten(word, now)) return { text: '썩음', tone: 'rot' };
  if (isUnplanted(word)) return { text: '안 배움', tone: 'muted' };

  const days = daysToReview(word);
  if (days === null) return { text: '안 배움', tone: 'muted' };
  if (days < 0) return { text: `${Math.abs(days)}일 지남`, tone: 'late' };
  if (days === 0) return { text: '오늘 물 필요', tone: 'today' };
  if (days === 1) return { text: '내일', tone: 'muted' };
  return { text: `${days}일 뒤`, tone: 'muted' };
};

/* ── 사전 검증 마크 ────────────────────────────────────────
   시안 §3 — 유일하게 새로 들어온 개념.
   지금 `/vocaIndexs` 는 사전 연결 여부(voca_id)를 내려 주지 않는다.
   값이 아예 없으면 'unknown' 을 돌려주고 화면은 마크를 **아무것도** 그리지 않는다 —
   전부 검증됨으로 칠하거나 전부 미검증으로 칠하면 둘 다 거짓말이 된다. */
export const wordVerification = (word) => {
  const raw = word?.vocaId ?? word?.voca_id ?? word?.dictionaryId ?? word?.verified;
  if (raw === undefined) return 'unknown';
  if (raw === null || raw === false) return 'unverified';
  return 'verified';
};

/* ── 단어장 단위 집계 ──────────────────────────────────────
   시안 §2 — 진행률 바를 버리고 **네 단계의 실제 수**를 적는다. */
export const CROP_ORDER = ['seed', 'sprout', 'leaf', 'carrot'];

export const bookStageCounts = (words) => {
  const counts = { seed: 0, sprout: 0, leaf: 0, carrot: 0 };
  (words || []).forEach((word) => {
    counts[wordCropStage(word)] += 1;
  });
  return counts;
};

/** 돌봄이 필요한 단어 수 — 오늘 물이 필요하거나 이미 지난 것(썩음 포함) */
export const bookCareCount = (words, now = new Date()) =>
  (words || []).filter((word) => {
    if (isUnplanted(word)) return false;
    const days = daysToReview(word);
    return days !== null && days <= 0;
  }).length;

/** 시든 단어 수 — 시안 §4 필터 칩 "시듦" */
export const bookWiltedCount = (words, now = new Date()) =>
  (words || []).filter((word) => {
    const h = wordHealth(word, now);
    return h === HEALTH_STATES.WILTED || h === HEALTH_STATES.CRITICAL || h === HEALTH_STATES.ROTTEN;
  }).length;

/** 오늘 복습해야 하는 단어 수 — 시안 §4 필터 칩 "오늘" (지남 포함) */
export const bookDueTodayCount = (words) =>
  (words || []).filter((word) => {
    if (isUnplanted(word)) return false;
    const days = daysToReview(word);
    return days !== null && days <= 0;
  }).length;

export const bookUnverifiedCount = (words) =>
  (words || []).filter((word) => wordVerification(word) === 'unverified').length;

/**
 * 밭 썸네일 키 — 시안 §2 표.
 *   흙 + 씨앗 몇 개   산 뒤 아직 안 시작
 *   새싹 위주·일부 마름 초반, 관리 필요
 *   섞임 · 시든 것 보임 오래 방치
 *   당근 가득          거의 다 외움
 * 단어가 하나도 없는 단어장은 시안에 없어 빈 밭(book-empty)을 쓴다.
 */
export const bookThumbKey = (words, counts) => {
  const total = (words || []).length;
  if (total === 0) return 'empty';
  const c = counts || bookStageCounts(words);
  const grown = c.sprout + c.leaf + c.carrot;
  if (grown === 0) return 'seed';
  if (c.carrot / total >= 0.5) return 'done';
  // 시안 §1① 표본: [58,42,28,14] 은 mid, [78,30,12,0] 은 early 다.
  // 동수(42 vs 28+14)일 때 early 로 넘어가면 앞의 표본이 어긋나므로 초과일 때만 early.
  if (c.sprout > c.leaf + c.carrot) return 'early';
  return 'mid';
};

/**
 * 카드 배지 — 시안 §1① (완료 / 돌봄 N / 씨앗).
 * 어디에도 해당하지 않으면 null (배지를 비운다).
 */
export const bookBadge = (words, counts, now = new Date()) => {
  const total = (words || []).length;
  if (total === 0) return null;
  const care = bookCareCount(words, now);
  if (care > 0) return { kind: 'care', text: `돌봄 ${care}` };
  const c = counts || bookStageCounts(words);
  if (c.seed === total) return { kind: 'new', text: '씨앗' };
  if (c.carrot / total >= 0.5) return { kind: 'done', text: '완료' };
  return null;
};
