import { backendUrl, fetchDataAsync } from '../utils/common';

// 글자 밭(문자 학습) API — 히라가나/가타카나/알파벳 진행도·세션 시작. 2026-09-30 계약(백엔드
// 동시 구현):
//   POST /script/ensure  { script }
//       → 글자장(단어장)이 없으면 생성(멱등). 응답 = progress 모양.
//   GET  /script/progress?script=hiragana|katakana|alphabet
//       → { code:200, data:{ book_id, items:[{char, user_voca_id, stage, health, xp,
//           fsrs:{state,next_review,last_review}, due}], due_count, learned_count } }
//   GET  /script/session?script=&mode=learn|review&chars=あ,い,...
//       → GET /study/recommend 와 같은 응답 모양(session_id, items[](user_voca_id, word=글자,
//           meanings, fsrs …)) — utils/scriptData.js mapScriptSessionItem 으로 그대로 매핑한다.
//
// 기록(정답/오답)은 별도 엔드포인트가 없다 — 기존 /study/log(api/study.jsx logStudyQuestion)를
// 그대로 쓴다(pages/TakeTest.jsx·components/takeTest/Main.jsx 가 이미 하던 경로).
//
// fetchDataAsync 는 비-2xx 를 throw 하지 않고 응답을 그대로 돌려준다 → 호출부는
// res?.code === 200 을 확인한다(farm.jsx 등 기존 API 모듈과 같은 규칙).

export const ensureScriptApi = async (script) => {
  const url = `${backendUrl}/script/ensure`;
  try {
    return await fetchDataAsync(url, 'POST', { script });
  } catch (error) {
    console.error('ensureScriptApi 오류:', error);
  }
};

export const getScriptProgressApi = async (script) => {
  const url = `${backendUrl}/script/progress`;
  try {
    return await fetchDataAsync(url, 'GET', { script });
  } catch (error) {
    console.error('getScriptProgressApi 오류:', error);
  }
};

// mode: 'learn' | 'review'. chars: 문자열 배열(그 줄 또는 복습 대상 글자들).
export const getScriptSessionApi = async (script, mode, chars) => {
  const url = `${backendUrl}/script/session`;
  const fetchData = { script, mode, chars: Array.isArray(chars) ? chars.join(',') : chars };
  try {
    return await fetchDataAsync(url, 'GET', fetchData);
  } catch (error) {
    console.error('getScriptSessionApi 오류:', error);
  }
};
