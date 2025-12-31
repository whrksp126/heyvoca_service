import { backendUrl, fetchDataAsync } from '../utils/common';
import { getDevicePlatform } from '../utils/osFunction';

// 서점 데이터 조회 API
export const getGemItemsApi = async () => {
  const url = `${backendUrl}/mainpage/products`;
  const method = 'GET';
  const fetchData = {
    platform: getDevicePlatform(),
  };
  try{
    const result = await fetchDataAsync(url, method, fetchData);
    return result
  }catch(error){
    console.error('getGemItemsApi 오류:', error);
  }
}