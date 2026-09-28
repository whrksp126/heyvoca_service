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

/*
  오답 상세 피드백(2026-09-28)의 단일 소스 — 사용자가 놓은 조각과 accepted를 비교해
  "어느 위치가 맞았는지"를 계산한다. 완전 일치하는 accepted가 있으면 그걸 기준(ref)으로
  삼고, 없으면(오답) accepted 중 가장 많이 맞은 것을 기준으로 삼는다 — 여러 accepted
  중 어떤 것과 비교해도 사용자가 이해할 수 있는 "가장 가까운 정답"을 보여주기 위함이다.
*/
const normTok = (t) => String(t ?? '').trim().toLowerCase();

export const diffAgainstAccepted = (userTokens, accepted) => {
  const list = Array.isArray(accepted) ? accepted : [];
  const tokens = Array.isArray(userTokens) ? userTokens : [];
  if (list.length === 0) {
    return { ref: tokens.map(() => ''), correctFlags: tokens.map(() => false) };
  }
  const exact = list.find((acc) =>
    Array.isArray(acc) && acc.length === tokens.length && acc.every((t, i) => normTok(t) === normTok(tokens[i])));
  let ref = exact;
  if (!ref) {
    let best = list[0];
    let bestScore = -1;
    list.forEach((acc) => {
      if (!Array.isArray(acc)) return;
      let score = 0;
      const len = Math.max(acc.length, tokens.length);
      for (let i = 0; i < len; i += 1) {
        if (normTok(acc[i]) === normTok(tokens[i])) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = acc; }
    });
    ref = best;
  }
  const correctFlags = tokens.map((t, i) => normTok(t) === normTok(ref[i]));
  return { ref, correctFlags };
};

// ref 중 사용자가 못 맞춘 위치의 정답 단어(소문자 집합) — "정답 문장" 강조용.
export const wrongRefWords = (userTokens, accepted) => {
  const { ref, correctFlags } = diffAgainstAccepted(userTokens, accepted);
  const words = new Set();
  ref.forEach((tok, i) => { if (!correctFlags[i] && tok) words.add(normTok(tok)); });
  return words;
};

/*
  평문 조각을 "단어 vs 공백/구두점"으로 나눈다(구두점은 단어에 붙여 화면에 그대로 보여주되,
  탭 판정·비교엔 clean만 쓴다). fillInTheBlank의 tokenizeWords와 같은 규칙 — 카드 안 고정
  텍스트(prefix/suffix) 사전 탭에 쓴다.
*/
const WORD_EDGE_PUNCT_RE = /^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g;
export const tokenizeWords = (text) => {
  if (!text) return [];
  return text.split(/(\s+)/).filter((t) => t !== '').map((t) => {
    if (/^\s+$/.test(t)) return { type: 'space', text: t };
    const clean = t.replace(WORD_EDGE_PUNCT_RE, '');
    return { type: clean ? 'word' : 'text', text: t, clean };
  });
};
