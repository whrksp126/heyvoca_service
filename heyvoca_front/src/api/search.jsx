import { backendUrl, fetchDataAsync } from '../utils/common';
import { getActiveLearningLang, isJa } from '../utils/lang';

/*
  단어 사전 조회 — 학습 화면에서 예문 속 영어 단어를 탭했을 때 쓰는 말풍선용.
  GET /search/word-info?word=<단어>
  응답: { code: 200, data: { query, word, pronunciation, meanings: [...], voca_id } | null }
  (data 가 null 이면 사전에 없는 단어)

  한 세션 안에서 같은 단어를 다시 탭하면 네트워크를 타지 않도록 모듈 레벨 Map 에 캐시한다.
  실패(네트워크 오류 등)는 캐시하지 않는다 — 다시 탭하면 재시도.
*/
const wordInfoCache = new Map();

// ja 는 대소문자 개념이 없고 전각 로마자 등이 섞일 수 있어 소문자화하지 않는다.
const normalizeWord = (word, lang) => {
  const s = String(word ?? '').trim();
  return isJa(lang) ? s : s.toLowerCase();
};

export const getWordInfoApi = async (word) => {
  const lang = getActiveLearningLang();
  const key = normalizeWord(word, lang);
  if (!key) return null;
  // 캐시 키에 학습 언어를 포함 — 언어 전환 뒤 같은 표기 단어가 이전 언어 결과로 뜨지 않게
  const cacheKey = `${lang}:${key}`;
  if (wordInfoCache.has(cacheKey)) return wordInfoCache.get(cacheKey);

  // fetchDataAsync 는 GET 파라미터를 인코딩하지 않으므로 여기서 직접 인코딩한다.
  const url = `${backendUrl}/search/word-info`;
  const result = await fetchDataAsync(url, 'GET', { word: encodeURIComponent(key) });
  if (!result || result.code !== 200) {
    throw new Error('getWordInfoApi 실패');
  }
  const data = result.data ?? null;
  wordInfoCache.set(cacheKey, data);
  return data;
};
