import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { lastStudiedLabel, nextReviewLabel, calendarDaysFromToday } from '../../utils/reviewTiming';

/**
 * 문제 카드 우측 상단의 작은 시점 문구 — 모든 문제 유형 공통.
 *
 *   채점 전  "3일 전 학습" / "5분 전 학습"(오늘) / "첫 학습"   (FSRS last_review)
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
 * 【유형 공통 규격 — 2026-09-26 통일】 호출부는 농장 payload(`farm`)를 그대로 넘긴다.
 * 정오답·복습일·대기 여부를 이 컴포넌트가 payload 에서 읽으므로 유형마다 계산이 갈라지지 않는다.
 * 위치도 기본값이 규격이다 — 문제 카드 `top 12 / right 14`, 카드 맞추기(compact) `top 6 / right 8`
 * (칸 여백만 다르고 글자 크기·굵기·색은 같다).
 * 채점 전 문구는 FSRS + 농장 단계(`stage`)로 정한다(reviewTiming.js — 단계가 심은 씨앗
 * 이상이면 절대 "첫 학습"이라 하지 않고, 날짜를 모르면 비운다).
 */
const StudyTimingTag = ({
  answered = false,
  fsrs = null,
  stage = null,
  farm = null,
  wasCorrect: wasCorrectProp,
  daysToReview: daysProp,
  nextReviewIso = null,
  pending: pendingProp,
  compact = false,
  className,
}) => {
  const wasCorrect = wasCorrectProp !== undefined ? wasCorrectProp : (farm?.wasCorrect ?? null);
  const daysToReview = daysProp !== undefined ? daysProp : (farm?.days_to_review ?? null);
  // payload 가 아직 없거나 정지(pending) 상태면 응답 대기다 — 숫자가 튀지 않게 비워 둔다.
  const pending = pendingProp !== undefined ? pendingProp : (answered && (!farm || !!farm.pending));
  const place = className ?? (compact
    ? 'absolute top-[6px] right-[8px] z-[2]'
    : 'absolute top-[12px] right-[14px] z-[2]');

  // "N초/분/시간 전 학습"의 기준 시각 — 문제 진입(마운트) 순간에 고정한다. 렌더마다 new Date()
  // 를 쓰면 다른 상태 변화로 리렌더될 때마다 숫자가 바뀌며 문구가 다시 튀어나온다(key=label).
  const [enteredAt] = useState(() => new Date());

  let label = null;
  let tone = 'past';
  if (!answered) {
    label = lastStudiedLabel(fsrs, stage, enteredAt);
  } else if (wasCorrect !== false && !pending) {
    let days = typeof daysToReview === 'number' ? daysToReview : null;
    if (days == null && nextReviewIso) days = calendarDaysFromToday(nextReviewIso);
    label = nextReviewLabel(days);
    tone = 'next';
  }

  return (
    <span
      className={`pointer-events-none select-none ${place}`}
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
              block whitespace-nowrap tracking-[-0.02em] tabular-nums text-[11.5px]
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
