import { LANG_GLYPH } from '../../utils/lang';

/**
 * 테스트 설정 '문제 유형' 타일의 아이콘 — 2026-10-30(이슈 #21) 다시 그렸다.
 * 가로형 타일(왼쪽 아이콘 34px + 오른쪽 라벨)에 맞춰 36×36 격자에 **문제 내용 자체**를 단순하게 그린다
 * (보기 막대 · 카드 짝 · 철자 빈칸 · 문장 줄 빈칸 · 조각). 선/면은 currentColor 라 타일의 선택/비선택
 * 글자색을 그대로 따르고, 그 문제의 핵심 한 곳(ACCENT)만 옅은 primary-400 으로 칠한다. 장식이라 aria-hidden.
 */
const base = (size, className) => ({
  width: size,
  height: size,
  viewBox: '0 0 36 36',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
  className,
});

// 강조 한 곳 — 면은 이 클래스의 currentColor(primary-400)로 칠한다
const ACCENT = 'text-primary-main-400';

/** 사지선다 — 문제 막대 + 보기 막대 3개 중 하나가 골라짐 */
export const McqGlyph = ({ className = '', size = 34 }) => (
  <svg {...base(size, className)}>
    <rect x="5" y="4" width="26" height="6" rx="2" fill="currentColor" opacity=".35" />
    <rect x="5" y="13" width="26" height="5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
    <rect x="5" y="20" width="26" height="5" rx="2.5" fill="currentColor" className={ACCENT} />
    <rect x="5" y="27" width="26" height="5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/** 카드 맞추기 — 좌우 카드 2쌍 + 짝을 잇는 선 */
export const CardMatchGlyph = ({ className = '', size = 34 }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="6" width="11" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="3" y="21" width="11" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="22" y="6" width="11" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="22" y="21" width="11" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <g className={ACCENT}>
      <path d="M14 10.5 22 25.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </g>
  </svg>
);

/** 단어 쓰기 — 'ap' + 빈칸 두 개 + 커서 */
export const SpellingGlyph = ({ className = '', size = 34, lang = 'en' }) => (
  <svg {...base(size, className)}>
    <text x="2" y="22" fontSize="12" fontWeight="800" fill="currentColor" fontFamily="Menlo, monospace">
      {lang === 'ja' ? 'あい' : 'ap'}
    </text>
    <path d="M19 24h4M25 24h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <g className={ACCENT}>
      <path d="M32.5 12v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </g>
  </svg>
);

/** 빈칸 고르기 — 문장 줄의 빈칸 + 아래 보기 칩 2개(하나 골라짐) */
export const BlankGlyph = ({ className = '', size = 34 }) => (
  <svg {...base(size, className)}>
    <path d="M3 9h8M25 9h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <rect x="13" y="5" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2 1.5" />
    <rect x="4" y="21" width="12" height="8" rx="4" stroke="currentColor" strokeWidth="1.6" />
    <rect x="20" y="21" width="12" height="8" rx="4" fill="currentColor" className={ACCENT} />
  </svg>
);

/** 빈칸 쓰기 — 문장 줄의 빈칸 안에 커서 */
export const TypingGlyph = ({ className = '', size = 34 }) => (
  <svg {...base(size, className)}>
    <path d="M3 18h8M25 18h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <rect x="12" y="12" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" strokeDasharray="2 1.5" />
    <g className={ACCENT}>
      <path d="M18 14.5v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </g>
  </svg>
);

/** 문장 조립 — 줄에 놓인 조각들 + 아래에서 올라가는 조각 하나 */
export const ArrangeGlyph = ({ className = '', size = 34 }) => (
  <svg {...base(size, className)}>
    <rect x="3" y="7" width="9" height="7" rx="2" fill="currentColor" opacity=".35" />
    <rect x="14" y="7" width="12" height="7" rx="2" fill="currentColor" opacity=".35" />
    <path d="M28 10.5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M17 16.5v3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <rect x="11" y="22" width="12" height="7" rx="2" fill="currentColor" className={ACCENT} />
  </svg>
);

/** 해석 조립 — 외국어(Aa/あ) → 한국어 '가' 조각 */
export const TranslateGlyph = ({ className = '', size = 34, lang = 'en' }) => (
  <svg {...base(size, className)}>
    <text x="2" y="15" fontSize="11" fontWeight="800" fill="currentColor">{LANG_GLYPH[lang] ?? LANG_GLYPH.en}</text>
    <path d="M19 11h6m-2.5-2.5L25 11l-2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <g className={ACCENT}>
      <rect x="4" y="21" width="12" height="9" rx="2" fill="currentColor" />
    </g>
    <text x="10" y="28.4" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="currentColor">가</text>
    <rect x="19" y="21" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
