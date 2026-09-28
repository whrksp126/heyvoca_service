
import { LANG_GLYPH } from '../../utils/lang';

/**
 * 테스트 설정 '문제 유형' 타일의 픽토그램 — currentColor 선/면으로만 그려 타일의
 * 선택/비선택 글자색을 그대로 따른다. 장식이라 aria-hidden.
 */
const base = (size, className) => ({
  width: size,
  height: size,
  viewBox: '0 0 44 44',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
  className,
});

/** 사지선다 — 위 'Aa'(일본어 학습이면 'あ') 카드 + 아래 선택지 막대 3개(첫 번째만 채움) */
export const McqGlyph = ({ className = '', size = 44, lang = 'en' }) => (
  <svg {...base(size, className)}>
    <rect x="6" y="4" width="32" height="14" rx="4" stroke="currentColor" strokeWidth="1.6" />
    <text
      x="22" y="14.2" textAnchor="middle" fill="currentColor"
      fontSize="9" fontWeight="700" fontFamily="inherit"
    >{LANG_GLYPH[lang] ?? LANG_GLYPH.en}</text>
    <rect x="6" y="23" width="32" height="5" rx="2.5" fill="currentColor" />
    <rect x="6.8" y="31.8" width="30.4" height="3.4" rx="1.7" stroke="currentColor" strokeWidth="1.6" />
    <rect x="6.8" y="38.8" width="20" height="3.4" rx="1.7" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/** 카드 맞추기 — 2×2 카드, 대각선 두 장이 채워져 있고 점선으로 이어진다 */
export const CardMatchGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    <rect x="5" y="8" width="16" height="12" rx="3" fill="currentColor" />
    <rect x="23.8" y="8.8" width="14.4" height="10.4" rx="2.6" stroke="currentColor" strokeWidth="1.6" />
    <rect x="5.8" y="24.8" width="14.4" height="10.4" rx="2.6" stroke="currentColor" strokeWidth="1.6" />
    <rect x="23" y="24" width="16" height="12" rx="3" fill="currentColor" />
    <path
      d="M13 20 C 16 30, 28 14, 31 24"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.6 2.6"
    />
  </svg>
);

/** 빈칸 채우기 — 짧은 막대, 점선 빈칸, 아래 막대 2개(두 번째가 짧다) */
export const BlankGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    <rect x="6" y="9" width="12" height="5" rx="2.5" fill="currentColor" />
    <rect
      x="21.8" y="6.8" width="16" height="11" rx="2.6"
      stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.6 2.4"
    />
    <rect x="6" y="24" width="32" height="5" rx="2.5" fill="currentColor" />
    <rect x="6" y="33" width="20" height="5" rx="2.5" fill="currentColor" />
  </svg>
);

/** 문장 만들기(조립) — 위에 짧은 문장 막대 하나, 아래에 서로 다른 크기의 조각 블록 3개
    (가운데 조각만 점선 테두리로 "아직 안 놓인 조각"을 암시) */
export const ArrangeGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    <rect x="6" y="7" width="26" height="5" rx="2.5" fill="currentColor" />
    <rect x="6.8" y="25.8" width="9.4" height="10.4" rx="2.6" stroke="currentColor" strokeWidth="1.6" />
    <rect
      x="18.2" y="25.8" width="9.4" height="10.4" rx="2.6"
      stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.2"
    />
    <rect x="29.6" y="25.8" width="8.4" height="10.4" rx="2.6" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/** 듣고 받아쓰기 — 좌우 스피커 카드 2장(하나는 작게 "0.7" 배지) + 아래 조각 블록 2개 */
export const ListenArrangeGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    <rect x="5.8" y="5.8" width="14.4" height="12.4" rx="3.2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M11 9.6v5.2l2.6-1.7v-1.8z" fill="currentColor" />
    <path d="M15 10.4a2.6 2.6 0 0 1 0 3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
    <rect x="23.8" y="5.8" width="14.4" height="12.4" rx="3.2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M29 9.6v5.2l2.6-1.7v-1.8z" fill="currentColor" />
    <text x="35.5" y="19.6" textAnchor="middle" fill="currentColor" fontSize="6.5" fontWeight="800">0.7</text>
    <rect x="6.8" y="27.8" width="14.4" height="8.4" rx="2.4" stroke="currentColor" strokeWidth="1.6" />
    <rect x="23.8" y="27.8" width="13.4" height="8.4" rx="2.4" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.2" />
  </svg>
);

/** 빈칸 직접 입력 — 점선 빈칸 안에 입력 커서(I-beam), 아래 키보드 키 3개 */
export const TypingGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    <rect x="6" y="9" width="12" height="5" rx="2.5" fill="currentColor" />
    <rect
      x="21.8" y="6.8" width="16" height="11" rx="2.6"
      stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.6 2.4"
    />
    <path d="M29.8 9.4v5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="6.8" y="25.8" width="8.4" height="8.4" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="17.8" y="25.8" width="8.4" height="8.4" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <rect x="28.8" y="25.8" width="8.4" height="8.4" rx="2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
