
import { LANG_GLYPH } from '../../utils/lang';

/**
 * 테스트 설정 '문제 유형' 타일의 픽토그램 — currentColor 선/면(+opacity로만 명암 구분)으로
 * 그려 타일의 선택/비선택 글자색을 그대로 따른다. 장식이라 aria-hidden.
 *
 * 2026-09 개편: "아이콘만 보고 무슨 문제인지 모르겠다"는 피드백으로, 추상적인 막대/블록
 * 대신 실제 문제 화면을 축소한 미니어처로 다시 그렸다(문항 카드 · 보기 · 빈칸 · 화살표 등
 * 그 문제 유형에서만 나오는 요소를 그대로 재현).
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

/** 사지선다 — 위 단어 카드('Aa'/언어별 글자) + 아래 보기 4줄, 첫 줄만 라디오 체크 + 하이라이트 */
export const McqGlyph = ({ className = '', size = 44, lang = 'en' }) => (
  <svg {...base(size, className)}>
    <rect x="9" y="3" width="26" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
    <text
      x="22" y="10.4" textAnchor="middle" fill="currentColor"
      fontSize="7.2" fontWeight="700" fontFamily="inherit"
    >{LANG_GLYPH[lang] ?? LANG_GLYPH.en}</text>

    {/* 1번 보기 — 선택됨(체크 + 하이라이트) */}
    <circle cx="8.6" cy="18.6" r="2.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M7.4 18.6l0.9 1 1.7-2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="13.6" y="16.4" width="24.4" height="4.4" rx="2.2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.3" />

    {/* 2~4번 보기 — 비선택 */}
    <circle cx="8.6" cy="25.3" r="2.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    <rect x="13.6" y="23.1" width="24.4" height="4.4" rx="2.2" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    <circle cx="8.6" cy="32" r="2.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    <rect x="13.6" y="29.8" width="24.4" height="4.4" rx="2.2" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    <circle cx="8.6" cy="38.7" r="2.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    <rect x="13.6" y="36.5" width="24.4" height="4.4" rx="2.2" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
  </svg>
);

/** 카드 맞추기 — 2×2 카드 중 짝지어진 두 장(단어 라인 있음)을 점선으로 잇고, 가운데 확인 배지 */
export const CardMatchGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    {/* 맞춰진 카드 쌍 — 좌상단 ↔ 우하단 */}
    <rect x="5" y="5" width="15" height="13" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <rect x="9" y="10.3" width="7" height="2.4" rx="1.2" fill="currentColor" />
    <rect x="24" y="26" width="15" height="13" rx="3" stroke="currentColor" strokeWidth="1.6" />
    <rect x="28" y="31.3" width="7" height="2.4" rx="1.2" fill="currentColor" />

    {/* 아직 안 맞춘 카드 — 우상단, 좌하단(면이 비어 있는 뒷면) */}
    <rect x="24" y="5" width="15" height="13" rx="3" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.4 2.2" opacity="0.45" />
    <rect x="5" y="26" width="15" height="13" rx="3" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.4 2.2" opacity="0.45" />

    {/* 매칭 연결선 + 확인 배지 */}
    <path d="M18.5 16.5 C 19 20, 25 24, 25.5 27.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.2 2" />
    <circle cx="18.5" cy="16.5" r="1.5" fill="currentColor" />
    <circle cx="25.5" cy="27.5" r="1.5" fill="currentColor" />
    <circle cx="22" cy="22" r="3.6" stroke="currentColor" strokeWidth="1.3" fill="none" />
    <path d="M20.2 22.1l1.2 1.3 2.3-2.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** 빈칸 채우기(고르기) — 문장 중간 빈칸 + 보기 칩 3개, 가운데 칩이 빈칸으로 올라가는 화살표 */
