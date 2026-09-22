// src/data/homeGreetings.js
//
// 홈 히어로 인사말 — 상황별 멘트 모음 + 선택 로직.
//
// 예전에는 FarmCta.jsx의 HOME_STATE_VIEW(주 CTA 5상태)에 얹혀 "헤이, {line1}{line2}"를
// 그대로 그렸다(components/home/Main.jsx). CTA 문구(급한 작물부터 돌보기 등)와 히어로
// 인사말이 같은 다섯 갈래를 강제로 공유해 표현이 좁았다 — 여기서 분리해 상황을 더
// 세분화하고, 첫머리도 "헤이,"에서 로그인 유저의 닉네임(userProfile.username)으로 바꾼다.
// 같은 필드를 vocabularySheets/Header.jsx가 "{username}의 단어장"에 그대로 쓴다.
//
// 문장 구조는 그대로 유지한다 — "{이름}," 뒤에 line1(선행 공백 포함, 콤마와 자연스럽게
// 이어지는 말)과 줄바꿈 line2 가 붙어 한 문장으로 읽힌다("은비, 당근이 물을 기다리고
// 있어요"). 각 줄은 360px 폭·22px 폰트 기준으로 12~14자를 넘지 않게 짧게 둔다.
//
// 선택 로직: 우선순위(priority) 높은 상황부터 매칭되는 **첫 상황**을 고르고, 그 안의
// 2~4개 변형 중 무작위 1개. 시간대(아침/낮/저녁/밤) 네 상황이 항상 하나는 걸리므로
// 어떤 ctx가 와도 매칭되는 상황이 반드시 있다.
//
// 무작위 자체는 세션 내 고정돼야 한다(리렌더마다 바뀌면 안 됨) — 이 파일은 그 책임을
// 지지 않는다(순수 함수만 둔다). 호출부(components/home/Main.jsx)가
// useMemo(key = 상황 id + 날짜)로 고정하고, 학습 후 돌아오거나 날짜가 바뀌면 다시 뽑는다.

/** 배열에서 무작위 인덱스 하나. 호출부가 세션 고정을 책임진다. */
function pickIndex(len) {
  return Math.floor(Math.random() * len);
}

const NICKNAME_MAX_LEN = 6;

/**
 * "헤이," 자리에 들어갈 라벨. 닉네임이 있으면 그 닉네임(+콤마)으로, 없거나 너무 길면
 * 줄인 닉네임 또는 기존 "헤이,"로 폴백한다. vocabularySheets/Header.jsx가 쓰는
 * userProfile.username 을 그대로 받는다.
 *
 * @param {string|null|undefined} username
 * @returns {string} 예: "은비," / "긴이름이라면…," / "헤이,"
 */
export function formatGreetingName(username) {
  const trimmed = (username || '').trim();
  if (!trimmed) return '헤이,';
  const clipped = trimmed.length > NICKNAME_MAX_LEN
    ? `${trimmed.slice(0, NICKNAME_MAX_LEN)}…`
    : trimmed;
  return `${clipped},`;
}

/**
 * @typedef {object} GreetingContext
 * @property {number} totalCount                 - 밭에 있는 작물 총량(seed+sprout+leaf+carrot)
 * @property {number} unplantedCount              - 아직 심지 않은 씨앗(미학습 봉투) 수
 * @property {number} thirstyCount
 * @property {number} wiltedCount
 * @property {number} criticalCount
 * @property {number} careCount                   - thirsty+wilted+critical, "지금 물 필요" 총량
 * @property {number} sproutCount
 * @property {number} leafCount
 * @property {number} carrotCount
 * @property {boolean} todayDone                  - 오늘 연속 학습 인정 기준을 채웠는지
 * @property {number} todayCorrect                - 오늘 맞힌 단어 수
 * @property {number} streakCurrent
 * @property {number} streakBest
 * @property {boolean} streakProtectedYesterday    - 어제가 보호권으로 이어진 날인지
 * @property {number} grewTodayCount               - 오늘 승급(성장)한 단어 수
 * @property {Date} now
 */

