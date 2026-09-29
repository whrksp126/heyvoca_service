
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

/*
  빈칸 채우기(fillInTheBlank) — 2026-09-29 재작업. 실제 화면(FillInTheBlankQuestion)은
  "문장 속 빈칸 하나" + "세로로 쌓인 보기 버튼 목록"이다(가로 칩 3개가 아니라 폭 넓은 버튼이
  위아래로 쌓인 형태). 문장 만들기와 실루엣이 겹치던 원인 두 가지 — ① 빈칸이 여러 개처럼
  보이는 점, ② 보기를 가로 칩 3개로 그려 조립 타일처럼 보이던 점 — 을 없앤다: 빈칸은 문장
  줄에 "딱 하나"만 두고, 그 아래엔 넓고 납작한 보기 막대 2개를 세로로 쌓아(둘째는 테두리만)
  실제 세로 버튼 목록임을 분명히 한다. 화살표는 그중 선택된(채워진) 막대 하나만 가리켜
  "여러 후보 중 하나로 이 빈칸을 채운다"는 관계를 유지한다.
*/
export const BlankGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    {/* 문장 — 빈칸은 이 줄에 하나뿐 */}
    <rect x="3" y="8" width="7" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
    <rect x="11" y="8" width="4" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
    <rect x="17" y="6" width="13" height="9" rx="2.4" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 2.2" />
    <rect x="32" y="8" width="9" height="5" rx="2.5" fill="currentColor" opacity="0.5" />

    {/* 빈칸 → 선택된 보기로 이어지는 화살표(그 보기 하나만 가리킨다) */}
    <path d="M22 21.6 L22 16.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M19.3 19.3 L22 16 L24.7 19.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

    {/* 보기 막대 2개 — 세로로 쌓인 폭 넓은 버튼(가로 칩 아님). 위(선택됨)만 채운다 */}
    <rect x="5" y="23" width="34" height="7" rx="3.5" fill="currentColor" />
    <rect x="5" y="32.5" width="34" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
  </svg>
);

/*
  문장 만들기(sentenceArrange) — 2026-09-29 재작업. 실제 화면(ArrangeTray)은 문장 자리에
  "여러 칸(슬롯)"이 나란히 있고, 앞쪽은 이미 조각(칩)으로 채워졌고 다음 빈 칸만 밑줄로
  비어 있는 모습 + 아래 남은 조각 은행이다. 빈칸 채우기(칸 1개 + 세로 버튼 목록)와
  실루엣이 겹치지 않도록: 화살표를 없애고, 슬롯을 여러 개 나란히 이어 그려 "조립 중"인
  느낌을 낸다. 은행 조각은 살짝 기운 낱개 칩으로 남겨 "아직 놓지 않은 조각"임을 드러낸다.
*/
export const ArrangeGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    {/* 문장 앞부분(고정 텍스트) */}
    <rect x="3" y="8" width="6" height="5" rx="2.5" fill="currentColor" opacity="0.5" />

    {/* 슬롯 3칸이 나란히 — 앞 두 칸은 이미 채운 칩, 마지막 칸만 다음에 채울 빈 밑줄 */}
    <rect x="11" y="6.4" width="8.4" height="7.6" rx="2" fill="currentColor" />
    <rect x="20.8" y="6.4" width="8.4" height="7.6" rx="2" fill="currentColor" opacity="0.72" />
    <path d="M30.6 13.2h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 2.2" />

    {/* 문장 끝 마침표 */}
    <circle cx="40.6" cy="12.7" r="1.1" fill="currentColor" opacity="0.5" />

    {/* 아래 조각 은행 — 아직 놓지 않은 낱개 칩 2개, 살짝 기울여 "은행"임을 드러낸다 */}
    <rect x="6" y="26" width="13" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.3" opacity="0.55" transform="rotate(-6 12.5 29.5)" />
    <rect x="25" y="26" width="13" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.3" opacity="0.55" transform="rotate(5 31.5 29.5)" />

    {/* 확인 버튼 자리 — 슬롯을 다 채워야 활성화되는 하단 CTA */}
    <rect x="4" y="37" width="36" height="4.4" rx="2.2" fill="currentColor" opacity="0.28" />
  </svg>
);

