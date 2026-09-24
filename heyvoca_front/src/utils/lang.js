/*
  학습 언어 헬퍼 — 일본어 학습 연동(INTEGRATION_SPEC.md 1·5절)의 프론트 단일 소스.

  - 언어 코드: 'en'(영어, 기본) / 'ja'(일본어).
  - 단어/예문의 TTS·표시 언어는 하드코딩 'en' 대신 wordLang(word) 로 정한다.
  - 현재 학습 언어(learningLang)는 UserContext 가 관리하고, React 밖(api/tts.jsx 등)에서도
    쓸 수 있도록 여기 모듈 변수에 동기화한다(setActiveLearningLang). 서버는 현재 학습 언어의
    데이터만 돌려주므로, language 필드가 빠진 객체의 기본값으로 이 값을 쓰는 것이 안전하다.
*/

export const SUPPORTED_LEARNING_LANGS = ['en', 'ja'];
export const DEFAULT_LEARNING_LANG = 'en';

// 표시명 — 이모지·국기 금지(디자인 규칙).
export const LANG_LABEL = { en: '영어', ja: '일본어' };

// 한 글자 표지 — 방향 배지·문제 유형 픽토그램에서 "학습 언어"를 가리키는 글자.
export const LANG_GLYPH = { en: 'Aa', ja: 'あ' };

// TTS 가 허용하는 언어(학습 언어 + 한국어 뜻).
export const SUPPORTED_TTS_LANGS = ['en', 'ko', 'ja'];

export const isSupportedLearningLang = (lang) => SUPPORTED_LEARNING_LANGS.includes(lang);
export const isSupportedTtsLang = (lang) => SUPPORTED_TTS_LANGS.includes(lang);

export const normalizeLearningLang = (lang) =>
  (isSupportedLearningLang(lang) ? lang : DEFAULT_LEARNING_LANG);

// ── 현재 학습 언어(모듈 동기화) ──────────────────────────────────────
let activeLearningLang = DEFAULT_LEARNING_LANG;

export const getActiveLearningLang = () => activeLearningLang;

// UserContext 전용 — 프로필 로드/전환 시 호출한다.
export const setActiveLearningLang = (lang) => {
  activeLearningLang = normalizeLearningLang(lang);
};

// 단어(또는 문제/예문을 품은 객체)의 언어.
// word.language 우선, 없으면 fallback(생략 시 현재 학습 언어).
export const wordLang = (word, fallback) => {
  const lang = word && typeof word === 'object' ? word.language : undefined;
  if (isSupportedLearningLang(lang)) return lang;
  return fallback ?? activeLearningLang;
};

export const isJa = (lang) => lang === 'ja';
