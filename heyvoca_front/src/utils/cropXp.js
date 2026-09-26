/**
 * 작물 경험치(XP) — 프론트 공용 계산.
 *
 * 정본: /private/tmp/claude-501/.../scratchpad/crop_xp_contract.md §1 (백엔드·프론트 공유 계약).
 * 백엔드 짝: `app/services/game/farm_v2/xp.py` — 필드명·공식을 그대로 맞춘다.
 *
 *   xp_raw = round(stability일 × 10)
 *   표시 XP = max(xp_raw, floor(현재 단계))   ← 오답으로 stability 가 떨어져도 단계가 안
 *     내려가듯(기획 5.2) 표시 XP 도 현재 단계 시작점 아래로 내려가지 않는다.
 *   UNPLANTED_SEED(보유 씨앗, 아직 안 심음)는 항상 0.
 *
 * 단계 문턱은 새 숫자를 여기 다시 적지 않고 `utils/common.jsx` 의 STABILITY_*_DAYS
 * (백엔드 farm_v2/constants.py 와 같은 값) × 10 으로 파생한다 — 두 곳에 숫자를 따로
 * 적으면 언젠가 한쪽만 바뀌어 밭의 작물과 표시 XP 가 다른 말을 한다.
 *
 * 【계약서 예시 수치와의 차이】 계약서 §1 은 "이파리 150 XP"라고 적었지만, 실제
 * STABILITY_LEAF_DAYS(프론트 utils/common.jsx, 백엔드 farm_v2/constants.py의
 * STAGE_LEAF_DAYS→thresholds.STABILITY_SHORT)는 둘 다 21이라 210 XP 가 맞다 — 계약서의
 * 150은 주석에 남아있던 옛 15일 값을 그대로 옮긴 오기로 보인다(백엔드 constants.py 자체의
 * 주석도 "15일"이라 적어 놓고 실제로는 21짜리 상수를 가져다 쓰는 같은 오기가 있다).
 * "새 숫자를 하드코딩하지 말라"는 계약서 자신의 지시를 따라 상수에서 파생했으므로, 백엔드가
 * 같은 상수를 쓰는 한(현재 그렇다) 숫자는 자동으로 맞는다.
 */

import { STABILITY_SPROUT_DAYS, STABILITY_LEAF_DAYS, STABILITY_CARROT_DAYS } from './common';

export const XP_PER_DAY = 10;

// 황금 당근 문턱 — farm_v2/constants.py GOLDEN_MIN_STABILITY_DAYS. farmOptimistic.js 의
// 성장 판정(stageFromStability)과 반드시 같은 값을 써야 한다 — 여기서만 들고 farmOptimistic.js
// 가 가져다 쓴다.
export const STABILITY_GOLDEN_DAYS = 180;

const VISUAL_STAGES = ['UNPLANTED_SEED', 'PLANTED_SEED', 'SPROUT', 'LEAF', 'CARROT', 'GOLDEN'];

// crop 키('seed' 등)를 받아도 동작하게 — 호출부가 어느 쪽을 들고 있는지 모른다
// (FarmStatusBar 는 visual_stage 를 우선 쓰지만 crop 키만 있는 자리도 있다).
const CROP_KEY_TO_STAGE = {
  seed: 'PLANTED_SEED', sprout: 'SPROUT', leaf: 'LEAF', carrot: 'CARROT', golden: 'GOLDEN',
};

const normalizeStage = (stage) => {
  if (!stage) return 'UNPLANTED_SEED';
  const upper = String(stage).trim().toUpperCase();
  if (VISUAL_STAGES.includes(upper)) return upper;
  const lower = String(stage).trim().toLowerCase();
  return CROP_KEY_TO_STAGE[lower] || 'UNPLANTED_SEED';
};

const STAGE_FLOOR_DAYS = {
  UNPLANTED_SEED: 0,
  PLANTED_SEED: 0,
  SPROUT: STABILITY_SPROUT_DAYS,
  LEAF: STABILITY_LEAF_DAYS,
  CARROT: STABILITY_CARROT_DAYS,
  GOLDEN: STABILITY_GOLDEN_DAYS,
};

/** 단계 시작 XP(floor) — 그 단계에 들어서는 순간의 표시 XP */
export const xpFloor = (stage) => Math.round((STAGE_FLOOR_DAYS[normalizeStage(stage)] ?? 0) * XP_PER_DAY);