/*
  듣고 배열(listenArrange) — 문장 만들기와 같은 화면(ArrangeTray)을 스피커로 듣고 채우는
  변형이다. 문장 앞부분 고정 텍스트 대신 스피커(음파)를 두고, 슬롯 3칸 + 은행 구도는
  ArrangeGlyph와 그대로 맞춘다(같은 유형 계열임을 한눈에 알 수 있게).
*/
export const ListenArrangeGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    {/* 스피커(음파) — ArrangeGlyph의 고정 텍스트 자리를 대신한다 */}
    <rect x="2" y="9.4" width="3" height="4.2" rx="1" fill="currentColor" />
    <path d="M5 9.4 L9.2 6.2 L9.2 16.6 L5 13.6 Z" fill="currentColor" />
    <path d="M11.6 7.6a5.4 5.4 0 0 1 0 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M9.9 9.5a2.8 2.8 0 0 1 0 4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />

    {/* 슬롯 3칸 — ArrangeGlyph와 동일 구도(앞 두 칸 채움 + 마지막 칸 빈 밑줄) */}
    <rect x="16" y="6.4" width="8.4" height="7.6" rx="2" fill="currentColor" />
    <rect x="25.8" y="6.4" width="8.4" height="7.6" rx="2" fill="currentColor" opacity="0.72" />
    <path d="M35.6 13.2h5.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 2.2" />

    {/* 아래 조각 은행 */}
    <rect x="6" y="26" width="13" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.3" opacity="0.55" transform="rotate(-6 12.5 29.5)" />
    <rect x="25" y="26" width="13" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.3" opacity="0.55" transform="rotate(5 31.5 29.5)" />

    <rect x="4" y="37" width="36" height="4.4" rx="2.2" fill="currentColor" opacity="0.28" />
  </svg>
);

/*
  빈칸 직접 입력(fillInTheBlankTyping) — 2026-09-29 재작업. 선택지가 아예 없다(키보드로
  타이핑)는 차이를 분명히 하려고, 아래를 칩 줄이 아니라 누가 봐도 "키보드"인 형태로 바꿨다 —
  둥근 사각 틀로 전체를 감싸고 그 안에 촘촘한 미니 키 2행 + 넓은 스페이스바를 넣는다.
  위 빈칸은 점선 상자가 아니라 실선 입력칸 + 이미 두 글자를 타이핑한 자리(작은 획 2개) +
  깜빡이는 커서(I-beam)로 "직접 입력 중"임을 드러낸다.
*/
export const TypingGlyph = ({ className = '', size = 44 }) => (
  <svg {...base(size, className)}>
    {/* 문장 — 실선 입력칸 하나(빈칸 채우기의 점선 상자와 구분) */}
    <rect x="3" y="8" width="7" height="5" rx="2.5" fill="currentColor" opacity="0.5" />
    <rect x="15" y="5.5" width="14" height="7.5" rx="2.2" stroke="currentColor" strokeWidth="1.5" />
    {/* 이미 타이핑한 글자 자리 2개 + 깜빡이는 커서 */}
    <path d="M18 8v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
    <path d="M20.6 8v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
    <path d="M23.6 7.3v4.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <rect x="31" y="8" width="10" height="5" rx="2.5" fill="currentColor" opacity="0.5" />

    {/* 키보드 틀 — 칩과 다르게 하나의 사각 프레임 안에 작은 키 격자를 촘촘히 담는다 */}
    <rect x="3" y="23.5" width="38" height="17.5" rx="3.2" stroke="currentColor" strokeWidth="1.3" opacity="0.7" />
    {/* 1행 · 2행 — 작고 촘촘한 미니 키 6개씩(가로 칩과 달리 rx 작고 간격 좁음) */}
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={`r1-${i}`} x={5.3 + i * 5.7} y="26.3" width="4.9" height="3.4" rx="0.8" stroke="currentColor" strokeWidth="1" opacity="0.55" />
    ))}
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={`r2-${i}`} x={5.3 + i * 5.7} y="30.7" width="4.9" height="3.4" rx="0.8" stroke="currentColor" strokeWidth="1" opacity="0.55" />
    ))}
    {/* 스페이스바 — 넓은 단일 키, 채워서 강조 */}
    <rect x="6.3" y="35.5" width="31.4" height="3.6" rx="1.5" fill="currentColor" />
  </svg>
);
