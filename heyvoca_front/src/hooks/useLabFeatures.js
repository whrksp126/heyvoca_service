import { useEffect, useState } from 'react';
import { getCachedLabFeatures, subscribeLabFeatures } from '../api/lab';

// 실험실 기능 상태(features 객체)를 구독한다. 캐시가 비어 있으면 {}.
// 조회 자체는 하지 않는다 — 홈 진입 시 prefetchLabSettings, 실험실 화면 진입/토글이 캐시를 채운다.
const useLabFeatures = () => {
  const [features, setFeatures] = useState(() => getCachedLabFeatures() || {});
  useEffect(() => {
    // 마운트 사이에 캐시가 바뀌었을 수 있으니 한 번 맞춘다.
    const cached = getCachedLabFeatures();
    if (cached) setFeatures(cached);
    return subscribeLabFeatures((next) => setFeatures(next || {}));
  }, []);
  return features;
};

export default useLabFeatures;
