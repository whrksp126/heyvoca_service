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

// ─── 당근 농장 ───────────────────────────────────────────────

// 농장 전체 (밭 그리드) — 식물 목록 + 요약 + 부활템/보석
export const getFarmApi = async () => {
  const url = `${backendUrl}/game/farm`;
  try {
    return await fetchDataAsync(url, 'GET', {});
  } catch (error) {
    console.error('getFarmApi 오류:', error);
  }
};

// 홈 요약 카드용 — 카운트 + 부활템/보석
export const getFarmSummaryApi = async () => {
  const url = `${backendUrl}/game/farm/summary`;
  try {
    return await fetchDataAsync(url, 'GET', {});
  } catch (error) {
    console.error('getFarmSummaryApi 오류:', error);
  }
};

// 부활템 1개로 죽은 단어 1개 부활
export const reviveFarmApi = async (userVocaId) => {
  const url = `${backendUrl}/game/farm/revive`;
  try {
    return await fetchDataAsync(url, 'POST', { user_voca_id: userVocaId });
  } catch (error) {
    console.error('reviveFarmApi 오류:', error);
  }
};

// 보석으로 부활템 구매 (1보석=5개)
export const buyReviveApi = async () => {
  const url = `${backendUrl}/game/farm/buy-revive`;
  try {
    return await fetchDataAsync(url, 'POST', {});
  } catch (error) {
    console.error('buyReviveApi 오류:', error);
  }
};
