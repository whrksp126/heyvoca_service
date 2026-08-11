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

/** 단계 이름 — 밭의 **구역** 이름이다. 홈 팻말·단어장 카드가 쓴다. */
export const CROP_LABEL = {
  seed: '씨앗',
  sprout: '새싹',
  leaf: '이파리',
  carrot: '당근',
  golden: '황금 당근',
};

/* ── 단어 하나의 상태 — 기획 5.1 의 여섯 단계 ─────────────────────────
   밭은 씨앗·새싹·이파리·당근 네 구역으로만 나눈다(기획 5.1 "메인 홈은 복잡도를 줄이기
   위해 4개 그룹을 유지"). 그래서 CROP_LABEL 에는 씨앗이 하나뿐이다.

   하지만 **단어 하나**를 두고 말할 때는 그 씨앗이 둘로 갈린다.
     보유 씨앗  담아만 두고 한 번도 독립 정답을 맞히지 못했다 → 밭에 없다. 썩지도 않는다
     심은 씨앗  첫 독립 정답을 맞혀 흙에 심겼다 → 밭에 있고 물이 필요하다
   둘을 똑같이 "씨앗"이라 부르면 "왜 이건 물을 줘야 하고 저건 아닌가"에 답할 말이 없다. */
export const CROP_DETAIL_STAGES = ['unplanted', 'seed', 'sprout', 'leaf', 'carrot', 'golden'];

const STAGE_TO_DETAIL = {
  UNPLANTED_SEED: 'unplanted',
  PLANTED_SEED: 'seed',
  SPROUT: 'sprout',
  LEAF: 'leaf',
  CARROT: 'carrot',
  GOLDEN: 'golden',
};

/**
 * 백엔드 visual_stage → 여섯 단계 키.
 * **crop 키(`seed`)를 넘기면 구분이 되지 않는다** — 그건 이미 둘을 합친 값이다.
 * 반드시 visual_stage(`UNPLANTED_SEED` 등)를 넘길 것.
 */
export const stageDetail = (visualStage) => {
  const raw = String(visualStage || '').trim();
  if (STAGE_TO_DETAIL[raw.toUpperCase()]) return STAGE_TO_DETAIL[raw.toUpperCase()];
  const lower = raw.toLowerCase();
  if (CROP_DETAIL_STAGES.includes(lower)) return lower;
  return stageToCrop(visualStage);
};

export const CROP_LABEL_DETAIL = {
  unplanted: '보유 씨앗',
  seed: '심은 씨앗',
  sprout: '새싹',
  leaf: '이파리',
  carrot: '당근',
  golden: '황금 당근',
};

export const cropLabelDetail = (visualStage) => CROP_LABEL_DETAIL[stageDetail(visualStage)];

/** 아직 밭에 없는 단어인가 — 보유 씨앗 */
export const isUnplantedStage = (visualStage) => stageDetail(visualStage) === 'unplanted';

/**
 * 단계 대표 색 — 시안 13절 "성장 단계" 표 정본.
 * seed/sprout/leaf/carrot 은 기존 암기 상태 색을 그대로 승격한 값이고 golden 만 신규다.
 * (SVG fill 처럼 Tailwind 로 못 쓰는 자리에만 이 hex 를 쓰고, 나머지는 아래 클래스 맵을 쓴다.)
 */
export const CROP_COLOR = {
  seed: '#9D835A',   // 기존 unlearned
  sprout: '#77CE4F', // 기존 leaf
  leaf: '#38CE38',   // 기존 plant
  carrot: '#F68300', // 기존 carrot
  golden: '#F2B713', // 신규
};

/** 단계 색 Tailwind 클래스 — 클래스명을 문자열로 조립하면 Tailwind 가 못 찾으니 맵으로 둔다 */
export const CROP_TEXT_CLASS = {
  seed: 'text-crop-seed',
  sprout: 'text-crop-sprout',
  leaf: 'text-crop-leaf',
  carrot: 'text-crop-carrot',
  golden: 'text-crop-golden',
};

export const CROP_BG_CLASS = {
  seed: 'bg-crop-seed',
  sprout: 'bg-crop-sprout',
  leaf: 'bg-crop-leaf',
  carrot: 'bg-crop-carrot',
  golden: 'bg-crop-golden',
};

