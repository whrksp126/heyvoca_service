// meaningConcept.js — "유사 뜻(같은 개념) 그룹" 판정 단일 소스.
//
// 배경: 객관식 문제에서 정답과 오답의 뜻이 같거나 매우 비슷하면(achieve '이루다' /
// attain '이루다') 사용자가 억울하게 틀린다. 백엔드가 사전 뜻마다 concept_id(같은 그룹 =
// 같은/유사한 뜻)를 심어 내려주고, 이 모듈은 그 concept_id 교집합 또는(폴백으로) 정규화된
// 뜻 문자열 교집합으로 "두 단어가 뜻이 겹치는지"를 판정한다.
//
// normalizeMeaning의 규칙은 heyvoca_back/app/services/meaning_concept.py의 normalize_meaning과
// 반드시 동일해야 한다(정본은 백엔드 파일 — 여기는 그대로 이식한 것).

// 괄호 그룹(설명 부연) 제거 — (...) / [...] / （...）
const PAREN_RE = /\([^)]*\)|\[[^\]]*\]|（[^）]*）/g;

// 조사 목록 — '~을', '…에게' 처럼 물결/말줄임표 뒤가 조사인 토큰만 통째로 제거한다.
const PARTICLES = [
  '을', '를', '이', '가', '에', '에게', '의', '으로', '로', '와', '과', '에서',
  '부터', '까지', '도', '은', '는', '한테', '처럼', '보다', '에도', '이라고',
  '라고', '에게서', '으로부터', '로부터', '과의', '와의', '에의', '으로서',
  '로서', '으로써', '로써',
];

const PARTICLES_ALT = [...PARTICLES].sort((a, b) => b.length - a.length).join('|');

// '~을' '…에게' 같은 조사 플레이스홀더 토큰 제거 (문장 시작 또는 공백 뒤에서만 매치)
const TILDE_TOKEN_RE = new RegExp(
  `(?:^|(?<=\\s))(?:~|…|\\.\\.\\.)(?:${PARTICLES_ALT})(?=\\s|$)`,
  'g'
);

// 구두점 제거
const PUNCT_RE = /[.,;:!?'"‘’“”·/\-–—ㆍ]/g;

/**
 * 뜻 문자열 정규화 — 표기 차이를 흡수해 동일/유사 뜻 비교에 쓴다.
 *
 * 순서: NFKC 정규화+lower → 괄호 그룹 제거 → '~을'처럼 조사가 붙은 물결/말줄임
 * 토큰 제거(그 외 물결/말줄임은 문자만 지우고 뒤 내용은 유지) → 구두점 제거
 * → 공백 전부 제거. 결과가 비면 원문 trim 반환.
 *
 * 백엔드 app/services/meaning_concept.py의 normalize_meaning과 동일 규칙(단일 소스).
 */
export const normalizeMeaning = (str) => {
  const original = str;
  let s = (str || '').normalize('NFKC').trim().toLowerCase();
  s = s.replace(PAREN_RE, ' ');
  s = s.replace(TILDE_TOKEN_RE, ' ');       // '~을' '…에게' 같은 조사 플레이스홀더 토큰 제거
  s = s.replace(/~/g, ' ').replace(/…/g, ' '); // 남은 물결/말줄임은 지우고 뒤 내용은 유지
  s = s.replace(PUNCT_RE, ' ');
  s = s.replace(/\s+/g, '');
  return s || (original || '').trim();
};

// meanings 배열(문자열 또는 {meaning: string} 객체 혼용) → 정규화된 문자열 distinct 리스트.
const normalizedMeaningsForWord = (meanings) => {
  const norms = [];
  for (const m of meanings ?? []) {
    const text = typeof m === 'string' ? m : m?.meaning;
    if (!text) continue;
    const n = normalizeMeaning(text);
    if (n && !norms.includes(n)) norms.push(n);
  }
  return norms;
};

/**
 * 단어 객체에서 concept_id distinct 리스트를 뽑는다.
 *
 * 데이터 소스별 실제 필드명이 다르다:
 *  - /study/recommend, /study/chat-session 응답을 옮겨 실은 단어: concept_ids (배열)
 *  - /vocaIndexs, /vocaIndexs/<id>/vocaBooks/<id> 응답을 옮겨 실은 단어: conceptIds (배열)
 *  - VocabularyContext의 vocabularySheets 파생 단어: 단어장 병합 시 vocaBooks[i].conceptIds가
 *    그대로 word.conceptIds로 복사된다(context/VocabularyContext.jsx 참고)
 *  - 병합 전 원본 사전 단어(word.vocaBooks[])만 갖고 있는 경우: 각 vocaBooks 항목의
 *    conceptIds를 모아 단어 단위로 합친다(distinct)
 *  - 사용자 직접 생성 단어 등 사전 미연결 단어는 빈 배열([]) → 정규화 뜻 비교로 폴백
 */
export const getWordConceptIds = (word) => {
  const ids = [];
  const pushAll = (arr) => {
    for (const id of arr ?? []) {
      if (id !== null && id !== undefined && !ids.includes(id)) ids.push(id);
    }
  };

  if (Array.isArray(word?.concept_ids)) pushAll(word.concept_ids);
  if (Array.isArray(word?.conceptIds)) pushAll(word.conceptIds);
  if (Array.isArray(word?.vocaBooks)) {
    for (const vb of word.vocaBooks) {
      if (Array.isArray(vb?.conceptIds)) pushAll(vb.conceptIds);
    }
  }
  return ids;
};

/**
 * 두 단어가 뜻이 겹치는지 판정.
 *
 * concept_id 교집합이 있으면 겹침. concept_id가 없는(사전 미연결/사용자 생성) 경우는
 * 정규화된 뜻 문자열 교집합으로 폴백한다. (백엔드 words_overlap과 동일 규칙)
 */
export const wordsOverlap = (a, b) => {
  const aConcepts = getWordConceptIds(a);
  const bConcepts = getWordConceptIds(b);
  if (aConcepts.length > 0 && bConcepts.length > 0) {
    if (aConcepts.some((id) => bConcepts.includes(id))) return true;
  }

  const aNorms = normalizedMeaningsForWord(a?.meanings);
  const bNorms = normalizedMeaningsForWord(b?.meanings);
  if (aNorms.length > 0 && bNorms.length > 0) {
    if (aNorms.some((n) => bNorms.includes(n))) return true;
  }

  return false;
};
