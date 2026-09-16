import React from 'react';
import { stageToCrop, healthToVariant, cropLabel, healthLabel } from '../../utils/crop';

/**
 * 당근 농장 V2 — 작물 그림 한 장.
 * 모든 화면은 작물을 이 컴포넌트로만 그린다. 경로 규칙을 화면마다 재구현하지 않는다.
 *
 * 【에셋 규격】
 *   · 전부 512×512 RGBA. 불투명 영역의 수평 중심 x=256, **바닥 기준선 y=440**(= 85.9375%).
 *     바닥선은 접지 그림자의 아래끝이다 — 그 지점이 심는 자리에 온다.
 *   · 단계별 상대 크기가 그림 안에 이미 들어 있다. 화면은 **모든 단계를 같은 정사각형에
 *     그대로 넣기만 하면 된다** — 예전에는 단계마다 높이를 따로 주다가 씨앗이 당근만 해졌다.
 *   · 배치(placement)가 두 벌이다.
 *       planted/    밭에서 자라는 중 — 밭과 성장 경로가 쓴다
 *       unplanted/  뽑아낸 판       — 목록·칩·헤더처럼 작물만 필요한 자리
 *       bare/       낱알 씨앗       — 흙도 봉투도 없는 씨앗 한 알(씨앗 단계만)
 *     씨앗만은 planted/unplanted 가 배경 차이가 아니라 **서로 다른 상태**다(기획 5.1) —
 *       unplanted/…-seed  씨앗 봉투 = 보유 씨앗(아직 안 심음)
 *       planted/…-seed    막 돋은 싹 = 심은 씨앗
 *
 *   planted/ 은 **V5**(carrot-farm-crop-assets-service-v5)다. V3 와 달리 흙 원판이 없고
 *   작물과 옅은 접지 그림자만 있다 — 밭 바닥이 이미 흙이라 원판이 얼룩으로 보였다.
 *   따라서 화면에서 흙이나 타원을 따로 덧그리지 않는다.
 *   V5 원본은 셀마다 세로 가운데 정렬이라 바닥이 330~421 로 제각각이었다. 앱 에셋은
 *   **세로로 평행이동만 해서**(확대·자르기 없음) 바닥을 440 으로 맞춰 넣었다.
 *   건강한 판 기준 크기: 씨앗 32×24 · 새싹 172×161 · 이파리 329×296 · 당근 359×371.
 *   unplanted/ 와 bare/ 는 아직 V3 계열이다.
 *
 * Vite 는 동적 경로 import 를 번들에 잡지 못하므로 glob 으로 정적 맵을 만든다.
 */
const PLANTED_MODULES = import.meta.glob('../../assets/images/farm/crops/planted/*.png', { eager: true });
const UNPLANTED_MODULES = import.meta.glob('../../assets/images/farm/crops/unplanted/*.png', { eager: true });
/* 낱알 씨앗 — 봉투도 흙도 없이 밭 위에 놓인 한 알. 씨앗 단계에만 있다.
   밭을 흙 없는 그림으로 그릴 때(soloCrops) 봉투를 쓰면 밭 밖 '보유 씨앗' 간판과
   똑같은 그림이 밭 안에 서 버려서, 심은 씨앗인지 안 심은 씨앗인지 구분이 사라진다. */
const BARE_MODULES = import.meta.glob('../../assets/images/farm/crops/bare/*.png', { eager: true });
const MODULES = import.meta.glob('../../assets/images/farm/*.png', { eager: true });

const toMap = (modules) => {
  const out = {};
  Object.entries(modules).forEach(([path, mod]) => {
    out[path.split('/').pop().replace(/\.png$/, '')] = mod?.default || mod;
  });
  return out;
};

const ASSET_URL = toMap(MODULES);
const PLANTED = toMap(PLANTED_MODULES);
const UNPLANTED = toMap(UNPLANTED_MODULES);
const BARE = toMap(BARE_MODULES);

/** 작물 그림의 바닥 기준선 — 이미지 높이 대비 비율. 밭에 심을 때 이 지점을 심는 자리에 맞춘다. */
export const CROP_BASELINE = 440 / 512;

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
  seedPacket: UNPLANTED['healthy-seed'],
};

