import { backendUrl, fetchDataAsync } from '../utils/common';

// 실험실 기능 상태 모듈 캐시 — 앱 시작 시 prefetch로 채워두면
// 실험실 화면을 열 때 네트워크 대기 없이 즉시 올바른 토글 상태를 보여준다.
let _labFeaturesCache = null; // { chat_study: bool, ... } | null

const _extractFeatures = (result) => result?.data?.features || result?.features || null;

// 캐시된 실험실 기능 상태(없으면 null). 화면 초기 state로 사용.
export const getCachedLabFeatures = () => _labFeaturesCache;

// 실험실 기능 설정 조회 (features: { chat_study: bool, ... })
export const getLabSettingsApi = async () => {
  const url = `${backendUrl}/lab/settings`;
  try {
    const result = await fetchDataAsync(url, 'GET', {});
    const features = _extractFeatures(result);
    if (features) _labFeaturesCache = features;
    return result;
  } catch (error) {
    console.error('getLabSettingsApi 오류:', error);
    throw error;
  }
};

// 앱 시작(로그인 이후) 시 한 번 호출해 캐시를 미리 채운다. 실패는 조용히 무시(best-effort).
export const prefetchLabSettings = async () => {
  try {
    await getLabSettingsApi();
  } catch (e) {
    /* best-effort: 실패해도 실험실 화면에서 다시 조회한다 */
  }
};

// 실험실 기능 on/off 변경. 갱신된 features 전체를 반환하고 캐시도 갱신.
export const setLabFeatureApi = async (feature, enabled) => {
  const url = `${backendUrl}/lab/settings`;
  try {
    const result = await fetchDataAsync(url, 'PUT', { feature, enabled });
    const features = _extractFeatures(result);
    if (features) _labFeaturesCache = features;
    return result;
  } catch (error) {
    console.error('setLabFeatureApi 오류:', error);
    throw error;
  }
};
