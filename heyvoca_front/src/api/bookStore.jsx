import { backendUrl, fetchDataAsync } from '../utils/common';

// 서점 데이터 조회 API
export const getBookStoreApi = async () => {
  const url = `${backendUrl}/search/bookstore`;
  const method = 'GET';
  const fetchData = {};
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('getBookStoreApi 오류:', error);
  }
};