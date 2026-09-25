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
import { fieldDataFromPlants } from './farmField';
import {
  STABILITY_SPROUT_DAYS, STABILITY_LEAF_DAYS, STABILITY_CARROT_DAYS,
} from './common';
import { xpOf, xpFloor, xpNext } from './cropXp';

/* ── 레거시 암기 상태(state) → 작물 그림 ─────────────────────
   MemoryStateChangeBadge.jsx · MemorizationStatus.jsx 는 짧은 키(unlearned/leaf/plant/carrot)를,
   WordMemorySection.jsx · TodayMemoryChangesNewBottomSheet.jsx · ReviewScheduleContent.jsx 는
   insights API 키(unlearned/short/medium/long)를 쓴다 — 같은 4단계를 이름만 다르게 부른다.
   두 이름을 여기 한 곳에서만 흡수해, 다섯 화면이 전부 같은 CropImage 그림을 그리게 한다.

   【한계】 이 4단계 매핑은 "심은 뒤" 기준이라 unlearned/new 를 항상 PLANTED_SEED(씨앗)로 그린다.
   한 번도 학습하지 않은 진짜 미학습(UNPLANTED_SEED)과는 다른 그림이다 — 호출부가 "이 값이 정말
   한 번도 학습 안 한 단어"라고 보장할 수 있으면(예: 오늘의 기억 변화의 '신규' 목록) 직접
   'UNPLANTED_SEED'를 넘길 것. 여기서 자동으로 구분하지 않는 이유는, 이 함수가 받는 값(과거 로그의
   state_after 등)만으로는 정말 미학습인지 이미 심겼다가 그대로인지 알 수 없어서다. */
export const MEMORY_STATE_VISUAL_STAGE = {
  unlearned: 'PLANTED_SEED',
  new: 'PLANTED_SEED',
  short: 'SPROUT',
  leaf: 'SPROUT',
  medium: 'LEAF',
  plant: 'LEAF',
  long: 'CARROT',
  carrot: 'CARROT',
};

/** 레거시 암기 상태 키 → CropImage 가 읽는 visual_stage. 모르는 키는 unlearned 취급 */
export const memoryStateVisualStage = (state) =>
  MEMORY_STATE_VISUAL_STAGE[state] ?? MEMORY_STATE_VISUAL_STAGE.unlearned;

/* ── 성장 단계 ─────────────────────────────────────────────
   시안 §2 — "이름만 바뀌고(미학습→씨앗, 단기→새싹, 중기→이파리, 장기→당근) 색은 유지".
   즉 기존 서비스의 암기 상태 판정을 그대로 쓴다 — 경계는 common.jsx 가 단일 소스다.
   (예전에는 여기에 10 / 60 을 다시 적어 뒀는데, 이름이 SPROUT/LEAF 인데 실제로는
    이파리·당근 문턱이라 값을 옮길 때 읽는 사람을 반대로 속였다.) */

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

/**
 * 단어 → 백엔드 visual_stage (UNPLANTED_SEED / PLANTED_SEED / SPROUT / LEAF / CARROT / GOLDEN).
 *
 * `wordCropStage` 는 밭의 **구역**(씨앗·새싹·이파리·당근)을 돌려주므로 보유 씨앗과
 * 심은 씨앗이 둘 다 'seed' 로 뭉개진다. 단어 하나의 상태를 이름으로 부를 자리
 * (상세 시트 · 찾기)에서는 이쪽을 써야 기획 5.1 의 여섯 단계가 그대로 나온다.
 */
export const wordStage = (word) => {
  const f = serverFarm(word);
  if (f?.stage) return f.stage;
  // 구버전 응답 폴백 — 심었는지만 알 수 있고 심은 씨앗/새싹 구분은 FSRS 로 추정한다
  if (isUnplanted(word)) return 'UNPLANTED_SEED';
  const crop = wordCropStage(word);
  return { seed: 'PLANTED_SEED', sprout: 'SPROUT', leaf: 'LEAF', carrot: 'CARROT', golden: 'GOLDEN' }[crop];
};

