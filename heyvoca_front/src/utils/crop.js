/**
 * 당근 농장 V2 — 작물(crop) 도메인 상수와 매핑 유틸.
 *
 * 주의: 프론트에는 이미 `MEMORY_STATE_*`(unlearned/leaf/plant/carrot) 라는 다른 체계가 있고
 * 거기서의 `leaf` 는 **가장 낮은** 단계다. V2 의 `leaf` 는 위에서 두 번째 단계라 의미가 다르다.
 * 두 체계를 섞지 않기 위해 V2 는 `crop` 네임스페이스만 쓴다. 기존 체계는 건드리지 않는다.
 */

/** 화면에서 쓰는 작물 키 — 성장 순서 */
export const CROP_STAGES = ['seed', 'sprout', 'leaf', 'carrot', 'golden'];

/** 백엔드 visual_stage 값 */
export const VISUAL_STAGES = {
  UNPLANTED_SEED: 'UNPLANTED_SEED',
  PLANTED_SEED: 'PLANTED_SEED',
  SPROUT: 'SPROUT',
  LEAF: 'LEAF',
  CARROT: 'CARROT',
  GOLDEN: 'GOLDEN',
};

/** 백엔드 health 값 */
export const HEALTH_STATES = {
  FRESH: 'FRESH',
  THIRSTY: 'THIRSTY',
  WILTED: 'WILTED',
  CRITICAL: 'CRITICAL',
  ROTTEN: 'ROTTEN',
  GOLDEN: 'GOLDEN',
};

/**
 * 백엔드 visual_stage → 화면 crop 키.
 * UNPLANTED_SEED 와 PLANTED_SEED 는 **둘 다 seed** 다 (기획 5.1 — 홈은 4그룹 + 황금).
 * 이미 crop 키(`seed` 등)를 넘겨도 그대로 통과시킨다 — 호출부가 어느 쪽을 들고 있는지 모른다.
 */
const STAGE_TO_CROP = {
  UNPLANTED_SEED: 'seed',
  PLANTED_SEED: 'seed',
  SPROUT: 'sprout',
  LEAF: 'leaf',
  CARROT: 'carrot',
  GOLDEN: 'golden',
};

export const stageToCrop = (visualStage) => {
  if (!visualStage) return 'seed';
  const raw = String(visualStage).trim();
  const upper = raw.toUpperCase();
  if (STAGE_TO_CROP[upper]) return STAGE_TO_CROP[upper];
  const lower = raw.toLowerCase();
  if (CROP_STAGES.includes(lower)) return lower;
  return 'seed';
};

/** 화면 crop 키 → 대표 visual_stage (씨앗은 심어진 쪽을 대표값으로 둔다) */
export const cropToStage = (crop) => {
  switch (stageToCrop(crop)) {
    case 'sprout': return VISUAL_STAGES.SPROUT;
    case 'leaf': return VISUAL_STAGES.LEAF;
    case 'carrot': return VISUAL_STAGES.CARROT;
    case 'golden': return VISUAL_STAGES.GOLDEN;
    default: return VISUAL_STAGES.PLANTED_SEED;
  }
};

/** 성장 순서상 위치 (진화 판정용) */
export const cropIndex = (crop) => CROP_STAGES.indexOf(stageToCrop(crop));

/** 이전 → 이후가 실제로 단계 상승인지 */
export const isCropGrowth = (fromStage, toStage) =>
  cropIndex(toStage) > cropIndex(fromStage);

/**
 * 건강 상태 → 이미지 variant.
 * 에셋이 healthy/drying/wilted/rotten 4종뿐이라 CRITICAL 은 WILTED 와 같은 그림을 쓴다.
 * 대신 `isCritical()` 로 화면이 테두리·배경으로 구분한다.
 */
const HEALTH_TO_VARIANT = {
  FRESH: 'healthy',
  THIRSTY: 'drying',
  WILTED: 'wilted',
  CRITICAL: 'wilted',
  ROTTEN: 'rotten',
  GOLDEN: 'golden',
};

export const healthToVariant = (health) => {
  if (!health) return 'healthy';
  const upper = String(health).trim().toUpperCase();
  if (HEALTH_TO_VARIANT[upper]) return HEALTH_TO_VARIANT[upper];
  const lower = String(health).trim().toLowerCase();
  if (['healthy', 'drying', 'wilted', 'rotten', 'golden'].includes(lower)) return lower;
  return 'healthy';
};

/** 오늘 돌보지 않으면 실제로 썩는 상태 — 이미지가 시들음과 겹쳐 화면에서 따로 표시한다 */
export const isCritical = (health) =>
  String(health || '').trim().toUpperCase() === HEALTH_STATES.CRITICAL;

/** 썩은 작물만 학습 대상에서 빠진다 (다시 심기 / 회복제로 되돌린다) */
export const isStudiable = (health) =>
  String(health || '').trim().toUpperCase() !== HEALTH_STATES.ROTTEN;

/** 단계 이름 */
export const CROP_LABEL = {
  seed: '씨앗',
  sprout: '새싹',
  leaf: '이파리',
  carrot: '당근',
  golden: '황금 당근',
};

/** 단계 대표 색 (시안 확정값) */
export const CROP_COLOR = {
  seed: '#9D835A',
  sprout: '#77CE4F',
  leaf: '#38CE38',
  carrot: '#F68300',
  golden: '#E8A317',
};

/** 단계 배경색 (라이트) */
export const CROP_BG = {
  seed: '#FFFCF3',
  sprout: '#F2FFEB',
  leaf: '#EBFFEE',
  carrot: '#FFF8E8',
  golden: '#FFF8E0',
};

/** 단계 배경색 (다크) — 라이트 배경과 같은 색조를 어두운 surface 로 옮긴 값 */
export const CROP_BG_DARK = {
  seed: '#2A2419',
  sprout: '#1B2A17',
  leaf: '#162A18',
  carrot: '#2E2114',
  golden: '#2E2611',
};

/** 건강 상태 문구 — 죽음·손실 공포 뉘앙스를 쓰지 않는다 (기획 13.4) */
export const HEALTH_LABEL = {
  FRESH: '촉촉해요',
  THIRSTY: '목말라요',
  WILTED: '시들었어요',
  CRITICAL: '많이 시들었어요',
  ROTTEN: '썩었어요',
  GOLDEN: '황금이에요',
};

export const healthLabel = (health) =>
  HEALTH_LABEL[String(health || '').trim().toUpperCase()] || HEALTH_LABEL.FRESH;

export const cropLabel = (stage) => CROP_LABEL[stageToCrop(stage)];
export const cropColor = (stage) => CROP_COLOR[stageToCrop(stage)];
export const cropBg = (stage) => CROP_BG[stageToCrop(stage)];
export const cropBgDark = (stage) => CROP_BG_DARK[stageToCrop(stage)];

/** 농장 아이템 키 — 백엔드 FarmItem 값과 동일하다 */
export const FARM_ITEMS = {
  SHOVEL: 'SHOVEL',
  NUTRIENT: 'NUTRIENT',
  SHIELD: 'SHIELD',
};

/** 아이템 이름 */
export const FARM_ITEM_LABEL = {
  SHOVEL: '삽',
  NUTRIENT: '영양 회복제',
  SHIELD: '연속 학습 보호권',
};

/** 아이템 한 줄 설명 */
export const FARM_ITEM_DESC = {
  SHOVEL: '썩은 자리를 정리하고 씨앗부터 다시 심어요.',
  NUTRIENT: '지금까지 키운 단계를 그대로 두고 되살려요.',
  SHIELD: '학습을 쉬는 날에도 연속 기록을 이어줘요.',
};
