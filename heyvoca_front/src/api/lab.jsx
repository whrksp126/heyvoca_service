import { backendUrl, fetchDataAsync } from '../utils/common';

// 실험실 기능 설정 조회 (features: { chat_study: bool, ... })
export const getLabSettingsApi = async () => {
  const url = `${backendUrl}/lab/settings`;
  const method = 'GET';
  const fetchData = {};
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getLabSettingsApi 오류:', error);
    throw error;
  }
};

// 실험실 기능 on/off 변경. 갱신된 features 전체를 반환.
export const setLabFeatureApi = async (feature, enabled) => {
  const url = `${backendUrl}/lab/settings`;
  const method = 'PUT';
  const fetchData = { feature, enabled };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('setLabFeatureApi 오류:', error);
    throw error;
  }
};