/**
 * 건강 상태 색 — 시안 13절 "건강 상태" 표 정본.
 * golden 을 뺀 5종은 기존 토큰을 그대로 재사용한다.
 */
export const HEALTH_COLOR = {
  FRESH: '#12B76A',    // status-success-600
  THIRSTY: '#2E90FA',  // secondary-blue-600
  WILTED: '#FD853A',   // secondary-yellow-500
  CRITICAL: '#FB6514', // secondary-yellow-600
  ROTTEN: '#7B7B7B',   // layout-gray-400
  GOLDEN: '#F2B713',   // 신규
};

export const HEALTH_TEXT_CLASS = {
  FRESH: 'text-health-fresh',
  THIRSTY: 'text-health-thirsty',
  WILTED: 'text-health-wilted',
  CRITICAL: 'text-health-critical',
  ROTTEN: 'text-health-rotten',
  GOLDEN: 'text-health-golden',
};

export const HEALTH_BG_CLASS = {
  FRESH: 'bg-health-fresh',
  THIRSTY: 'bg-health-thirsty',
  WILTED: 'bg-health-wilted',
  CRITICAL: 'bg-health-critical',
  ROTTEN: 'bg-health-rotten',
  GOLDEN: 'bg-health-golden',
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

/** 입력값을 HEALTH_* 키로 정규화 (없는 값이면 FRESH) */
const healthKey = (health) => {
  const upper = String(health || '').trim().toUpperCase();
  return HEALTH_STATES[upper] ? upper : HEALTH_STATES.FRESH;
};

export const healthLabel = (health) => HEALTH_LABEL[healthKey(health)];
export const healthColor = (health) => HEALTH_COLOR[healthKey(health)];
export const healthTextClass = (health) => HEALTH_TEXT_CLASS[healthKey(health)];
export const healthBgClass = (health) => HEALTH_BG_CLASS[healthKey(health)];

export const cropLabel = (stage) => CROP_LABEL[stageToCrop(stage)];
export const cropColor = (stage) => CROP_COLOR[stageToCrop(stage)];
export const cropTextClass = (stage) => CROP_TEXT_CLASS[stageToCrop(stage)];
export const cropBgClass = (stage) => CROP_BG_CLASS[stageToCrop(stage)];

/**
 * 농장 자연색 — 시안 13절 "농장 자연색" 표 정본.
 * 캔버스로 지형을 합성하는 자리(시안 16절 ①)처럼 Tailwind 를 못 쓰는 곳에서만 이 hex 를 쓴다.
 * UI 자리는 bg-farm-canvas / text-farm-ink / border-farm-line 클래스를 쓸 것.
 * grass/soil 은 일러스트 색이라 다크 모드에서도 같은 값이다 (시안 17절).
 */
export const FARM_COLOR = {
  canvas: '#FFFFFF',
  sky100: '#FBF1DE',
  grass500: '#AAD97F',
  grass300: '#CEECB2',
  soil400: '#C69465',
  soil600: '#845A34',
  ink: '#111111',
  line: '#DDDDDD',
};

/** 농장 아이템 키 — 백엔드 FarmItem 값과 동일하다 */
export const FARM_ITEMS = {
  SHOVEL: 'SHOVEL',
  NUTRIENT: 'NUTRIENT',
  SHIELD: 'SHIELD',
};

/**
 * 아이템 이름 — 상점 · 마이페이지 창고 · 학습 결과가 모두 이 하나를 쓴다.
 * 시안(shop §1·§2, mypage §4, study-result §1⑤)이 삽을 "새심기 삽"으로 부른다.
 * 화면마다 다른 이름을 쓰면 같은 물건이 두 개로 읽히므로 여기서만 정한다.
 */
export const FARM_ITEM_LABEL = {
  SHOVEL: '새심기 삽',
  NUTRIENT: '영양 회복제',
  SHIELD: '연속 학습 보호권',
};

/** 아이템 한 줄 설명 (시안 mypage §4 창고 표의 문구) */
export const FARM_ITEM_DESC = {
  SHOVEL: '썩은 작물을 씨앗부터 다시 심어요',
  NUTRIENT: '썩기 전 단계를 그대로 되살려요',
  SHIELD: '학습을 쉬는 날에도 연속 기록을 이어줘요',
};
