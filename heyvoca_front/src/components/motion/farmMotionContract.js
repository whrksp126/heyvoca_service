/**
 * 헤이보카 화면과 Rive 파일 사이의 안정적인 계약.
 * 화면에서는 Rive 입력 이름을 직접 사용하지 않고 의미 기반 action만 전달한다.
 */
export const FARM_MOTION_MACHINE = 'HeyVocaFarm';
export const FARM_MOTION_VIEW_MODEL = 'HeyVocaFarmVM';

export const FARM_MOTION_ANIMATION = Object.freeze({
  idle: 'Idle',
  walk: 'Walk',
  jump: 'Jump',
  wave: 'Wave',
  earFold: 'EarFold',
});

export const FARM_MOTION_INPUT = Object.freeze({
  mood: 'mood',           // 0 neutral, 1 happy, 2 sad
  action: 'action',       // 0 idle, 1 walk, 2 jump, 3 wave, 4 ear fold
  walking: 'walking',     // boolean
  growth: 'growth',       // 0 seed, 1 sprout, 2 leaf, 3 carrot
  health: 'health',       // 0 rotten, 1 wilted, 2 drying, 3 healthy
  wind: 'wind',           // 0 ... 1
  earFold: 'earFold',     // trigger
  jump: 'jump',           // trigger
  wave: 'wave',           // trigger
});

export const FARM_MOTION_ACTION = Object.freeze({
  IDLE: 'idle',
  HAPPY: 'happy',
  SAD: 'sad',
  EARS: 'ears',
  WAVE: 'wave',
  WALK: 'walk',
  JUMP: 'jump',
  WATER: 'water',
  CELEBRATE: 'celebrate',
});

export const clampMotionValue = (value, min, max) =>
  Math.min(max, Math.max(min, Number(value) || 0));