/**
 * farmOverview(GET /farm/overview) + 오늘 자란 단어 수로 GreetingContext를 만든다.
 * StatsContext가 이미 캐시해 둔 값만 쓴다 — 이 화면을 위한 추가 API 호출은 없다.
 *
 * @param {object|null} farmOverview
 * @param {{ grewTodayCount?: number, now?: Date }} [extra]
 * @returns {GreetingContext}
 */
export function buildGreetingContext(farmOverview, { grewTodayCount = 0, now = new Date() } = {}) {
  const counts = farmOverview?.counts ?? {};
  const health = farmOverview?.health ?? {};
  const today = farmOverview?.today ?? {};
  const seedDetail = farmOverview?.seed_detail ?? {};
  const streak = farmOverview?.streak ?? {};

  const thirstyCount = health.thirsty ?? 0;
  const wiltedCount = health.wilted ?? 0;
  const criticalCount = health.critical ?? 0;
  // care_due_cnt — 예정일의 **날짜** 기준(단어장/찾기 탭의 "돌봄"과 같은 정의).
  // 예전에는 thirsty+wilted+critical(건강 상태, 정확한 시각 경과) 합을 썼는데, 새벽
  // 시간대처럼 예정일은 오늘인데 그 시각이 아직 안 된 단어가 빠져 "doneAll"(오늘 할 일
  // 다 끝냈어요) 인사말이 실제로는 남은 단어가 있는데도 떴다. 구버전 응답(필드 없음)
  // 폴백만 예전 건강 상태 합을 쓴다.
  const careCount = today.care_due_cnt ?? (thirstyCount + wiltedCount + criticalCount);

  return {
    totalCount: ['seed', 'sprout', 'leaf', 'carrot'].reduce((sum, key) => sum + (counts[key] ?? 0), 0),
    unplantedCount: seedDetail.unplanted ?? 0,
    thirstyCount,
    wiltedCount,
    criticalCount,
    careCount,
    sproutCount: counts.sprout ?? 0,
    leafCount: counts.leaf ?? 0,
    carrotCount: counts.carrot ?? 0,
    todayDone: streak.today_done ?? false,
    todayCorrect: streak.today_correct ?? 0,
    streakCurrent: streak.current ?? 0,
    streakBest: streak.best ?? 0,
    streakProtectedYesterday: streak.protected_yesterday ?? false,
    grewTodayCount,
    now,
  };
}

const hourBucket = (hour) => {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night'; // 22~04
};

/**
 * 상황 목록 — priority 높은 순으로 매칭. lines(ctx)는 [line1, line2] 변형 배열을
 * 반환한다(2~4개). line1은 "{이름},"에 바로 이어붙는 선행 공백 포함 문구다.
 * 숫자가 필요한 변형은 이 함수 안에서 템플릿 리터럴로 채운다.
 */
