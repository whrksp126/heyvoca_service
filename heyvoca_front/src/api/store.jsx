import { backendUrl, fetchDataAsync } from '../utils/common';
import { getDevicePlatform } from '../utils/osFunction';

// 서점 데이터 조회 API
export const getGemItemsApi = async () => {
  const url = `${backendUrl}/mainpage/products`;
  const method = 'GET';
  const fetchData = {
    platform: getDevicePlatform(),
  };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  } catch (error) {
    console.error('getGemItemsApi 오류:', error);
  }
}

// 빈 단어장 구매 API (단가 3보석/개, amount 정수 전달)
export const purchaseBookApi = async (amount) => {
  const url = `${backendUrl}/purchase/book`;
  const method = 'POST';
  const fetchData = { amount };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('purchaseBookApi 오류:', error);
  }
}

// 보석 적립/사용 내역 조회 API (GemLog, amount 부호로 적립/사용 구분)
export const getGemHistoryApi = async (page = 1, perPage = 20) => {
  const url = `${backendUrl}/purchase/gem-history`;
  const method = 'GET';
  const fetchData = { page, per_page: perPage };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('getGemHistoryApi 오류:', error);
  }
}