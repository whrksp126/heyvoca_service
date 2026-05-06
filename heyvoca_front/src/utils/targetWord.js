// 강조 마크업을 헤이보카 표준 형식(<strong class="target-word">)으로 정규화한다.
// 백엔드의 _normalize_target_word(voca_books.py)와 동일한 규칙.

const OPEN = 'TWOPEN';
const CLOSE = 'TWCLOSE';

const decodeEntities = (() => {
  if (typeof document === 'undefined') {
    return (s) => s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
  const el = document.createElement('textarea');
  return (s) => {
    el.innerHTML = s;
    return el.value;
  };
})();

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeTargetWord = (text) => {
  if (text == null || text === '') return '';
  let s = String(text);

  // 0) 이미 표준 형식인 strong 쌍을 placeholder로 보호 (이중 변환 방지)
  s = s.replace(
    /<strong\b[^>]*\bclass\s*=\s*["'][^"']*\btarget-word\b[^"']*["'][^>]*>([\s\S]*?)<\/strong\s*>/gi,
    (_, inner) => `${OPEN}${inner}${CLOSE}`
  );

  // 1) Anki cloze
  s = s.replace(
    /\{\{c\d+::([\s\S]+?)(?:::[^}]*)?\}\}/g,
    (_, inner) => `${OPEN}${inner}${CLOSE}`
  );

  // 2) Markdown ** ** / __ __
  s = s.replace(/\*\*([\s\S]+?)\*\*/g, (_, inner) => `${OPEN}${inner}${CLOSE}`);
  s = s.replace(/__([\s\S]+?)__/g, (_, inner) => `${OPEN}${inner}${CLOSE}`);

  // 3) 강조 의도 HTML 태그 쌍 매칭
  const emphasisTags = ['b', 'strong', 'u', 'em', 'i', 'mark'];
  for (const tag of emphasisTags) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
    s = s.replace(re, (_, inner) => `${OPEN}${inner}${CLOSE}`);
  }

  // 4) span: 강조 의도(style/class)만 placeholder, 일반 span은 내용만 보존
  s = s.replace(
    /<span\b([^>]*)>([\s\S]*?)<\/span\s*>/gi,
    (_, attrs = '', inner = '') => {
      const lower = attrs.toLowerCase();
      if (
        lower.includes('font-weight') ||
        lower.includes('bold') ||
        lower.includes('color') ||
        lower.includes('background') ||
        lower.includes('class=')
      ) {
        return `${OPEN}${inner}${CLOSE}`;
      }
      return inner;
    }
  );

  // 5) <br> → 공백
  s = s.replace(/<br\s*\/?>/gi, ' ');

  // 6) 그 외 모든 HTML 태그 제거
  s = s.replace(/<[^>]+>/g, '');

  // 7) HTML 엔티티 디코딩
  s = decodeEntities(s);

  // 8) placeholder → 실제 strong
  s = s
    .replaceAll(OPEN, '<strong class="target-word">')
    .replaceAll(CLOSE, '</strong>');

  // 9) 빈 strong 제거 + 연속 공백 정리
  s = s.replace(/<strong class="target-word">\s*<\/strong>/g, '');
  s = s.replace(/[ \t]+/g, ' ').trim();
  return s;
};

// String.prototype.replaceAll 폴백 (구형 환경 대응)
if (!String.prototype.replaceAll) {
  // eslint-disable-next-line no-extend-native
  String.prototype.replaceAll = function (search, replace) {
    return this.split(search).join(replace);
  };
}
