/**
 * 직접 그린 아이템 그림(SVG) — 보석 묶음 3단계 · 카메라 · 빈 단어장 · 돌봄(물뿌리개) · 돋보기.
 * 화면은 그림 경로를 직접 import 하지 않고 여기서만 가져다 쓴다.
 */
import gemPackS from '../../assets/images/farm/gem-pack-s.svg';
import gemPackM from '../../assets/images/farm/gem-pack-m.svg';
import gemPackL from '../../assets/images/farm/gem-pack-l.svg';
import cameraArt from '../../assets/images/farm/item-camera.svg';
import emptyBookArt from '../../assets/images/farm/item-empty-book.svg';
import careArt from '../../assets/images/farm/icon-care.svg';
import searchArt from '../../assets/images/farm/icon-search.svg';

export const GEM_PACK_ART = { small: gemPackS, medium: gemPackM, large: gemPackL };
export const CAMERA_ART = cameraArt;
export const EMPTY_BOOK_ART = emptyBookArt;
/** 돌봄(물 주기) — 필터 칩·단어장 배지처럼 16~24px 로 쓰는 작은 그림이라 바닥 그림자가 없다 */
export const CARE_ART = careArt;
/** 검색 돋보기 — 위와 같은 작은 그림 */
export const SEARCH_ART = searchArt;

/**
 * 보석 상품 → 묶음 그림. 상품 데이터의 image_url(예전 하트 보석)은 쓰지 않는다.
 * 지급 수량(gem_amount)으로 단계를 고른다 — 낱개(10) · 한 줌(35) · 수확 상자(110).
 * 수량을 모르면 상품 id 끝의 숫자를 읽고, 그것도 없으면 낱개.
 */
export const gemPackArt = (product) => {
  const fromId = String(product?.product_id ?? '').match(/(\d+)\D*$/);
  const amount = Number(product?.gem_amount) || Number(fromId?.[1]) || 0;
  if (amount >= 80) return GEM_PACK_ART.large;
  if (amount >= 20) return GEM_PACK_ART.medium;
  return GEM_PACK_ART.small;
};
