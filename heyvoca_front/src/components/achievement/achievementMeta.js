// src/components/achievement/achievementMeta.js
//
// 마이페이지 '나의 업적'과 업적 달성 기준 바텀시트가 같이 쓰는 값.
// 캐릭터 그림과 등급 색은 학습 결과 업적 슬라이드의 것을 그대로 가져온다
// (components/takeTest/rewards/achievement.js) — 세 화면의 메달이 같은 색이어야 한다.
import { ACHIEVEMENT_IMAGES, achievementTier } from '../takeTest/rewards/achievement';

export { ACHIEVEMENT_IMAGES, achievementTier };

/** 바텀시트 캐러셀 순서 */
export const ACHIEVEMENT_TYPES = ['초대왕', '출석왕', '노력왕', '끈기왕', '독서왕', '암기왕'];

/** 등급 이름 — 레벨 사다리의 구간 표시와 메달 아래 칩에 쓴다 */
export const TIER_LABEL = { bronze: '동', silver: '은', gold: '금', rainbow: '무지개' };

/** 무지개 등급 테두리 게이지(SVG 그라데이션)에 쓰는 색 — achievementTier('rainbow').bg 와 같은 세 색 */
export const RAINBOW_STOPS = ['var(--primary-main-600)', '#CD8DFF', '#74D5FF'];

// 레벨 글자색 — 등급 색 그대로는 흰 바탕에서 흐리다(특히 은). 라이트는 한 단계 짙게, 다크는 등급 색 그대로.
export const TIER_INK = {
  bronze: { light: '#9A6238', dark: '#E2B595' },
  silver: { light: '#6B6B6B', dark: '#D6D6D6' },
  gold: { light: '#9A7300', dark: '#F2D252' },
  rainbow: { light: '#A24BD9', dark: '#DDB0FF' },
};

/** 기준 문구에서 꼬리말 ' 달성'을 뗀다 — "학습 200회 달성" → "학습 200회" */
export const shortGoal = (text) => String(text || '').replace(/\s*달성$/, '');

/**
 * 한 업적의 현재 위치를 정리한다.
 *   level     달성한 레벨(0 = 아직 시작 전)
 *   max       기준표의 최고 레벨(기준표가 아직 없으면 0)
 *   next      다음에 달성할 레벨 정보({ level, goal, target_value, reward }) — 최고 레벨이면 null
 *   isLocked  레벨 0
 *   isMax     최고 레벨 달성
 *   ratio     테두리 게이지 채움(달성 레벨 / 최고 레벨)
 *
 * 서버는 달성한 레벨만 내려주고 현재 수치(학습 횟수 등)는 내려주지 않는다.
 * 그래서 '다음 목표까지 N'을 숫자로 계산하지 않고 다음 레벨의 기준 문구를 그대로 보여준다.
 */
export const getAchievementState = (level, levels) => {
  const list = Array.isArray(levels) ? levels : [];
  const lv = Number(level) || 0;
  const max = list.length ? Math.max(...list.map((l) => l.level)) : 0;
  const isMax = max > 0 && lv >= max;
  const next = isMax ? null : (list.find((l) => l.level === lv + 1) || null);
  return {
    level: lv,
    max,
    next,
    isLocked: lv === 0,
    isMax,
    ratio: max > 0 ? Math.min(1, lv / max) : 0,
  };
};