/** 단어 → 작물 단계 키 (seed / sprout / leaf / carrot) */
export const wordCropStage = (word) => {
  const f = serverFarm(word);
  if (f?.crop) return f.crop;
  if (isUnplanted(word)) return 'seed';
  const stability = Number(word?.fsrs?.stability ?? 0);
  if (stability >= STABILITY_CARROT_DAYS) return 'carrot';
  if (stability >= STABILITY_LEAF_DAYS) return 'leaf';
  // 새싹 문턱 아래는 아직 '심은 씨앗'이다 — 씨앗 구역으로 돌려보낸다.
  // (예전에는 무조건 sprout 로 떨어져, 막 심은 단어가 폴백 경로에서만 새싹으로 보였다.)
  if (stability >= STABILITY_SPROUT_DAYS) return 'sprout';
  return 'seed';
};

/* ── 작물 경험치(XP) — crop_xp_contract.md §1 ─────────────────
   `/vocaIndexs` 응답의 `farm.xp`/`farm.xp_next`(백엔드 farm_v2/xp.py)를 우선 쓰고,
   없으면(구버전 응답·게스트) `cropXp.js` 로 같은 공식을 다시 계산한다 —
   wordHealth/wordCropStage 와 같은 "서버 우선, FSRS 폴백" 패턴이다. */

/** 단어 → 표시 XP(현재 단계 기준, floor 적용됨) */
export const wordXp = (word) => {
  const f = serverFarm(word);
  if (f && typeof f.xp === 'number') return f.xp;
  return xpOf(wordStage(word), word?.fsrs);
};

/** 단어 → 다음 단계 문턱 XP. 황금(최고 단계)이면 null */
export const wordXpNext = (word) => {
  const f = serverFarm(word);
  if (f && f.xp_next !== undefined) return f.xp_next;
  return xpNext(wordStage(word));
};

/**
 * 단어 → 단계 내 진행률 0~100(단어장 목록의 얇은 게이지 폭). 서버 `farm.pct`
 * (farm_v2/answer.py `stage_progress` 와 같은 축)를 우선 쓰고, 없으면 XP 값에서
 * 역산한다 — `pct = (xp-floor)/(next-floor)*100`(crop_xp_contract.md §2).
 */
export const wordFarmProgressPct = (word) => {
  const f = serverFarm(word);
  if (f && typeof f.pct === 'number') return Math.max(0, Math.min(100, f.pct));
  const stage = wordStage(word);
  const floor = xpFloor(stage);
  const next = wordXpNext(word);
  if (next == null || next <= floor) return 100;
  const xp = wordXp(word);
  return Math.max(0, Math.min(100, Math.round(((xp - floor) / (next - floor)) * 100)));
};

/* ── 학습·테스트 설정의 '어떤 단어를' 필터 ───────────────────
   테스트 설정·학습 설정 시트는 예전에 암기 상태 4단계(미학습/단기/중기/장기)로 골랐다.
   지금은 농장 작물 단계로 고른다 — 미학습(보유 씨앗) · 씨앗(심은 것) · 새싹 · 이파리 · 당근.
   황금 당근은 당근에 합친다(필터 칸을 하나 더 두면 대개 0개라 빈 칸만 늘어난다).
   판정은 위 isUnplanted / wordCropStage 와 같은 소스(서버 farm 우선)라, 단어장 카드의
   단계 수와 설정 시트의 수가 같은 말을 한다. 백엔드 /study/recommend 도 이 다섯 키를 그대로 받는다. */
export const MEMORY_STAGE_ORDER = ['unlearned', 'seed', 'sprout', 'leaf', 'carrot'];

