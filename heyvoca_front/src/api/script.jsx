import { backendUrl, fetchDataAsync } from '../utils/common';

// 글자 밭(문자 학습) API — 히라가나/가타카나/알파벳 진행도·기록·건너뛰기.
// 계약(다른 에이전트가 heyvoca_back에서 같은 워크트리로 구현 중):
//   GET  /script/progress?script=hiragana|katakana|alphabet
//        → { code:200, data:{ script, items:[{char, level(0-5), correct_cnt, wrong_cnt,
//            last_studied_at, next_review_at}], due_count } }
//   POST /script/log  { script, results:[{char, correct}] }
//        → 갱신된 items
//   POST /script/skip { script, chars:[...] }  — '이미 알아요'
//
// fetchDataAsync 는 비-2xx 를 throw 하지 않고 응답을 그대로 돌려준다 → 호출부는
// res?.code === 200 을 확인한다(farm.jsx 등 기존 API 모듈과 같은 규칙).

export const getScriptProgressApi = async (script) => {
  const url = `${backendUrl}/script/progress`;
  const method = 'GET';
  const fetchData = { script };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('getScriptProgressApi 오류:', error);
  }
};

// results: [{ char, correct }] — 세션 중 글자별 첫 시도 정오답 기준 1건 이상(문제마다 보내도 됨)
export const logScriptResultsApi = async (script, results) => {
  const url = `${backendUrl}/script/log`;
  const method = 'POST';
  const fetchData = { script, results };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('logScriptResultsApi 오류:', error);
  }
};

// chars: 문자열 배열 — '이미 알아요' 확인 테스트 통과 시 일괄 마스터 처리
export const skipScriptCharsApi = async (script, chars) => {
  const url = `${backendUrl}/script/skip`;
  const method = 'POST';
  const fetchData = { script, chars };
  try {
    return await fetchDataAsync(url, method, fetchData);
  } catch (error) {
    console.error('skipScriptCharsApi 오류:', error);
  }
};
