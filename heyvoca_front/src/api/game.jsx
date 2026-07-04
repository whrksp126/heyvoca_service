import { backendUrl, fetchDataAsync } from '../utils/common';

// 콤보 상태 조회 (학습 진입 시 초기값)
export const getComboApi = async () => {
  const url = `${backendUrl}/game/combo`;
  try {
    return await fetchDataAsync(url, 'GET', {});
  } catch (error) {
    console.error('getComboApi 오류:', error);
  }
};

// 콤보 보호 (보석 차감 + 위기 콤보 복원)
export const protectComboApi = async () => {
  const url = `${backendUrl}/game/combo/protect`;
  try {
    return await fetchDataAsync(url, 'POST', {});
  } catch (error) {
    console.error('protectComboApi 오류:', error);
  }
};

// 콤보 포기 확정
export const forfeitComboApi = async () => {
  const url = `${backendUrl}/game/combo/forfeit`;
  try {
    return await fetchDataAsync(url, 'POST', {});
  } catch (error) {
    console.error('forfeitComboApi 오류:', error);
  }
};