/** 백엔드 아이템 키 → 아이템 이미지 */
export const FARM_ITEM_ASSETS = {
  SHOVEL: CROP_ASSETS.shovel,
  NUTRIENT: CROP_ASSETS.nutrient,
  SHIELD: CROP_ASSETS.shield,
};

/**
 * 작물 이미지 URL 을 구한다.
 *
 * @param {string} stage   visual_stage(`UNPLANTED_SEED` 등) 또는 crop 키(`sprout` 등)
 * @param {string} health  백엔드 health. 없으면 건강한 그림
 * @param {boolean} opts.solo  true(기본)면 뽑아낸 판, false 면 흙에 심긴 판
 *
 * 【씨앗 예외】 solo 로 그리더라도 **심은 씨앗은 봉투를 쓰지 않는다.**
 * 봉투는 "아직 안 심음"이라는 뜻이라, 이미 심은 단어에 봉투를 그리면 목록에서
 * 보유 씨앗과 구분이 사라진다. 이 구분은 `PLANTED_SEED` 를 넘겨야만 산다 —
 * crop 키('seed')는 두 상태를 합친 값이라 어느 쪽인지 알 수 없고, 그럴 때는 봉투를 쓴다.
 * 그런 자리는 대개 "심을 씨앗 N개"처럼 아직 심기 전을 말한다.
 *
 * 심은 씨앗에 쓰는 그림은 **낱알(bare)**이다. V5 의 planted 씨앗은 512 캔버스에서 32px
 * 밖에 안 되는 갓 돋은 싹이라, 26~30px 로 그리는 목록·팻말에서는 2px 점이 되어 사라진다.
 * 낱알(102px)은 같은 크기에서 읽히고 봉투와도 구분된다.
 */
export const getCropAsset = (stage, health, { solo = true } = {}) => {
  const crop = stageToCrop(stage);
  const variant = healthToVariant(health);
  if (crop === 'golden' || variant === 'golden') return CROP_ASSETS.goldenCarrot;

  const plantedSeed = crop === 'seed' && String(stage || '').trim().toUpperCase() === 'PLANTED_SEED';
  if (solo && plantedSeed) {
    return BARE[`${variant}-seed`] || BARE['healthy-seed'] || PLANTED['healthy-seed'];
  }
  const set = solo ? UNPLANTED : PLANTED;
  return (
    set[`${variant}-${crop}`] ||
    set[`healthy-${crop}`] ||
    UNPLANTED[`healthy-${crop}`] ||
    CROP_ASSETS.goldenCarrot
  );
};

/**
 * 그림 variant(healthy/drying/wilted/rotten)를 **직접** 지정해 에셋을 고른다.
 * 밭(FarmField)은 건강 상태 하나가 아니라 밭 전체의 분포를 나눠 심으므로,
 * 작물마다 어떤 variant 를 쓸지 이미 정해 놓고 부른다.
 *
 * 기본은 흙이 딸린 그림(PLANTED)이다. `solo` 를 켜면 흙 없는 그림을 쓰는데,
 * 밭 바닥이 이미 흙인 자리에서는 흙 딸린 그림이 작물마다 어두운 자국을 남겨
 * 얼룩처럼 보이기 때문이다(FarmField 의 `soloCrops`).
 *
 * 【씨앗은 봉투가 아니라 낱알】 solo 의 씨앗은 UNPLANTED(봉투)가 아니라 BARE(낱알)다.
 * 봉투는 밭 **밖** 간판이 쓰는 그림이라 밭 안에 세우면 같은 그림이 두 뜻을 갖고,
 * 봉투는 새싹보다 커서(233 vs 164) 밭 위에 뜬 것처럼도 보인다.
 */
export const cropAssetByVariant = (stage, variant, { solo = false } = {}) => {
  const crop = stageToCrop(stage);
  if (solo && crop === 'seed') {
    return BARE[`${variant}-seed`] || BARE['healthy-seed'] || UNPLANTED['healthy-seed'];
  }
  const set = solo ? UNPLANTED : PLANTED;
  return set[`${variant}-${crop}`] || set[`healthy-${crop}`] || CROP_ASSETS.goldenCarrot;
};

