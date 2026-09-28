/*
  한국어 문장을 "탭 가능한 어절" 단위로 나눈다(문장 만들기/빈칸 채우기 위쪽 한국어 예문 카드
  전용) — fillInTheBlank의 영어 tokenizeWords와 같은 역할이지만 한글을 보존한다.
  조사가 붙은 어절 전체(clean)를 그대로 서버(?from=ko&q=)에 넘긴다 — 형태소 매칭은 서버가 한다.
  양 끝 구두점(따옴표·마침표 등)만 제거한다.
*/
const EDGE_PUNCT_RE = /^[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]+|[^가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9]+$/g;

export const tokenizeKoreanWords = (text) => {
  if (!text) return [];
  return text.split(/(\s+)/).filter((t) => t !== '').map((t) => {
    if (/^\s+$/.test(t)) return { type: 'space', text: t };
    const clean = t.replace(EDGE_PUNCT_RE, '');
    return { type: clean ? 'word' : 'text', text: t, clean };
  });
};

/*
  강조 마커로 나뉜 조각 배열([{text, hl}, ...] — questionTypes/highlightMarker.js의
  renderHighlightedText 반환값)을 어절 토큰으로 펼친다. 각 토큰은 자신이 속한 조각의
  hl 플래그를 그대로 물려받는다(조각 경계에서 어절이 잘리는 드문 경우는 표시상 근사치로 둔다).
*/
export const tokenizeKoreanParts = (parts) => {
  if (!Array.isArray(parts)) return [];
  const out = [];
  parts.forEach((p, pi) => {
    tokenizeKoreanWords(p.text).forEach((tok, ti) => {
      out.push({ ...tok, hl: !!p.hl, key: `${pi}-${ti}` });
    });
  });
  return out;
};
