/*
  문장 조립형(sentenceArrangePartial/sentenceArrange/listenArrange) 3종이 공유하는
  순수 유틸. 계약: heyvoca_service/docs/SENTENCE_QUESTIONS_CONTRACT.md 3-1절.
*/

// 강조 마커 렌더링은 두 유형이 공유한다(questionTypes/highlightMarker.js) — 그대로 재노출.
export { stripTags, renderHighlightedText } from '../highlightMarker';

// 토큰 배열 두 개가 (대소문자 무시) 완전히 같은 순서인지 — 채점의 단일 판정 함수.
const tokensEqual = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((t, i) => String(t ?? '').trim().toLowerCase() === String(b[i] ?? '').trim().toLowerCase());
};

// 계약 §3-1 — accepted는 배열의 배열이다. "포함되는지"로 채점한다(첫 원소만 보지 않는다).
export const isAcceptedOrder = (userTokens, accepted) =>
  Array.isArray(accepted) && accepted.some((acc) => tokensEqual(userTokens, acc));

// 최종 문장 복원 — prefix + " " + 사용자가 배열한 조각들 join + " " + suffix (둘 다 없으면 공백 생략).
export const joinSentence = (prefix, tokens, suffix) => {
  const parts = [];
  if (prefix) parts.push(prefix);
  if (Array.isArray(tokens) && tokens.length > 0) parts.push(tokens.join(' '));
  if (suffix) parts.push(suffix);
  return parts.join(' ');
};