/** 다음 단계 문턱 XP. 황금(최고 단계)이면 null */
export const xpNext = (stage) => {
  const here = normalizeStage(stage);
  const hereFloor = xpFloor(here);
  const idx = VISUAL_STAGES.indexOf(here);
  for (let i = idx + 1; i < VISUAL_STAGES.length; i += 1) {
    const f = xpFloor(VISUAL_STAGES[i]);
    if (f > hereFloor) return f;
  }
  return null;
};

/** `round(stability일 × 10)`. 음수·결측은 0 */
export const xpRaw = (stability) => Math.max(0, Math.round((Number(stability) || 0) * XP_PER_DAY));

/** 표시 XP = `max(xp_raw, floor(stage))`. UNPLANTED_SEED 는 항상 0 */
export const xpOf = (stage, fsrs) => {
  const s = normalizeStage(stage);
  if (s === 'UNPLANTED_SEED') return 0;
  return Math.max(xpRaw(fsrs?.stability), xpFloor(s));
};

/**
 * 단계 내 진행률(0~100, `stageProgress`/서버 `stage_progress` 와 같은 축) → 표시 XP.
 *
 * fsrs.stability 없이 pct 만 갖고 있는 자리(FarmStatusBar 가 받는 `pct_from`/`pct_to`)의
 * 최후 폴백이다 — 계약서 §2 "pct = (xp-floor)/(next-floor)*100" 의 역산. 서버가 xp_from/
 * xp_to 를 이미 내려주면 이 함수는 쓰지 않는다. golden 은 next 가 없어 비례식이 성립하지
 * 않으므로 floor 값을 그대로 돌려준다(그 이상은 fsrs.stability 없이는 못 구한다).
 */
export const xpFromPct = (stage, pct) => {
  const floor = xpFloor(stage);
  const next = xpNext(stage);
  if (next == null) return floor;
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  return Math.round(floor + (clamped / 100) * (next - floor));
};

/**
 * 채점 상태 바(FarmStatusBar) 표시용 XP 4종 — 서버 값이 있으면 그대로, 없으면
 * pct_from/pct_to 로 역산한다(게스트·재출제·구버전 응답 폴백).
 *
 * @param {string} stageFrom  채점 전 visual_stage(또는 crop 키)
 * @param {string} stageTo    채점 후 visual_stage(또는 crop 키)
 * @param {number} pctFrom    채점 전 단계 내 진행률 0~100
 * @param {number} pctTo      채점 후 단계 내 진행률 0~100
 * @param {number|null|undefined} xpFromServer
 * @param {number|null|undefined} xpToServer
 * @param {number|null|undefined} xpDeltaServer
 * @param {number|null|undefined} xpNextServer
 */
export const deriveFarmXp = ({
  stageFrom, stageTo, pctFrom, pctTo,
  xpFromServer, xpToServer, xpDeltaServer, xpNextServer,
}) => {
  const xpFromVal = xpFromServer ?? xpFromPct(stageFrom, pctFrom);
  const xpToVal = xpToServer ?? xpFromPct(stageTo, pctTo);
  const xpNextVal = xpNextServer !== undefined ? xpNextServer : xpNext(stageTo);
  const xpDeltaVal = xpDeltaServer ?? (xpToVal - xpFromVal);
  return { xpFrom: xpFromVal, xpTo: xpToVal, xpNext: xpNextVal, xpDelta: xpDeltaVal };
};

/**
 * 표시 XP → 상태 바 막대 진행률(0~100). 막대와 옆의 `현재 / 다음 XP` 숫자가 같은 말을
 * 하도록 막대도 XP 축으로 그린다 — `12 / 50 XP` 면 막대는 정확히 24%.
 * 서버 `pct_to`(stage_progress)는 심은 씨앗에서 시간 기반이라 XP 와 다른 값이 나올 수 있어
 * 숫자와 막대가 어긋났다(씨앗을 막 심으면 12 / 50 XP 인데 막대는 0%).
 * 황금(다음 문턱 없음)은 가득 찬 막대로 그린다.
 */
export const xpBarPct = (stage, xp) => {
  const floor = xpFloor(stage);
  const next = xpNext(stage);
  if (next == null) return 100;
  const span = next - floor;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((Number(xp) || 0) - floor) / span * 100));
};

/**
 * 두 단계가 같은 XP 구간을 쓰는지. 미보유 씨앗 → 심은 씨앗은 단계는 오르지만 문턱(0→50)이
 * 같아서, 막대가 100% 를 찍고 리셋하면 `0 / 50 → 12 / 50 XP` 와 어긋난 거짓 연출이 된다.
 */
export const sameXpBand = (stageA, stageB) => xpFloor(stageA) === xpFloor(stageB);
