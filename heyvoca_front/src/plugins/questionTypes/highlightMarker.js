/*
  강조 마커(<strong class="target-word">…</strong>) 공용 유틸 — 사전이 예문 안의 목표 단어를
  표시할 때 쓰는 단일 규칙(백엔드 app/utils/example_tagging.py와 짝). fillInTheBlank,
  sentenceArrange 계열(3종), fillInTheBlankTyping이 모두 이 마커가 붙은 ko/answer_text를 받는다.

  FillInTheBlankQuestion.jsx는 이 파일이 생기기 전부터 자기 파일 안에 같은 로직을 직접 들고
  있다(중복) — 이미 동작 중인 코드라 이번 작업 범위에서는 건드리지 않는다.
*/
const TARGET_WORD_RE = /<strong\b[^>]*\btarget-word\b[^>]*>([\s\S]*?)<\/strong\s*>/gi;

export const stripTags = (html) => String(html ?? '').replace(/<[^>]*>/g, '');

/**
 * 강조 마커 안쪽만 hl:true로 표시하는 조각 배열로 나눈다. 렌더링은 호출부가 담당한다
 * (JSX를 직접 만들지 않는 이유: 호출부마다 강조 색·굵기 토큰이 달라질 수 있어서).
 * 반환: [{ key, text, hl }] | null
 */
export const renderHighlightedText = (html) => {
  if (!html) return null;
  const parts = [];
  let lastIndex = 0;
  let match;
  const re = new RegExp(TARGET_WORD_RE.source, 'gi');
  while ((match = re.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ key: `t-${lastIndex}`, text: stripTags(html.slice(lastIndex, match.index)), hl: false });
    }
    parts.push({ key: `h-${match.index}`, text: stripTags(match[1]), hl: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < html.length) {
    parts.push({ key: `t-${lastIndex}`, text: stripTags(html.slice(lastIndex)), hl: false });
  }
  return parts;
};