export const HOME_GREETINGS = [
  // ── 밭이 완전히 비어 있음(신규 유저) — 다른 모든 상황보다 우선 ──
  {
    id: 'empty',
    priority: 100,
    when: (ctx) => ctx.totalCount === 0,
    lines: () => [
      [' 밭이 아직', '비어 있어요'],
      [' 첫 씨앗을', '심어볼까요'],
      [' 여기서부터', '시작해봐요'],
    ],
  },

  // ── 오늘 학습 완료 + 물 필요한 단어 없음 ──
  {
    id: 'doneAll',
    priority: 95,
    when: (ctx) => ctx.todayDone && ctx.careCount === 0,
    lines: (ctx) => [
      [' 오늘 할 일', '다 끝냈어요'],
      [' 농장을 다', '돌봤어요'],
      [` 오늘 ${ctx.todayCorrect}개`, '정답 맞췄어요'],
      // "내일 또 만나요"는 남은 돌봄이 0일 때만 — doneMoreLeft(남은 작물 있음)에 두면
      // 단어장 탭의 "돌봄 N"과 정면으로 어긋난다(2026-09-22 사용자 지적).
      [' 내일 또', '만나요'],
    ],
  },

  // ── 오늘 학습 완료 + 아직 목마른 단어 남음 ──
  {
    id: 'doneMoreLeft',
    priority: 90,
    when: (ctx) => ctx.todayDone && ctx.careCount > 0,
    // 모든 변형이 "남은 작물이 있다"를 말해야 한다 — 마무리 인사("내일 또 만나요")는 금지.
    lines: (ctx) => [
      [` 아직 ${ctx.careCount}개가`, '기다리고 있어요'],
      [` 오늘 몫은 끝,`, `${ctx.careCount}개 더 돌볼까요`],
      [` 작물 ${ctx.careCount}개가`, '아직 목말라요'],
    ],
  },

  // ── 시든(wilted) · 부패 직전(critical) 단어가 있음 ──
  {
    id: 'wilted',
    priority: 88,
    when: (ctx) => ctx.wiltedCount + ctx.criticalCount >= 1,
    lines: (ctx) => [
      [' 시든 작물이', '기다리고 있어요'],
      [' 목마른 작물을', '먼저 챙겨요'],
      [` 작물 ${ctx.wiltedCount + ctx.criticalCount}개가`, '위태로워요'],
    ],
  },

  // ── 물이 필요한 단어가 많음(10개 이상) ──
  {
    id: 'careMany',
    priority: 84,
    when: (ctx) => ctx.careCount >= 10,
    lines: (ctx) => [
      [` 물 필요한 작물`, `${ctx.careCount}개예요`],
      [' 오늘은', '물주기 데이예요'],
      [` 작물 ${ctx.careCount}개가`, '목말라해요'],
    ],
  },

  // ── 연속이 끊길 위기(오늘 아직 학습 안 함 + 연속 진행 중) ──
  {
    id: 'streakAtRisk',
    priority: 79,
    when: (ctx) => ctx.streakCurrent >= 1 && !ctx.todayDone,
    lines: (ctx) => [
      [` 연속 ${ctx.streakCurrent}일이`, '끊기려 해요'],
      [' 오늘도 이어', '가볼까요'],
      [` ${ctx.streakCurrent}일 연속`, '지켜야 해요'],
    ],
  },

  // ── 물이 필요한 단어가 적음(1~9개) ──
  {
    id: 'careFew',
    priority: 75,
    when: (ctx) => ctx.careCount >= 1 && ctx.careCount < 10,
    lines: (ctx) => [
      // "당근이 물을 기다려요"는 당근이 0개인 밭에서도 떠서 틀린 말이 됐다 — 작물로 통일.
      [` 작물 ${ctx.careCount}개가`, '물을 기다려요'],
      [` 작물 ${ctx.careCount}개만`, '주면 끝나요'],
      [' 오늘도', '살짝 적셔줄까요'],
    ],
  },

  // ── 최장 기록을 경신 중 ──
  {
    id: 'streakRecord',
    priority: 72,
    when: (ctx) => ctx.streakCurrent >= 2 && ctx.streakCurrent === ctx.streakBest,
    lines: (ctx) => [
      [` 최장 기록 ${ctx.streakCurrent}일`, '경신 중이에요'],
      [' 지금이', '최고 기록이에요'],
      [` ${ctx.streakCurrent}일째`, '신기록이에요'],
    ],
  },

  // ── 보호권으로 연속이 이어진 날 ──
  {
    id: 'streakProtected',
    priority: 68,
    when: (ctx) => ctx.streakProtectedYesterday === true,
    lines: () => [
      [' 보호권 덕분에', '연속이 이어졌어요'],
      [' 어제는', '보호권이 지켜줬어요'],
    ],
  },

  // ── 미학습(봉투) 단어가 많음 ──
  {
    id: 'unplantedMany',
    priority: 64,
    when: (ctx) => ctx.unplantedCount >= 10,
    lines: (ctx) => [
      [` 씨앗 ${ctx.unplantedCount}개가`, '심어달래요'],
      [' 새 씨앗들이', '기다리고 있어요'],
      [` 아직 ${ctx.unplantedCount}개를`, '못 심었어요'],
    ],
  },

  // ── 연속 학습 n일(일반, 2일 이상) — 위 특수 케이스에 안 걸린 평상시 ──
  {
    id: 'streakDay',
    priority: 56,
    when: (ctx) => ctx.streakCurrent >= 2,
    lines: (ctx) => [
      [` ${ctx.streakCurrent}일째`, '함께하고 있어요'],
      [` 연속 ${ctx.streakCurrent}일`, '기록 중이에요'],
    ],
  },

  // ── 오늘 승급(성장)한 단어가 있음 ──
  {
    id: 'growthRecent',
    priority: 52,
    when: (ctx) => ctx.grewTodayCount >= 1,
    lines: (ctx) => [
      [` 오늘 ${ctx.grewTodayCount}개가`, '더 자랐어요'],
      [' 작물들이', '한 뼘 자랐어요'],
    ],
  },

  // ── 새싹·이파리가 많아 당근 승급이 가까움 ──
  {
    id: 'growthNear',
    priority: 44,
    when: (ctx) => ctx.sproutCount + ctx.leafCount >= 10,
    lines: () => [
      [' 밭에 작물이', '무럭무럭 자라요'],
      [' 당근이 될', '날이 머지않았어요'],
    ],
  },

  // ── 물 필요한 단어 없음(평상시, 학습 전) ──
  {
    id: 'careNone',
    priority: 36,
    when: (ctx) => ctx.careCount === 0 && !ctx.todayDone,
    lines: () => [
      [' 오늘은', '물줄 곳이 없어요'],
      [' 밭이', '평온한 날이에요'],
    ],
  },

  // ── 주말 ──
  {
    id: 'weekend',
    priority: 30,
    when: (ctx) => {
      const day = ctx.now.getDay();
      return day === 0 || day === 6;
    },
    lines: () => [
      [' 주말에도', '농장을 챙겨봐요'],
      [' 느긋한', '주말이에요'],
    ],
  },

  // ── 시간대 인사(다른 상황이 없을 때 폴백 — 항상 하나는 매칭된다) ──
  {
    id: 'morning',
    priority: 10,
    when: (ctx) => hourBucket(ctx.now.getHours()) === 'morning',
    lines: () => [
      [' 상쾌한', '아침이에요'],
      [' 오늘 하루도', '힘내봐요'],
    ],
  },
  {
    id: 'afternoon',
    priority: 10,
    when: (ctx) => hourBucket(ctx.now.getHours()) === 'afternoon',
    lines: () => [
      [' 활기찬', '오후예요'],
      [' 잠깐 쉬며', '단어 볼까요'],
    ],
  },
  {
    id: 'evening',
    priority: 10,
    when: (ctx) => hourBucket(ctx.now.getHours()) === 'evening',
    lines: () => [
      [' 하루를', '마무리해봐요'],
      [' 저녁에도', '한 뼘 자라요'],
    ],
  },
  {
    id: 'night',
    priority: 10,
    when: (ctx) => hourBucket(ctx.now.getHours()) === 'night',
    lines: () => [
      [' 오늘도', '수고했어요'],
      [' 잠들기 전', '잠깐 볼까요'],
    ],
  },
];