export const BlankGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    <rect x="4" y="7" width="9" height="5" rx="2.5" fill="currentColor" opacity="0.55" />
    <rect x="15" y="5.5" width="13" height="7.5" rx="2.2" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.4 2.2" />
    <rect x="30" y="7" width="10" height="5" rx="2.5" fill="currentColor" opacity="0.55" />

    <rect x="4" y="31" width="10" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
    <rect x="17" y="31" width="11" height="7" rx="3.5" fill="currentColor" />
    <rect x="30" y="31" width="10" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />

    <path d="M22.5 30.5 C 22 25.5, 21.5 19, 21.3 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M18.6 18.3 L21.3 14.3 L24 18.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/*
  문장 만들기(sentenceArrange) — 2026-09-29 QA로 다시 그렸다. 예전엔 흩어진 조각 3개가
  화살표를 거쳐 완성된 막대 문장으로 바뀌는 추상적인 그림이라 "무슨 문제인지 모르겠다"는
  지적을 받았다. 지금은 실제 화면 그대로: 위에 문장(회색 낱말 선들) 중앙에 점선/밑줄 빈칸이
  있고, 아래 선택지 칩 중 하나(가운데, 채워진 칩)가 화살표를 따라 그 빈칸으로 올라가
  채워지는 순간을 그린다. BlankGlyph(빈칸 채우기·고르기)와 구도는 비슷하지만 빈칸을
  박스가 아니라 밑줄+슬롯 눈금으로, 선택지를 폭 넓은 보기줄이 아니라 조립 칩(살짝 기운
  타일)으로 그려 두 유형을 구분한다.
*/
export const ArrangeGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    {/* 문장 — 빈칸 앞뒤 낱말 */}
    <rect x="3" y="8" width="8" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
    <rect x="12" y="8" width="4" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
    <rect x="31" y="8" width="9" height="5" rx="2.5" fill="currentColor" opacity="0.5" />

    {/* 빈칸 — 밑줄 슬롯(양끝 눈금 + 점선 밑줄) */}
    <path d="M18 10.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    <path d="M28 10.5v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
    <path d="M18 14.2h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 2.2" />

    {/* 빈칸으로 올라가는 화살표 */}
    <path d="M22.5 30 C 22 25, 21.8 19, 22 15.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M19.2 18.3 L22 14.6 L24.8 18.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />

    {/* 선택지 칩 3개 — 가운데(선택됨)만 채우고, 조립 타일임을 드러내려 좌우는 살짝 기울인다 */}
    <rect x="4" y="31" width="10" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.3" opacity="0.55" transform="rotate(-6 9 34.5)" />
    <rect x="17" y="31" width="11" height="7" rx="3.5" fill="currentColor" />
    <rect x="30" y="31" width="10" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.3" opacity="0.55" transform="rotate(6 35 34.5)" />
  </svg>
);

/** 듣고 받아쓰기 — 스피커(음파) + 아래 조각 3개(가운데가 이미 배열된 정답 자리) */
export const ListenArrangeGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    <rect x="9" y="15" width="5" height="8" rx="1.2" fill="currentColor" />
    <path d="M14 15 L21 9.5 L21 28.5 L14 23 Z" fill="currentColor" />
    <path d="M25 13.5a8 8 0 0 1 0 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M22.6 16.8a4 4 0 0 1 0 4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />

    <rect x="4" y="32" width="10" height="6" rx="2" stroke="currentColor" strokeWidth="1.3" opacity="0.55" transform="rotate(-6 9 35)" />
    <rect x="17" y="33" width="10" height="6" rx="2" fill="currentColor" />
    <rect x="30" y="32" width="10" height="6" rx="2" stroke="currentColor" strokeWidth="1.3" opacity="0.55" transform="rotate(6 35 35)" />
  </svg>
);

/** 빈칸 직접 입력 — 문장 중간 입력칸(커서 깜빡임) + 아래 미니 키보드(글자키 4 + 스페이스바) */
export const TypingGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    <rect x="4" y="7" width="9" height="5" rx="2.5" fill="currentColor" opacity="0.55" />
    <rect x="15" y="5.5" width="13" height="7.5" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M21.5 7.3v3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="30" y="7" width="10" height="5" rx="2.5" fill="currentColor" opacity="0.55" />

    <rect x="5" y="26.5" width="7.4" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
    <rect x="14.3" y="26.5" width="7.4" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
    <rect x="23.6" y="26.5" width="7.4" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
    <rect x="32.9" y="26.5" width="6.1" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
    <rect x="5" y="34.5" width="34" height="6" rx="2.4" fill="currentColor" />
  </svg>
);
