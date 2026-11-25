import { backendUrl } from '../utils/common';
import { call } from './farm';

/**
 * 실험실 '내 농장 꾸미기' API (계약 4절). 기존 farm.jsx 의 call() 을 그대로 써서
 * 실패해도 throw 하지 않고 항상 { code, message, data? } 로 돌려준다.
 * 응답 본문이 {data:{...}} 로 감싸져 있든 아니든 `unwrap` 으로 평평하게 꺼낸다.
 * (api/farm.js 가 아닌 이유: 같은 이름 farm.jsx 가 이미 있어 확장자 해석이 바뀐다)
 */
export const unwrap = (res) => (res && res.data && typeof res.data === 'object' ? res.data : res);

export const getFarmStateApi = () => call(`${backendUrl}/farm/state`, 'GET', {}, 'getFarmStateApi');

export const saveFarmLayoutApi = ({ layout, version }) =>
  call(`${backendUrl}/farm/layout`, 'PUT', { layout, version }, 'saveFarmLayoutApi');

export const buyFarmItemApi = (itemId) =>
  call(`${backendUrl}/farm/shop/buy`, 'POST', { item_id: itemId }, 'buyFarmItemApi');

export const setBookCropApi = (bookId, cropType) =>
  call(`${backendUrl}/farm/books/${bookId}/crop`, 'PATCH', { crop_type: cropType }, 'setBookCropApi');