/**
 * QA §A.1 — 정사각형 칸(밭이 아닌 자리)에서 작물을 세로 가운데로 맞추는 상수.
 *
 * 에셋은 전부 512² 에 **바닥선 y=440** 기준이라, 목록·칩·상세 상단처럼 정사각형 칸에
 * 그대로 넣으면 작은 단계(씨앗·새싹)일수록 칸 아래쪽에 깔린다. 에셋을 고치는 대신
 * img 에 CSS transform 만 준다 — 실측 바운딩박스(알파>40) 기준 내용물의 세로 중심(cy,
 * 512 기준 px)과 확대 배율(scale)이다.
 *
 *   공식: translateY(%) = -scale × (cy - 256) / 512
 *
 * golden(황금 당근)은 이 표에 없다 — icon-golden-carrot.png 는 이미 꽉 찬 그림이라
 * 변환이 필요 없다. solo=false(밭에 심긴 판)에도 적용하지 않는다 — 그쪽은 흙 위 배치가
 * 이미 다른 좌표계(FarmField)를 쓴다.
 */
const ALIGN_CENTER_TRANSFORM = {
  envelopeSeed: { scale: 1, cy: 323 },   // 봉투(UNPLANTED healthy-seed) — 미학습
  bareSeed: { scale: 1.6, cy: 397 },     // 낱알(BARE seed) — 씨앗(심은 것)
  sprout: { scale: 1.2, cy: 358 },       // 새싹(UNPLANTED sprout)
  leaf: { scale: 1, cy: 276 },           // 이파리(UNPLANTED leaf)
  carrot: { scale: 1, cy: 245 },         // 당근(UNPLANTED carrot)
};

/**
 * align="center" 가 쓸 변환 키를 고른다 — getCropAsset 이 실제로 고르는 에셋(봉투/낱알
 * 등)과 반드시 같은 판정이어야 한다. 다르면 낱알 그림에 봉투용 변환을 씌우는 식으로 어긋난다.
 */
const alignCenterKey = (stage, health, solo) => {
  if (!solo) return null;
  const crop = stageToCrop(stage);
  const variant = healthToVariant(health);
  if (crop === 'golden' || variant === 'golden') return null;
  if (crop === 'seed') {
    const planted = String(stage || '').trim().toUpperCase() === 'PLANTED_SEED';
    return planted ? 'bareSeed' : 'envelopeSeed';
  }
  if (crop === 'sprout' || crop === 'leaf' || crop === 'carrot') return crop;
  return null;
};

/**
 * @param {object} props
 * @param {string} props.stage    백엔드 visual_stage(`SPROUT` 등) 또는 crop 키(`sprout` 등)
 * @param {string} props.health   백엔드 health(`FRESH` 등). 없으면 건강한 그림
 * @param {number} props.size     한 변 px (기본 26 — 학습 상태 바 규격).
 *                                에셋이 정사각형이고 단계별 크기가 그림에 들어 있어
 *                                모든 단계에 같은 값을 주면 된다.
 * @param {boolean} props.solo    false 면 흙에 심긴 판을 쓴다
 * @param {'bottom'|'center'} props.align  'bottom'(기본) 은 현행 그대로. 'center' 는 밭이
 *                                아닌 **정사각형 칸**(목록 행·칩·상세 상단 등)에서 써서
 *                                작은 단계가 칸 아래에 깔리지 않고 가운데로 맞춰지게 한다.
 * @param {string} props.className
 * @param {string} props.alt      직접 지정하지 않으면 단계·상태 문구가 들어간다
 */
const CropImage = ({ stage, health, size = 26, solo = true, align = 'bottom', className = '', alt }) => {
  const src = getCropAsset(stage, health, { solo });
  const label = alt ?? `${cropLabel(stage)} ${healthLabel(health)}`;

  const style = { width: size, height: size };
  if (align === 'center') {
    const key = alignCenterKey(stage, health, solo);
    const cfg = key ? ALIGN_CENTER_TRANSFORM[key] : null;
    if (cfg) {
      const translateY = (-cfg.scale * (cfg.cy - 256)) / 512 * 100;
      style.transform = `translateY(${translateY.toFixed(2)}%) scale(${cfg.scale})`;
      style.transformOrigin = 'center';
    }
  }

  return (
    <img
      src={src}
      alt={label}
      draggable={false}
      className={`object-contain select-none ${className}`}
      style={style}
    />
  );
};

export default CropImage;
