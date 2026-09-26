import { isUnplantedStage } from './crop';

/**
 * 학습 화면·결과 화면의 "언제 풀었나 / 언제 다시 만나나" 문구 — 단일 소스.
 *
 * 2026-09 사용자 피드백으로 복습일 문구가 농장 상태 바에서 **문제 카드 우측 상단**으로 옮겨
 * 왔다(채점 전: 최근 학습 시점, 채점 후: 다음 복습 예정일). 결과 화면 채점 목록도 같은
 * 말을 쓰므로 표기 규칙을 한곳에 둔다.
 */

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** iso 날짜 − 오늘 (달력 일수). 과거면 음수. 파싱 불가면 null */
export const calendarDaysFromToday = (iso, now = new Date()) => {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return Math.round((startOfDay(t) - startOfDay(now)) / 86400000);
};

/**
 * 【2026-09-26 "새싹인데 첫 학습" 버그】
 * 학습 세션 문제는 `/study/recommend` 응답으로 만든다. 그런데 그 응답의 `fsrs` 는
 * `{state, stability, difficulty, retrievability, next_review}` 다섯 키뿐이고 **last_review·reps 가
 * 없다**(heyvoca_back routes/study.py 추천 응답 직렬화). 예전 판정은 `!fsrs.last_review` 만으로
 * "첫 학습"이라 했으므로, 이미 여러 번 푼 새싹·이파리 단어도 전부 "첫 학습"으로 나왔다.
 *
 * 지금은 세 단계로 판단한다.
 *  1) 학습 이력이 있나 — 농장 단계가 심은 씨앗 이상이거나, FSRS state 가 new 가 아니거나,
 *     reps > 0 이면 "학습한 적 있음". 이 경우 **절대 "첫 학습"이라 하지 않는다.**
 *  2) 이력이 있으면 last_review 로 "오늘/어제/N일 전 학습". 날짜를 모르면(추천 응답만 있고
 *     사전 병합이 안 된 경우 등) **비운다** — 틀린 말("첫 학습")보다 말하지 않는 게 낫다.
 *  3) 이력이 없다고 확실할 때(state 'new' 또는 reps 0, 그리고 단계가 미보유/미상)만 "첫 학습".
 *     fsrs 자체가 없으면 판단 근거가 없으므로 비운다.
 *
 * 게스트 스텁(guestQuestions.fsrsStub)은 last_review 에 현재 시각을 채워 두지만 state 'new'·
 * reps 0 이라 3) 로 "첫 학습"이 된다 — last_review 만 보면 "오늘 학습"으로 잘못 읽힌다.
 *
 * `stage` 는 농장 visual_stage(PLANTED_SEED/SPROUT/…) — 사전(GET /vocaIndexs)의 `farm.stage`.
 * TakeTest 가 문제를 만들 때 `farmStage` 로 붙여 둔다(utils/studyHistory.js).
 */
const hasStudyHistory = (fsrs, stage) => {
  if (stage && !isUnplantedStage(stage)) return true;
  if (!fsrs) return false;
  if (fsrs.state && fsrs.state !== 'new') return true;
  return (Number(fsrs.reps) || 0) > 0;
};

/** 확실히 처음인가 — 이력 없음 + FSRS 가 'new' 라고 말해 줄 때만 */
export const isFirstStudy = (fsrs, stage = null) =>
  !hasStudyHistory(fsrs, stage) && !!fsrs && (fsrs.state === 'new' || !fsrs.state || fsrs.reps === 0);

/** 채점 전 — "첫 학습" / "오늘 학습" / "어제 학습" / "N일 전 학습" / null(모름 → 비움) */
export const lastStudiedLabel = (fsrs, stage = null) => {
  if (!hasStudyHistory(fsrs, stage)) return isFirstStudy(fsrs, stage) ? '첫 학습' : null;
  const d = calendarDaysFromToday(fsrs?.last_review);
  if (d == null) return null;
  const ago = -d;
  if (ago <= 0) return '오늘 학습';
  if (ago === 1) return '어제 학습';
  return `${ago}일 전 학습`;
};

/** 다음 복습까지 일수 → "오늘" / "내일" / "N일 뒤". null 이면 null */
export const nextReviewShort = (days) => {
  if (typeof days !== 'number' || Number.isNaN(days)) return null;
  if (days <= 0) return '오늘';
  if (days === 1) return '내일';
  return `${days}일 뒤`;
};

/** 채점 후 — "오늘 복습" / "내일 복습" / "N일 뒤 복습" */
export const nextReviewLabel = (days) => {
  const s = nextReviewShort(days);
  return s ? `${s} 복습` : null;
};
