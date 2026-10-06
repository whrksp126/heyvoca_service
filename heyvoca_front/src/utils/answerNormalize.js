/*
  직접 입력 채점 정규화 — 단일 소스. 직접 입력형 문제는 비교 전에 반드시 여기 함수를 거친다.

  표기만 다른 입력(part-time / part time / Part-Time / parttime / " part-time. ")은 같은 답으로 본다.
  - 아포스트로피 변형은 `'` 로 통일하되 지우지 않는다 — its / it's 는 다른 단어다.
  - 공백(전각 포함)·하이픈/대시류·마침표·쉼표·느낌표·물음표·세미콜론·콜론·따옴표·일본어 구두점은 모두 제거한다.
  - 주의: 가타카나 장음 부호 `ー`(U+30FC)는 하이픈이 아니다. 지우면 일본어 입력형
    (コーヒー → コヒ)이 깨지므로 아래 하이픈 범위(U+2010~U+2015, U+2212)에 절대 넣지 말 것.
*/

const APOSTROPHE_RE = /[’‘ʼ`´＇′]/g;
// 제거 대상 — 공백류(\s 는 전각 공백 U+3000 포함), 하이픈/대시류, 문장부호, 일본어 구두점.
const STRIP_RE = /[\s\-‐-―−.,!?;:"“”。、・]/g;

// 아포스트로피 통일은 NFKC 보다 먼저 — `´`(U+00B4)는 NFKC 에서 공백+결합 문자로 풀려 버린다.
export const answerKey = (s) => String(s ?? '')
  .replace(APOSTROPHE_RE, "'")
  .normalize('NFKC')
  .trim()
  .toLowerCase()
  .replace(STRIP_RE, '');

export const isSameAnswer = (a, b) => {
  const ka = answerKey(a);
  const kb = answerKey(b);
  return ka !== '' && kb !== '' && ka === kb;
};

// 표기까지 똑같이 썼는지 — "정확한 표기 …" 안내 분기에 쓴다.
// 아포스트로피 종류·앞뒤 문장부호(끝의 마침표 등)만 다른 것은 같은 표기로 본다 — 단어 안의
// 하이픈/공백 차이일 때만 안내가 뜨게.
const EDGE_PUNCT_RE = /^[\s.,!?;:"“”。、・]+|[\s.,!?;:"“”。、・]+$/g;
const surface = (s) => String(s ?? '')
  .replace(APOSTROPHE_RE, "'")
  .normalize('NFKC')
  .toLowerCase()
  .replace(EDGE_PUNCT_RE, '');
export const isSameSurface = (a, b) => surface(a) === surface(b);
