/*
  채점 직후 상태 바에 쓸 **낙관적 농장 payload**.

  【왜 필요한가】 상태 바의 정본은 `/study/log` 응답의 `data.farm` 이다. 그런데 그 값을
  받지 못하는 자리가 셋 있다.
    · 게스트 온보딩 — 세션이 없어 로그를 아예 보내지 않는다
    · 재출제 문제   — 첫 시도만 기록하므로 로그를 보내지 않는다
    · 로그인 첫 시도의 응답 대기 구간 — 요청이 오가는 동안
  예전에는 이 세 경우에 상태 바 대신 **구버전 UI**(암기상태 배지 + 'N일 후 복습 예정' pill)로
  폴백했다. 같은 세션에서 같은 단어가 두 얼굴로 채점되는 셈이라 폴백을 전부 걷어냈고,
  그러려면 어느 경우에도 그릴 값이 있어야 한다. 여기서 그 값을 만든다.

  【서버가 이기게 한다】 여기서 만든 값은 응답이 도착하면 그대로 덮인다. 추정이 틀려도
  한 프레임 뒤 정정되므로, 정확도보다 **절대 이상한 그림을 그리지 않는 것**을 우선한다.

  【백엔드와 같은 계산】 단계와 진행률 공식은 `farm_v2/growth.py::stage_from_stability` ·
  `farm_v2/answer.py::stage_progress` 를 그대로 옮긴 것이다. 경계값은 common.jsx 에서
  가져오므로(백엔드 fsrs/thresholds.py 와 같은 값) 숫자가 갈릴 일은 없다.
*/

import {
  STABILITY_SPROUT_DAYS, STABILITY_LEAF_DAYS, STABILITY_CARROT_DAYS,
} from './common';

// 황금 당근 문턱 — farm_v2/constants.py GOLDEN_MIN_STABILITY_DAYS
const STABILITY_GOLDEN_DAYS = 180;

const STAGE_RANK = {
  UNPLANTED_SEED: 0, PLANTED_SEED: 1, SPROUT: 2, LEAF: 3, CARROT: 4, GOLDEN: 5,
};

const STAGE_TO_CROP = {
  UNPLANTED_SEED: 'seed', PLANTED_SEED: 'seed', SPROUT: 'sprout',
  LEAF: 'leaf', CARROT: 'carrot', GOLDEN: 'golden',
};

const isNewFsrs = (fsrs) => !fsrs || !fsrs.state || fsrs.state === 'new';

const pct = (num, den) => (den > 0
  ? Math.max(0, Math.min(100, Math.round((num / den) * 100)))
  : 0);

/** 다음 복습 간격만으로 정해지는 단계. 씨앗 구간이면 null — 심었는지는 따로 정한다. */
const stageFromStability = (stability) => {
  const s = Number(stability) || 0;
  if (s >= STABILITY_CARROT_DAYS) return 'CARROT';
  if (s >= STABILITY_LEAF_DAYS) return 'LEAF';
  if (s >= STABILITY_SPROUT_DAYS) return 'SPROUT';
  return null;
};

/**
 * 단계 안에서 다음 단계까지의 진행률 0~100.
 * 백엔드 `stage_progress` 와 같은 축(다음 복습 간격)으로 잰다.
 */
export const stageProgress = (stage, fsrs) => {
  const s = Number(fsrs?.stability) || 0;
  if (stage === 'GOLDEN') return 100;
  if (stage === 'UNPLANTED_SEED') return 0;
  if (stage === 'PLANTED_SEED') return pct(s, STABILITY_SPROUT_DAYS);
  if (stage === 'SPROUT') return pct(s - STABILITY_SPROUT_DAYS, STABILITY_LEAF_DAYS - STABILITY_SPROUT_DAYS);
  if (stage === 'LEAF') return pct(s - STABILITY_LEAF_DAYS, STABILITY_CARROT_DAYS - STABILITY_LEAF_DAYS);
  return pct(s - STABILITY_CARROT_DAYS, STABILITY_GOLDEN_DAYS - STABILITY_CARROT_DAYS);
};

/**
 * 학습 전 단계 추정.
 *
 * `base`(이 단어의 마지막 서버 payload)가 있으면 무조건 그걸 쓴다 — 보유 씨앗과 심은 씨앗은
 * FSRS 로 구분되지 않아 저장값만이 답을 안다.
 */
const stageBefore = (base, fsrs) => {
  if (base?.stage) return base.stage;
  if (isNewFsrs(fsrs)) return 'UNPLANTED_SEED';
  return stageFromStability(fsrs?.stability) ?? 'PLANTED_SEED';
};

/**
 * 채점 1건 → 상태 바 payload.
 *
 * @param {object}  base        이 단어의 마지막 서버 payload (없으면 undefined)
 * @param {object}  fsrsBefore  채점 전 FSRS
 * @param {object}  fsrsAfter   채점 후 FSRS(낙관 추정)
 * @param {boolean} wasCorrect
 * @param {boolean} isRetry     재출제 여부 — 성장도 진행도 없다
 * @param {number|null} daysToReview
 */
export const optimisticFarmPayload = ({
  base, fsrsBefore, fsrsAfter, wasCorrect, isRetry = false, daysToReview = null,
}) => {
  const from = stageBefore(base, fsrsBefore);

  /*
    재출제는 방금 본 정답을 확인한 것이라 독립 회상이 아니다(기획 5.2).
    백엔드도 단계를 올리지 않으므로 화면도 올리지 않는다 — 막대까지 제자리에 세운다.
    여기서 다시 채우면 화면만 성장을 약속하게 된다.
  */
  if (isRetry) {
    const held = base?.pct_to ?? stageProgress(from, fsrsBefore);
    return {
      crop: STAGE_TO_CROP[from], stage: from,
      crop_from: STAGE_TO_CROP[from], stage_from: from,
      grew: false, pct_from: held, pct_to: held,
      health: base?.health ?? 'FRESH',
      days_to_review: daysToReview,
      wasCorrect: !!wasCorrect,
    };
  }

  let to = from;
  if (wasCorrect) {
    const byStability = stageFromStability(fsrsAfter?.stability);
    if (byStability && STAGE_RANK[byStability] > STAGE_RANK[from]) {
      to = byStability;
    } else if (from === 'UNPLANTED_SEED') {
      // 첫 독립 정답 = 씨앗 심기. 첫 정답의 간격은 3일 남짓이라 어떤 문턱으로도
      // 심기와 발아를 가를 수 없어, 이것만 간격이 아니라 '맞혔는가'로 정한다.
      to = 'PLANTED_SEED';
    }
  }
  // 오답으로는 단계가 내려가지 않는다(기획 5.2) — from 그대로 둔다.

  return {
    crop: STAGE_TO_CROP[to], stage: to,
    crop_from: STAGE_TO_CROP[from], stage_from: from,
    grew: STAGE_RANK[to] > STAGE_RANK[from],
    pct_from: stageProgress(from, fsrsBefore),
    pct_to: stageProgress(to, fsrsAfter),
    health: base?.health ?? 'FRESH',
    days_to_review: daysToReview,
    wasCorrect: !!wasCorrect,
  };
};
