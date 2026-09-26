import { AnimatePresence, motion } from 'framer-motion';
import { lastStudiedLabel, nextReviewLabel, calendarDaysFromToday } from '../../utils/reviewTiming';

/**
 * 문제 카드 우측 상단의 작은 시점 문구 — 모든 문제 유형 공통.
 *
 *   채점 전  "3일 전 학습" / "오늘 학습" / "첫 학습"   (FSRS last_review)
 *   채점 후  "9일 뒤 복습" / "내일 복습"               (서버 farm.days_to_review)
 *
 * 2026-09 피드백으로 농장 상태 바에서 옮겨 왔다. 상태 바는 작물·막대·XP 만 말하고,
 * "언제"는 이 자리가 전담한다.
 *
 * 【오답은 비운다】 상태 바가 쓰던 규칙 그대로다 — 틀린 단어는 재출제 큐에 들어가
 * **이번 세션에서 바로 다시** 나오므로, 여기서 다음 예정일을 말하면 "오늘은 이 단어 끝"으로
 * 읽힌다. 무슨 일이 있었는지는 줄어드는 막대와 −N XP 가 말한다.
 *
 * 【응답 대기 중(pending)도 비운다】 낙관값의 날짜를 먼저 적었다가 서버값으로 바뀌면
 * "3일 뒤 → 4일 뒤"처럼 숫자가 튄다. 서버 응답이 오는 순간 한 번만 나타나게 한다.
 * 단 응답이 영영 안 오는 경로(게스트·재출제·구버전)는 pending 이 아니므로 nextReviewIso
 * (채점 시점에 고정한 예정일) 폴백으로 바로 그린다.
 *
 * 위치는 호출부가 absolute 로 잡는다(className) — 카드마다 여백이 달라서다.
 */
const StudyTimingTag = ({
  answered = false,
  fsrs = null,
  wasCorrect = null,
  daysToReview = null,
  nextReviewIso = null,
  pending = false,
  compact = false,
  className = '',
}) => {
  let label = null;
  let tone = 'past';
  if (!answered) {
    label = lastStudiedLabel(fsrs);
  } else if (wasCorrect !== false && !pending) {
    let days = typeof daysToReview === 'number' ? daysToReview : null;
    if (days == null && nextReviewIso) days = calendarDaysFromToday(nextReviewIso);
    label = nextReviewLabel(days);
    tone = 'next';
  }

  return (
    <span
      className={`pointer-events-none select-none ${className}`}
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        {label && (
          <motion.span
            key={label}
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className={`
              block whitespace-nowrap tracking-[-0.02em] tabular-nums
              ${compact ? 'text-[10px]' : 'text-[11.5px]'}
              ${tone === 'next'
                ? 'font-[700] text-primary-main-600'
                : 'font-[600] text-layout-gray-300 dark:text-layout-gray-200'}
            `}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
};

export default StudyTimingTag;