/** 단어 → 설정 시트 필터 키 (unlearned / seed / sprout / leaf / carrot) */
export const wordMemoryStage = (word) => {
  if (isUnplanted(word)) return 'unlearned';
  const crop = wordCropStage(word);
  return crop === 'golden' ? 'carrot' : crop;
};

/** `{ unlearned, seed, sprout, leaf, carrot }` — 설정 시트의 칸별 개수 */
export const memoryStageCounts = (words) => {
  const counts = { unlearned: 0, seed: 0, sprout: 0, leaf: 0, carrot: 0 };
  (words || []).forEach((word) => { counts[wordMemoryStage(word)] += 1; });
  return counts;
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

/**
 * 지금 학습에 낼 수 있는 단어인가 — **썩은 단어는 낼 수 없다.**
 *
 * 썩은 작물은 되살리기(삽·영양제)로 먼저 손을 봐야 하는 상태라, 학습 문제로 섞여 나오면
 * 화면은 "되살려야 한다"고 말해 놓고 문제로는 그냥 물을 주게 된다. 백엔드
 * `/study/recommend` 는 이미 빼고 주지만, 클라이언트가 직접 단어를 고르는 자리
 * (학습 설정 시트의 로컬 선별, 설정 시트의 단계별 개수)는 아무 곳도 이 값을 보지 않아
 * 썩은 단어가 그대로 출제됐다(QA 2차).
 *
 * 판정은 서버가 준 `farm.studiable` 이 정본이다. 구버전 응답처럼 그 필드가 아예 없을 때만
 * 화면이 다시 계산한 부패 여부로 대신한다.
 */
export const isWordStudiable = (word) => {
  const f = serverFarm(word);
  if (f && f.studiable !== undefined && f.studiable !== null) return f.studiable !== false;
  return !isRotten(word);
};

/** 학습·테스트가 고를 수 있는 단어만 남긴다 — 개수와 실제 출제가 같은 말을 하게 하는 단일 소스 */
export const studiableWords = (words) => (words || []).filter(isWordStudiable);

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

/**
 * `{ unplanted, seed, sprout, leaf, carrot }` — **`unplanted`는 별도 칸이다.**
 *
 * `wordCropStage` 는 밭의 구역만 알아서 보유 씨앗(아직 안 심음)과 심은 씨앗을
 * 둘 다 'seed' 로 뭉갠다. 그대로 합치면 "포장된 씨앗 100개"처럼 보유 수가
 * 심은 수인 척 나온다 — 여기서는 `isUnplanted` 로 먼저 갈라, `seed` 는
 * **심은 씨앗(PLANTED_SEED)만** 센다. `bookFieldData`(밭에 실제로 심는 것)와
 * 같은 판정 기준이라야 카드 왼쪽 그림과 오른쪽 숫자가 같은 말을 한다.
 */
export const bookStageCounts = (words) => {
  const counts = {
    unplanted: 0, seed: 0, sprout: 0, leaf: 0, carrot: 0,
  };
  (words || []).forEach((word) => {
    if (isUnplanted(word)) {
      counts.unplanted += 1;
      return;
    }
    counts[wordCropStage(word)] += 1;
  });
  return counts;
};

/**
 * 돌봄 판정 — 오늘 물이 필요하거나 이미 지난 것(썩음 포함). **단어장(목록·상세)과
 * 찾기 탭이 반드시 같은 결과를 내야 하는 자리라 함수를 하나로 뺐다.**
 *
 * 예전에는 찾기 탭(dictionary/Main.jsx)이 이 정의 대신 건강 상태(WILTED/CRITICAL)로
 * "돌봄"을 셌다. 부패 유예(최소 3~30일, 초기 단어는 5일)가 끝나야 WILTED 가 되므로
 * 방금 예정일이 지난 단어는 건강상 아직 FRESH/THIRSTY 라 찾기 탭 돌봄 칩이 0으로
 * 나오면서 단어장 카드의 "돌봄 N"과 어긋났다. "돌봄"은 언제나 **예정일** 기준이고,
 * "시듦"(bookWiltedCount)만 건강 상태 기준이다 — 이름이 다른 두 개념을 섞지 않는다.
 *
 * @param {number|null|undefined} days - daysToReview(word) 또는 서버가 준
 *   farm.days_to_review 값. 0 이하면 오늘이거나 이미 지났다는 뜻이다.
 * @param {boolean} unplanted - 아직 심지 않은 단어(보유 씨앗)인가. 보유 씨앗은
 *   예정일 자체가 없으니 항상 false.
 */
export const isCareDue = (days, unplanted) => {
  if (unplanted) return false;
  return days !== null && days !== undefined && days <= 0;
};

/** 돌봄이 필요한 단어 수 — 오늘 물이 필요하거나 이미 지난 것(썩음 포함) */
export const bookCareCount = (words, now = new Date()) =>
  (words || []).filter((word) => isCareDue(daysToReview(word), isUnplanted(word))).length;

/** 시든 단어 수 — 시안 §4 필터 칩 "시듦" */
export const bookWiltedCount = (words, now = new Date()) =>
  (words || []).filter((word) => {
    const h = wordHealth(word, now);
    return h === HEALTH_STATES.WILTED || h === HEALTH_STATES.CRITICAL || h === HEALTH_STATES.ROTTEN;
  }).length;

/** 오늘 복습해야 하는 단어 수 — 시안 §4 필터 칩 "오늘" (지남 포함) */
export const bookDueTodayCount = (words) =>
  (words || []).filter((word) => isCareDue(daysToReview(word), isUnplanted(word))).length;

export const bookUnverifiedCount = (words) =>
  (words || []).filter((word) => wordVerification(word) === 'unverified').length;

/**
 * 이 단어장의 밭에 실제로 심을 것 — FarmField 가 그대로 받는 형태.
 *
 * **아직 학습하지 않은 단어는 뺀다.** 담아만 두고 한 번도 열지 않은 단어는 씨앗을
 * 심은 것도 아니라 밭에 있을 수 없다. 그 수는 팻말(보유 수)과 밭의 차이로 읽힌다.
 */
export const bookFieldData = (words, now = new Date()) =>
  fieldDataFromPlants(
    (words || [])
      .filter((word) => !isUnplanted(word))
      .map((word) => ({ crop: wordCropStage(word), health: wordHealth(word, now) })),
  );

/* 밭 썸네일을 네 장(book-seed/early/mid/done) 중에서 고르던 `bookThumbKey` 는 지웠다.
   시안 §2 가 말하는 "밭 그림으로 상태를 먼저 읽는다"는 그 넷으로는 성립하지 않았다 —
   단어장이 몇 개든 결국 같은 그림 넷 중 하나였다. 지금은 bookFieldData 가 실제로
   심긴 작물을 내려주고 FarmField 가 그대로 심는다. */

/**
 * 카드 배지 — 시안 §1① 의 세 배지 중 **둘만** 남긴다 (완료 / 돌봄 N).
 *
 * "씨앗" 배지를 뺐다. 카드에는 이미 씨앗 아이콘과 개수가 찍혀 있고 밭 썸네일도
 * 흙과 씨앗뿐인 그림이라, 배지가 세 번째로 같은 말을 하고 있었다.
 * 배지 자리는 "지금 손이 필요한가"에만 쓴다 — 그래야 돌봄 배지가 눈에 걸린다.
 *
 * 어디에도 해당하지 않으면 null (배지를 비운다).
 */
export const bookBadge = (words, counts, now = new Date()) => {
  const total = (words || []).length;
  if (total === 0) return null;
  const care = bookCareCount(words, now);
  if (care > 0) return { kind: 'care', text: `돌봄 ${care}` };
  const c = counts || bookStageCounts(words);
  if (c.carrot / total >= 0.5) return { kind: 'done', text: '완료' };
  return null;
};