/** 우선순위 순 정렬(모듈 로드 시 1회) — 매칭 때마다 다시 정렬하지 않는다. */
const SORTED_GREETINGS = [...HOME_GREETINGS].sort((a, b) => b.priority - a.priority);

/**
 * ctx에 맞는 상황 하나를 고른다(무작위 없음 — 순수 결정적). 시간대 상황이 항상
 * 매칭되므로 undefined는 사실상 나오지 않지만, 방어적으로 첫 상황을 폴백한다.
 *
 * @param {GreetingContext} ctx
 */
export function resolveGreetingSituation(ctx) {
  return SORTED_GREETINGS.find((s) => s.when(ctx)) ?? SORTED_GREETINGS[SORTED_GREETINGS.length - 1];
}

/**
 * 고른 상황 안에서 변형 하나를 무작위로 뽑는다. 세션 내 고정은 호출부가
 * useMemo(key = situation.id + 날짜)로 감싸는 방식으로 책임진다.
 *
 * @param {{id: string, lines: (ctx: GreetingContext) => Array<[string, string]>}} situation
 * @param {GreetingContext} ctx
 * @returns {{ situationId: string, line1: string, line2: string }}
 */
export function pickGreetingVariant(situation, ctx) {
  const variants = situation.lines(ctx);
  const [line1, line2] = variants[pickIndex(variants.length)];
  return { situationId: situation.id, line1, line2 };
}

/** 상황 매칭 + 무작위 변형 선택을 한 번에. 세션 고정이 필요 없는 자리(테스트 등)에서 쓴다. */
export function pickGreeting(ctx) {
  return pickGreetingVariant(resolveGreetingSituation(ctx), ctx);
}
