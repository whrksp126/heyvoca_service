import { backendUrl, fetchDataAsync } from '../utils/common';

// 서점 데이터 조회 API
export const getBookStoreApi = async () => {
  const url = `${backendUrl}/search/bookstore`;
  const method = 'GET';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  } catch (error) {
    console.error('getBookStoreApi 오류:', error);
  }
};

// 서점 상세 데이터 조회 API
export const getBookStoreDetailApi = async (id) => {
  const url = `${backendUrl}/search/bookstore/${id}`;
  const method = 'GET';
  const fetchData = {};
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  } catch (error) {
    console.error('getBookStoreDetailApi 오류:', error);
  }
};

// 추천 서점 단어장 조회 API
export const getRecommendedBookStoreApi = async (limit = 3) => {
  const url = `${backendUrl}/search/bookstore/recommend`;
  const method = 'GET';
  const fetchData = { limit };
  try {
    const result = await fetchDataAsync(url, method, fetchData);
    return result;
  } catch (error) {
    console.error('getRecommendedBookStoreApi 오류:', error);
  }
};
