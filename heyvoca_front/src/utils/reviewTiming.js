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
 * FSRS 상태 → "첫 학습" 여부. 게스트 스텁(guestQuestions.fsrsStub)은 last_review 에
 * 현재 시각을 채워 두므로 last_review 만 보면 "오늘 학습"으로 잘못 읽힌다 — state/reps 도 본다.
 */
export const isFirstStudy = (fsrs) =>
  !fsrs || !fsrs.last_review || fsrs.state === 'new' || fsrs.reps === 0;

/** 채점 전 — "첫 학습" / "오늘 학습" / "어제 학습" / "N일 전 학습" */
export const lastStudiedLabel = (fsrs) => {
  if (isFirstStudy(fsrs)) return '첫 학습';
  const d = calendarDaysFromToday(fsrs.last_review);
  if (d == null) return '첫 학습';
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
