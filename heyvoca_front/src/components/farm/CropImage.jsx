import React from 'react';
import { stageToCrop, healthToVariant, cropLabel, healthLabel } from '../../utils/crop';

/**
 * 당근 농장 V2 — 작물 그림 한 장.
 * 모든 화면은 작물을 이 컴포넌트로만 그린다. 경로 규칙을 화면마다 재구현하지 않는다.
 *
 * Vite 는 동적 경로 import 를 번들에 잡지 못하므로 glob 으로 정적 맵을 만든다.
 */
const MODULES = import.meta.glob('../../assets/images/farm/*.png', { eager: true });

const ASSET_URL = {};
Object.entries(MODULES).forEach(([path, mod]) => {
  const name = path.split('/').pop().replace(/\.png$/, '');
  ASSET_URL[name] = mod?.default || mod;
});

/** 아이템·마스코트 이미지 — 상점·마이·홈 트랙이 같이 쓴다 */
export const CROP_ASSETS = {
  shovel: ASSET_URL['item-shovel'],
  nutrient: ASSET_URL['item-nutrient'],
  shield: ASSET_URL['item-streak-shield'],
  gem: ASSET_URL['icon-gem'],
  streak: ASSET_URL['icon-streak'],
  goldenCarrot: ASSET_URL['icon-golden-carrot'],
  gem10: ASSET_URL['gem-10'],
  gem35: ASSET_URL['gem-35'],
  gem110: ASSET_URL['gem-110'],
  mascotWalk: ASSET_URL['mascot-walk'],
  mascotHouse: ASSET_URL['mascot-house'],
  mascotWatering: ASSET_URL['mascot-watering'],
  mascotSolo: ASSET_URL['mascot-solo'],
};

/** 백엔드 아이템 키 → 아이템 이미지 */
export const FARM_ITEM_ASSETS = {
  SHOVEL: CROP_ASSETS.shovel,
  NUTRIENT: CROP_ASSETS.nutrient,
  SHIELD: CROP_ASSETS.shield,
};

/**
 * 작물 이미지 URL 을 구한다.
 * 목록·상태 바처럼 작게 단독으로 쓰는 자리는 밭 배경이 없는 `solo-` 판을 쓴다.
 * 이미지가 없는 조합이면 healthy 판으로 조용히 폴백한다 — 빈 칸을 남기지 않는다.
 */
export const getCropAsset = (stage, health, { solo = true } = {}) => {
  const crop = stageToCrop(stage);
  const variant = healthToVariant(health);
  if (crop === 'golden' || variant === 'golden') return CROP_ASSETS.goldenCarrot;
  const prefix = solo ? 'solo-' : '';
  return (
    ASSET_URL[`${prefix}${variant}-${crop}`] ||
    ASSET_URL[`${prefix}healthy-${crop}`] ||
    ASSET_URL[`solo-healthy-${crop}`] ||
    CROP_ASSETS.goldenCarrot
  );
};

/**
 * @param {object} props
 * @param {string} props.stage    백엔드 visual_stage(`SPROUT` 등) 또는 crop 키(`sprout` 등)
 * @param {string} props.health   백엔드 health(`FRESH` 등). 없으면 건강한 그림
 * @param {number} props.size     한 변 px (기본 26 — 학습 상태 바 규격)
 * @param {boolean} props.solo    false 면 밭 배경이 포함된 큰 그림 판을 쓴다
 * @param {string} props.className
 * @param {string} props.alt      직접 지정하지 않으면 단계·상태 문구가 들어간다
 */
const CropImage = ({ stage, health, size = 26, solo = true, className = '', alt }) => {
  const src = getCropAsset(stage, health, { solo });
  const label = alt ?? `${cropLabel(stage)} ${healthLabel(health)}`;

  return (
    <img
      src={src}
      alt={label}
      draggable={false}
      className={`object-contain select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default CropImage;
