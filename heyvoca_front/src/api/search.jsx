import { backendUrl, fetchDataAsync } from '../utils/common';

/*
  단어 사전 조회 — 학습 화면에서 예문 속 영어 단어를 탭했을 때 쓰는 말풍선용.
  GET /search/word-info?word=<단어>
  응답: { code: 200, data: { query, word, pronunciation, meanings: [...], voca_id } | null }
  (data 가 null 이면 사전에 없는 단어)

  한 세션 안에서 같은 단어를 다시 탭하면 네트워크를 타지 않도록 모듈 레벨 Map 에 캐시한다.
  실패(네트워크 오류 등)는 캐시하지 않는다 — 다시 탭하면 재시도.
*/
const wordInfoCache = new Map();

const normalizeWord = (word) => String(word ?? '').trim().toLowerCase();

export const getWordInfoApi = async (word) => {
  const key = normalizeWord(word);
  if (!key) return null;
  if (wordInfoCache.has(key)) return wordInfoCache.get(key);

  // fetchDataAsync 는 GET 파라미터를 인코딩하지 않으므로 여기서 직접 인코딩한다.
  const url = `${backendUrl}/search/word-info`;
  const result = await fetchDataAsync(url, 'GET', { word: encodeURIComponent(key) });
  if (!result || result.code !== 200) {
    throw new Error('getWordInfoApi 실패');
  }
  const data = result.data ?? null;
  wordInfoCache.set(key, data);
  return data;
};
